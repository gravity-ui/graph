import { GraphClassConstructor } from "../utils/types/classes";

import { DetachedUpdates } from "./DetachedUpdates";
import type { TDetachedEntry } from "./DetachedUpdates";
import { Scheduler } from "./Scheduler";
import { ITree, Tree } from "./Tree";
import type { TTileRect } from "./culling/TileIndex";
import type { TTreeCullingOptions } from "./culling/TreeCulling";
import { isDevelopmentBuild, warnDetachedFrameHooks } from "./detachedWarning";

export type ComponentOptions<Instance> = {
  readonly key?: string | number;
  readonly ref?: ((instance: Instance) => void) | string;
};

export type TCoreComponent = CoreComponent<CoreComponentProps, CoreComponentContext>;
export type ComponentConstructor = GraphClassConstructor<CoreComponent>;
export type ComponentProps<C extends ComponentConstructor> = ConstructorParameters<C>[0];
type OptionalFactoryProps<C extends ComponentConstructor> =
  [] extends ConstructorParameters<C> ? true : {} extends ComponentProps<C> ? true : false;
type DescriptorProps<C extends ComponentConstructor> =
  | ComponentProps<C>
  | (OptionalFactoryProps<C> extends true ? undefined : never);

// A private member keeps spread copies from recreating a checked descriptor structurally.
// The readonly view prevents consumers from changing its class/props/ref after type erasure.
class CheckedDescriptor<Props, C extends ComponentConstructor, Instance> {
  private declare readonly descriptorBrand: void;

  constructor(
    public readonly props: Readonly<Props>,
    public readonly options: ComponentOptions<Instance>,
    public readonly klass: C
  ) {}
}

export type ComponentDescriptor<C extends ComponentConstructor> = CheckedDescriptor<
  DescriptorProps<C>,
  C,
  InstanceType<C>
>;

/** Heterogeneous children erase class-specific props and refs only after factory validation. */
export type ChildDescriptor = CheckedDescriptor<CoreComponentProps | undefined, ComponentConstructor, never>;

type FactoryArguments<C extends ComponentConstructor> =
  OptionalFactoryProps<C> extends true
    ? [props?: ComponentProps<NoInfer<C>>, options?: ComponentOptions<InstanceType<NoInfer<C>>>]
    : [props: ComponentProps<NoInfer<C>>, options?: ComponentOptions<InstanceType<NoInfer<C>>>];

type TPrivateComponentData = {
  parent: CoreComponent | undefined;
  treeNode: Tree;
  context: {
    scheduler: Scheduler;
    globalIterateId: number;
    /** Queue of the detached components of this tree. */
    detachedUpdates: DetachedUpdates;
  };
  children: Map<string, CoreComponent>;
  childrenKeys: string[];
  prevChildrenArr: ChildDescriptor[];
  stringRef: string | undefined;
  updated: boolean;
  iterateId: number;
  /** The component's queue entry when its class is detached. */
  detached: TDetachedEntry | undefined;
  unmounted: boolean;
};

export type CoreComponentProps = Record<string, unknown>;
export type CoreComponentContext = Record<string, unknown>;

function createDefaultPrivateContext(): TPrivateComponentData["context"] {
  return {
    scheduler: new Scheduler(),
    globalIterateId: 0,
    detachedUpdates: new DetachedUpdates(),
  };
}

/** Whether a component class declares itself detached (see CoreComponent.detached). */
function isDetachedClass(klass: unknown): boolean {
  return (klass as { detached?: unknown }).detached === true;
}

export class CoreComponent<
  Props extends CoreComponentProps = CoreComponentProps,
  Context extends CoreComponentContext = CoreComponentContext,
> implements ITree
{
  /**
   * Detached components stay children of their parent: it creates, updates and unmounts them, and they receive its
   * context. The frame does not walk them: they never receive `iterate()`, `render()`, `willRender()`, `didRender()`,
   * `willNotRender()`, `didIterate()` or `viewportChanged()`. A change queues the component, and its tree applies the
   * update (`checkData()`, `willIterate()`, children) once per frame before painting, so unchanged detached
   * components cost a frame nothing. Their children must be detached too, and a root cannot be detached.
   * Subclasses inherit the flag; `static detached = false` puts a subclass back into the walk.
   */
  public static readonly detached: boolean = false;

  public $: Record<string, CoreComponent | undefined> = Object.create(null);

  public context: Context = {} as Context;

  public props: Props = {} as Props;

  protected __comp: TPrivateComponentData;

  /**
   * Set by prepareUpdate() and consumed by iterate(): a repeated preparation before this component
   * paints, for example an explicit call followed by the tree's own, does not run its update again.
   * A new update request clears it, so data queued after a preparation is applied by the next one.
   */
  protected updatePrepared = false;

  public get zIndex() {
    return this.__comp.treeNode.zIndex;
  }

  public set zIndex(index: number) {
    this.__comp.treeNode.updateZIndex(index);
    this.performRender();
  }

  public get renderOrder() {
    return this.__comp.treeNode.renderOrder;
  }

  constructor(props: Props, parent?: CoreComponent) {
    this.context = (parent?.context as Context) || ({} as Context);
    const detached = isDetachedClass(this.constructor);
    if (detached && !parent) {
      throw new Error(`${this.constructor.name} is detached: mount it as a child of a component in a tree`);
    }
    // Development builds only: bundlers replace the NODE_ENV expression inside isDevelopmentBuild and drop the check
    // from production builds; where `process` does not exist the check counts as production and is skipped.
    if (detached && isDevelopmentBuild()) warnDetachedFrameHooks(this.constructor);

    this.__comp = {
      parent,
      context: parent ? parent.__comp.context : createDefaultPrivateContext(),
      treeNode: new Tree(this),
      children: new Map(),
      childrenKeys: [],
      prevChildrenArr: [],
      stringRef: undefined,
      updated: false,
      iterateId: 0,
      detached: detached
        ? {
            slot: -1,
            appliedFrame: -1,
            apply: (): void => {
              // A flush can hold a deferred entry that delete() could not drop (it is not in the queue then) and
              // re-enqueue it after the component unmounted: never run an update on an unmounted component.
              if (!this.__comp.unmounted) this.applyDetachedUpdate();
            },
          }
        : undefined,
      unmounted: false,
    };
    if (!parent) this.__comp.treeNode.detachedUpdates = this.__comp.context.detachedUpdates;
    else if (detached) {
      const parentNode = parent.__comp.treeNode;
      this.__comp.treeNode.host = parent.__comp.detached ? parentNode.host : parentNode;
    }
    this.props = props ?? ({} as Props);
  }

  /**
   * Whether this component took part in the latest traversal. A culled tree skips clean offscreen
   * components on purpose, so there it means "attached to the tree in a branch that is not suppressed".
   */
  public isIterated(): boolean {
    const comp = this.__comp;
    if (comp.detached) {
      const parent = comp.parent;
      if (comp.unmounted || !parent || !parent.isIterated()) return false;
      // An attached parent walks its children only while its traversal permission allows it.
      return parent.__comp.detached !== undefined || parent.__comp.treeNode.childrenWalkAllowed;
    }
    const treeNode = comp.treeNode;
    if (treeNode.scope) return treeNode.isTraversalAllowed();
    return comp.iterateId === comp.context.globalIterateId;
  }

  /**
   * Optional hook: define it to learn when this component enters or leaves the viewport of its culled layer, for
   * example to hide an HTML overlay or release a resource while it is out of view. A component outside the viewport
   * receives no other lifecycle calls while nothing changes. Called once per change, after the frame published
   * visibility and before painting; it also reports leaving when an ancestor stops walking this branch.
   *
   * It is not called at mount for a component outside the viewport, and never in a layer without culling: show the
   * overlay from `render()` and hide or release it on `viewportChanged(false)`. A layer without culling counts every
   * component as in the viewport: turning culling off tells components it last told they left that they are back
   * (offscreen components it never told anything included), turning it on tells offscreen ones that they left. It is
   * not called on unmount: release resources in `unmount()`. Updates requested from it apply in a later frame.
   */
  public viewportChanged?(inViewport: boolean): void;

  /** Whether this node's own bounds intersect its tree's viewport. */
  public isInViewport(): boolean {
    const comp = this.__comp;
    if (comp.detached) {
      // Like a published tree node, a detached component counts only while it is mounted and its host walks it; the
      // host's answer is cached per painted frame, so a batch asking for every drawn item stays O(1) per item.
      const host = comp.treeNode.host;
      if (comp.unmounted || !host || !host.walksDetachedChildren()) return false;
    }
    return comp.treeNode.isVisible();
  }

  /** Whether a viewport culls this component: its tree's, or for a detached component its nearest walked ancestor's. */
  protected isCulledByViewport(): boolean {
    const node = this.__comp.treeNode;
    return (node.host ?? node).scope !== undefined;
  }

  /** World rectangle this component's tree culled by in its latest frame; undefined when the tree does not cull. */
  protected getCullingViewport(): TTileRect | undefined {
    const node = this.__comp.treeNode;
    return (node.host ?? node).scope?.frameViewport;
  }

  public performRender = () => {
    this.updatePrepared = false;
    const comp = this.__comp;
    if (comp.detached) {
      // Detached components are not walked: their tree applies the queued update in its next frame.
      if (comp.unmounted) return;
      comp.context.detachedUpdates.enqueue(comp.detached);
      comp.context.scheduler.scheduleUpdate();
      return;
    }
    comp.context.scheduler.scheduleUpdate();
    comp.treeNode.requestWalk();
  };

  /**
   * Culls this root component's tree by a viewport, as layers do. Only a root can cull, and a component that culls
   * cannot become a child.
   */
  protected setChildrenCulling(options: TTreeCullingOptions | undefined): void {
    if (options && this.__comp.detached) {
      throw new Error(`${this.constructor.name} is detached and cannot cull: the frame does not walk it`);
    }
    this.__comp.treeNode.setCulling(options);
  }

  /** Reports this component's own bounds to its tree's spatial index. */
  protected setCullingBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.__comp.treeNode.setBounds(minX, minY, maxX, maxY);
  }

  public getParent(): CoreComponent | undefined {
    return this.__comp.parent;
  }

  public setContext<K extends keyof Context>(context: Pick<Context, K>) {
    this.context = Object.assign({}, this.context, context);

    // Propagate context changes to all children
    const children = this.__comp.children;
    const childrenKeys = this.__comp.childrenKeys;

    for (let i = 0; i < childrenKeys.length; i += 1) {
      const child = children.get(childrenKeys[i]);
      if (child) {
        child.setContext(context);
      }
    }

    this.performRender();
  }

  protected unmount() {
    // noop
  }
  protected render() {
    // noop
  }
  protected updateChildren(): void | ChildDescriptor[] {
    // noop
  }

  protected setProps(_: never) {
    // noop
  }

  private __unmount() {
    const comp = this.__comp;
    comp.unmounted = true;
    if (comp.detached) comp.context.detachedUpdates.delete(comp.detached);
    this.__unmountChildren();
    this.unmount();
    if (!comp.parent) {
      // An unmounted root has no parent to re-render, and its tree is never traversed again.
      comp.context.scheduler.setRoot(undefined);
      comp.context.detachedUpdates.clear();
      return;
    }
    this.performRender();
  }

  /** Applies pending work without painting; the tree calls it ahead of painting for requested and new components. */
  public prepareUpdate(): boolean {
    if (this.updatePrepared) return true;
    if (!this.__comp.parent) this.__comp.context.globalIterateId++;
    this.__comp.iterateId = this.__comp.context.globalIterateId;
    this.updatePrepared = true;
    return true;
  }

  /**
   * Runs this component's frame. The tree tells it through its tree node whether it already prepared it in this
   * traversal; overrides call `super.iterate()` without arguments. A direct call outside a traversal prepares first.
   */
  public iterate(): boolean {
    const node = this.__comp.treeNode;
    const prepared = node.framePrepared;
    node.framePrepared = false;
    node.frameVisible = true;
    if (!prepared) this.prepareUpdate();
    this.updatePrepared = false;
    return true;
  }

  /** Applies a detached component's pending work: the preparation part of its lifecycle, outside the frame walk. */
  protected applyDetachedUpdate(): void {
    this.prepareUpdate();
    this.updatePrepared = false;
  }

  private mountChild(descriptor: ChildDescriptor, key: string): CoreComponent {
    if (this.__comp.detached && !isDetachedClass(descriptor.klass)) {
      throw new Error(
        `${descriptor.klass.name} cannot be a child of detached ${this.constructor.name}: ` +
          "children of a detached component must be detached"
      );
    }
    // The descriptor factory checked the props against the concrete class. Construction and
    // ref invocation erase that relationship only at this heterogeneous runtime boundary.
    const child = Reflect.construct(descriptor.klass, [descriptor.props, this]) as CoreComponent;
    this.__comp.children.set(key, child);
    const ref = descriptor.options.ref;
    if (typeof ref === "function") Reflect.apply(ref, undefined, [child]);
    else if (typeof ref === "string") {
      child.__comp.stringRef = ref;
      this.$[ref] = child;
    }
    // A new detached child applies its first update, mount included, from the queue.
    if (child.__comp.detached) child.performRender();
    return child;
  }

  private removeChild(key: string, child: CoreComponent): void {
    const ref = child.__comp.stringRef;
    if (ref !== undefined && this.$[ref] === child) delete this.$[ref];
    child.__unmount();
    this.__comp.children.delete(key);
    this.__comp.treeNode.remove(child.__comp.treeNode);
  }

  protected __updateChildren() {
    const next = this.updateChildren();
    if (!next || next === this.__comp.prevChildrenArr) return;
    const previousKeys = this.__comp.childrenKeys;
    const nextKeys: string[] = [];
    const descriptorsToMount: Array<{ key: string; descriptor: ChildDescriptor }> = [];
    this.__comp.prevChildrenArr = next;

    next.forEach((descriptor, index) => {
      const key = String(descriptor.options.key ?? `${descriptor.klass.name}|${index}|defaultKey`);
      const child = this.__comp.children.get(key);
      nextKeys.push(key);
      if (child && child.constructor === descriptor.klass) {
        // Each descriptor came from its concrete factory; this is the shared runtime update boundary.
        Reflect.apply(child.setProps, child, [descriptor.props]);
        child.__comp.updated = true;
        // A reconciliation is new data for this frame: a detached child that already applied in it applies again.
        // Each reconciliation allows one more application, and a parent reconciles at most once per own preparation.
        if (child.__comp.detached) child.__comp.detached.appliedFrame = -1;
      } else {
        descriptorsToMount.push({ key, descriptor });
      }
    });

    previousKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (!child) return;
      if (child.__comp.updated) child.__comp.updated = false;
      else this.removeChild(key, child);
    });
    descriptorsToMount.forEach(({ key, descriptor }) => this.mountChild(descriptor, key));
    this.__comp.childrenKeys = nextKeys;
    const children: Tree[] = [];
    let detachedOrder = 0;
    nextKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (!child) return;
      // Detached children are not walked; they keep their reconcile order for hit testing.
      if (child.__comp.detached) child.__comp.treeNode.renderOrder = detachedOrder++;
      else children.push(child.__comp.treeNode);
    });
    this.__comp.treeNode.setChildren(children);
    // Without culling the walk paints this component right after this reconciliation: its detached children apply
    // first. A culled tree applies them after its preparation, and a running flush reaches them itself.
    if (detachedOrder > 0 && !this.__comp.treeNode.scope) this.__comp.context.detachedUpdates.flush();
  }

  private __unmountChildren() {
    this.__comp.childrenKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (child) this.removeChild(key, child);
    });
    this.__comp.treeNode.clearChildren();
    this.__comp.childrenKeys = [];
    this.__comp.prevChildrenArr = [];
  }

  public static create<C extends ComponentConstructor>(this: C, ...args: FactoryArguments<C>): ComponentDescriptor<C> {
    // Preserve omitted arguments so custom constructor defaults run; CoreComponent normalizes its own props.
    const props = args[0] as DescriptorProps<C>;
    return new CheckedDescriptor(props, args[1] ?? {}, this);
  }

  public static mount<C extends ComponentConstructor>(
    Component: C,
    ...args: OptionalFactoryProps<C> extends true
      ? [props?: ComponentProps<NoInfer<C>>]
      : [props: ComponentProps<NoInfer<C>>]
  ): InstanceType<C> {
    const root = Reflect.construct(Component, [args[0]]) as InstanceType<C>;
    const scheduler = root.__comp.context.scheduler;
    scheduler.setRoot(root.__comp.treeNode);
    scheduler.scheduleUpdate();
    return root;
  }

  public static unmount(instance: CoreComponent) {
    instance.__unmount();
  }

  /**
   * Runs the pending update of a root mounted with `mount`. Roots are not driven by anything on
   * their own: the graph updates its layers on each frame, and code that mounts a root itself
   * calls this from its own loop. Children are updated with their root, so for them it is a no-op.
   */
  public static update(root: CoreComponent): void {
    if (root.__comp.parent) return;
    root.__comp.context.scheduler.performUpdate();
  }
}
