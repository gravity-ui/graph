/* eslint-disable complexity */
import { Scheduler } from "./Scheduler";
import { ITree, Tree } from "./Tree";

type TOptions = {
  readonly key?: string;
  readonly ref?: ((inst: unknown) => void) | string;
};

export type TCoreComponent = CoreComponent<CoreComponentProps, CoreComponentContext>;

export type CoreComponentProps = Record<string, unknown>;
export type CoreComponentContext = Record<string, unknown>;

export type ComponentDescriptor<
  Props extends CoreComponentProps = CoreComponentProps,
  Context extends CoreComponentContext = CoreComponentContext,
> = {
  props: Props;
  options: TOptions;
  klass: Constructor<CoreComponent<Props, Context>>;
};

type TPrivateComponentData = {
  parent: CoreComponent | undefined;
  treeNode: Tree;
  context: {
    scheduler: Scheduler;
    globalIterateId: number;
  };
  children: Record<string, CoreComponent | undefined>;
  childrenKeys: string[];
  prevChildrenArr: ComponentDescriptor[];
  updated: boolean;
  iterateId: number;
};

function resolveChildDescriptorKey(descriptor: ComponentDescriptor, index: number): string {
  if (Object.prototype.hasOwnProperty.call(descriptor.options, "key") && descriptor.options.key !== undefined) {
    return descriptor.options.key;
  }
  return `${descriptor.klass.name}|${index}|defaultKey`;
}

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
  public $: object = {};

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
      children: {} as Record<string, CoreComponent | undefined>,
      childrenKeys: [],
      prevChildrenArr: [],
      updated: false,
      iterateId: 0,
    };
    this.props = props;
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
      const child = children[childrenKeys[i]];
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
  protected updateChildren(): void | ComponentDescriptor[] {
    // noop
  }

  protected setProps<K extends keyof Props>(_: Pick<Props, K>) {
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

  protected __updateChildren() {
    const nextChildrenArr = this.updateChildren();

    if (typeof nextChildrenArr === "undefined") return;

    const __comp = this.__comp;
    const children = __comp.children;
    const childrenKeys = __comp.childrenKeys;
    const nextChildrenKeys = (__comp.childrenKeys = []);

    if (nextChildrenArr === __comp.prevChildrenArr) return;

    let key;
    let ref;
    let child;
    let currentChild;
    const treeNode = __comp.treeNode;

    __comp.prevChildrenArr = nextChildrenArr;

    treeNode.clearChildren();

    if (nextChildrenArr.length === 0) {
      if (childrenKeys.length > 0) {
        for (let i = 0; i < childrenKeys.length; i += 1) {
          key = childrenKeys[i];
          child = children[key];

          if (child) {
            child.__unmount();
            children[key] = undefined;
          }
        }
      }

      return;
    }

    if (childrenKeys.length === 0) {
      if (nextChildrenArr.length > 0) {
        for (let i = 0; i < nextChildrenArr.length; i += 1) {
          child = nextChildrenArr[i];
          key = resolveChildDescriptorKey(child, i);
          ref = child.options.ref;
          // eslint-disable-next-line new-cap
          const mounted = new child.klass(child.props, this);
          children[key] = mounted;

          if (typeof ref === "function") {
            ref(mounted);
          } else if (typeof ref === "string") {
            (this.$ as Record<string, CoreComponent>)[ref] = mounted;
          }

          nextChildrenKeys.push(key);
          treeNode.append(mounted.__comp.treeNode);
        }
      }

      return;
    }

    const childForMount: ComponentDescriptor[] = [];
    const keyForMount: string[] = [];

    for (let i = 0; i < nextChildrenArr.length; i += 1) {
      child = nextChildrenArr[i];
      key = resolveChildDescriptorKey(child, i);
      currentChild = children[key];

      nextChildrenKeys.push(key);

      if (
        currentChild !== undefined &&
        currentChild instanceof child.klass &&
        currentChild.constructor === child.klass
      ) {
        currentChild.setProps(child.props);
        currentChild.__comp.updated = true;
      } else {
        childForMount.push(child);
        keyForMount.push(key);
      }
    }

    for (let i = 0; i < childrenKeys.length; i += 1) {
      key = childrenKeys[i];
      child = children[key];

      if (child === undefined) continue;

      if (child.__comp.updated === true) {
        child.__comp.updated = false;
      } else {
        child.__unmount();
        children[key] = undefined;
      }
    }

    for (let i = 0; i < childForMount.length; i += 1) {
      const descriptor = childForMount[i];
      key = keyForMount[i];
      ref = descriptor.options.ref;
      // eslint-disable-next-line new-cap
      const mounted = new descriptor.klass(descriptor.props, this);
      children[key] = mounted;

      if (typeof ref === "function") {
        ref(mounted);
      } else if (typeof ref === "string") {
        (this.$ as Record<string, CoreComponent>)[ref] = mounted;
      }
    }

    for (let i = 0; i < nextChildrenKeys.length; i += 1) {
      if ((child = children[nextChildrenKeys[i]]) !== undefined) {
        treeNode.append(child.__comp.treeNode);
      }
    }
  }

  private __unmountChildren() {
    this.__comp.treeNode.clearChildren();

    const children = this.__comp.children;
    const childrenKeys = this.__comp.childrenKeys;

    for (let i = 0; i < childrenKeys.length; i += 1) {
      const node = children[childrenKeys[i]];
      if (node) {
        node.__unmount();
      }
    }
  }

  public static create<Props extends CoreComponentProps, Context extends CoreComponentContext>(
    this: Constructor<CoreComponent<Props, Context>>,
    props: Props = {} as Props,
    options: TOptions = {}
  ): ComponentDescriptor<Props, Context> {
    return { props, options, klass: this };
  }

  public static mount<Props extends CoreComponentProps, Context extends CoreComponentContext>(
    Component: Constructor<CoreComponent<Props, Context>>,
    props?: Props
  ) {
    const root = new Component(props);

    const scheduler = root.__comp.context.scheduler;
    scheduler.setRoot(root.__comp.treeNode);
    scheduler.scheduleUpdate();

    return root;
  }

  public static unmount<Props extends CoreComponentProps, Context extends CoreComponentContext>(
    instance: CoreComponent<Props, Context>
  ): void {
    instance.__unmount();
  }
}
