import { GraphClassConstructor } from "../utils/types/classes";

import { Scheduler } from "./Scheduler";
import { ITree, Tree } from "./Tree";

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

function createDefaultPrivateContext() {
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
    return this.__comp.iterateId === this.__comp.context.globalIterateId;
  }

  public performRender = () => {
    this.__comp.context.scheduler.scheduleUpdate();
  };

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
    this.performRender();
  }

  public iterate(): boolean {
    if (!this.__comp.parent) {
      this.__comp.context.globalIterateId = Math.random();
    }
    this.__comp.iterateId = this.__comp.context.globalIterateId;

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
  }

  protected __updateChildren() {
    const next = this.updateChildren();
    if (!next || next === this.__comp.prevChildrenArr) return;
    const previousKeys = this.__comp.childrenKeys;
    const nextKeys: string[] = [];
    const descriptorsToMount: Array<{ key: string; descriptor: ChildDescriptor }> = [];
    this.__comp.prevChildrenArr = next;
    this.__comp.treeNode.clearChildren();

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
    nextKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (child) this.__comp.treeNode.append(child.__comp.treeNode);
    });
  }

  private __unmountChildren() {
    this.__comp.treeNode.clearChildren();
    this.__comp.childrenKeys.forEach((key) => {
      const child = this.__comp.children.get(key);
      if (child) this.removeChild(key, child);
    });
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
}
