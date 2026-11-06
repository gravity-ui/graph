import { GraphClassConstructor } from "../utils/types/classes";

import { Scheduler } from "./Scheduler";
import { ITree, Tree } from "./Tree";
import type { TTreeCullingOptions } from "./TreeCulling";

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
  };
  children: Map<string, CoreComponent>;
  childrenKeys: string[];
  prevChildrenArr: ChildDescriptor[];
  stringRef: string | undefined;
  updated: boolean;
  iterateId: number;
};

export type CoreComponentProps = Record<string, unknown>;
export type CoreComponentContext = Record<string, unknown>;

function createDefaultPrivateContext(): TPrivateComponentData["context"] {
  return {
    scheduler: new Scheduler(),
    globalIterateId: 0,
  };
}

export class CoreComponent<
  Props extends CoreComponentProps = CoreComponentProps,
  Context extends CoreComponentContext = CoreComponentContext,
> implements ITree
{
  public $: Record<string, CoreComponent | undefined> = Object.create(null);

  public context: Context = {} as Context;

  public props: Props = {} as Props;

  protected __comp: TPrivateComponentData;

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
    };
    this.props = props ?? ({} as Props);
  }

  public isIterated(): boolean {
    const iterateId = this.__comp.context.globalIterateId;
    // A child skipped by an ancestor's visibility culling was out of view with nothing to process,
    // so for this traversal it counts as iterated.
    return (
      this.__comp.treeNode.isTraversalAllowed() &&
      (this.__comp.iterateId === iterateId || this.__comp.treeNode.isSkippedByCulling(iterateId))
    );
  }

  /** Whether this node's own bounds intersect its tree's viewport. */
  public isInViewport(): boolean {
    return this.__comp.treeNode.isVisible();
  }

  /** @internal Called before painting when the tree's viewport selection changes. */
  public onViewportChange(_visible: boolean): void {
    // noop
  }

  public performRender = () => {
    this.__comp.context.scheduler.scheduleUpdate();
    this.__comp.treeNode.requestWalk();
  };

  /**
   * Configures the viewport for this tree root and all its descendants.
   */
  protected setChildrenCulling(options: Omit<TTreeCullingOptions, "getWalkToken"> | undefined): void {
    this.__comp.treeNode.setCulling(options && { ...options, getWalkToken: () => this.__comp.context.globalIterateId });
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
    this.__unmountChildren();
    this.unmount();
    if (!this.__comp.parent) {
      // An unmounted root has no parent to re-render, and its tree is never traversed again.
      this.__comp.context.scheduler.setRoot(undefined);
      return;
    }
    this.performRender();
  }

  /** Applies pending work before the tree selects the elements to paint. */
  public prepareUpdate(): boolean {
    if (this.updatePrepared) return true;
    if (!this.__comp.parent) {
      this.__comp.context.globalIterateId = Math.random();
    }
    this.__comp.iterateId = this.__comp.context.globalIterateId;
    this.updatePrepared = true;
    return true;
  }

  public iterate(): boolean {
    if (!this.updatePrepared) this.prepareUpdate();
    this.updatePrepared = false;
    return true;
  }

  private mountChild(descriptor: ChildDescriptor, key: string): CoreComponent {
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
    nextKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (child) children.push(child.__comp.treeNode);
    });
    this.__comp.treeNode.setChildren(children);
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
