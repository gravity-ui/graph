/* eslint-disable complexity */
import { Scheduler } from "./Scheduler";
import { ITree, Tree } from "./Tree";

type TOptions = {
  readonly key?: string;
  readonly ref?: ((inst: any) => void) | string;
};

export type TCoreComponent = CoreComponent<CoreComponentProps, CoreComponentContext>;

type TPrivateComponentData = {
  parent: CoreComponent | undefined;
  treeNode: Tree;
  context: {
    scheduler: Scheduler;
    globalIterateId: number;
  };
  children: object;
  childrenKeys: string[];
  prevChildrenArr: object[];
  updated: boolean;
  iterateId: number;
};

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
      children: {},
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

          child.__unmount();
          children[key] = undefined;
        }
      }

      return;
    }

    if (childrenKeys.length === 0) {
      if (nextChildrenArr.length > 0) {
        for (let i = 0; i < nextChildrenArr.length; i += 1) {
          child = nextChildrenArr[i];
          // eslint-disable-next-line no-prototype-builtins
          key = child.options.hasOwnProperty("key") ? child.options.key : `${child.klass.name}|${i}|defaultKey`;
          ref = child.options.ref;
          // eslint-disable-next-line new-cap
          children[key] = new child.klass(child.props, this);

          if (typeof ref === "function") {
            ref(children[key]);
          } else if (typeof ref === "string") {
            this.$[ref] = children[key];
          }

          nextChildrenKeys.push(key);
          treeNode.append(children[key].__comp.treeNode);
        }
      }

      return;
    }

    const childForMount = [];
    const keyForMount = [];

    for (let i = 0; i < nextChildrenArr.length; i += 1) {
      child = nextChildrenArr[i];
      // eslint-disable-next-line no-prototype-builtins
      key = child.options.hasOwnProperty("key") ? child.options.key : `${child.klass.name}|${i}|defaultKey`;
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
      child = childForMount[i];
      key = keyForMount[i];
      ref = child.options.ref;
      // eslint-disable-next-line new-cap
      child = children[key] = new child.klass(child.props, this);

      if (typeof ref === "function") {
        ref(children[key]);
      } else if (typeof ref === "string") {
        this.$[ref] = children[key];
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
      children[childrenKeys[i]].__unmount();
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

  public static unmount(instance) {
    instance.__unmount();
  }
}
