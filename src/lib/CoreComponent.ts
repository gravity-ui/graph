/* eslint-disable complexity */
import { Scheduler } from "./Scheduler";
import { Tree } from "./Tree";

type TOptions = {
  readonly key?: string;
  readonly ref?: ((inst: any) => void) | string;
};

type TCompData = {
  parent: ICoreComponent | void;
  treeNode: Tree;
  context: {
    scheduler: any;
    globalIterateId: number;
  };
  children: object;
  childrenKeys: string[];
  prevChildrenArr: object[];
  updated: boolean;
  iterateId: number;
};

interface ICoreComponent extends CoreComponent {
  // noop
}

const fakeEmptyOptions: TOptions = {};

export class CoreComponent {
  public $: object = {};
  public context: any;
  protected children: Function;
  protected __comp: TCompData;

  public get zIndex() {
    return this.__comp.treeNode.zIndex;
  }

  public set zIndex(index: number) {
    this.__comp.treeNode.updateZIndex(index);
  }

  public get renderOrder() {
    return this.__comp.treeNode.renderOrder;
  }

  constructor(...args: any[]);
  constructor(props: object | void, parent: TFakeParentData | ICoreComponent) {
    this.context = parent.context;

    this.__comp = {
      parent: parent as ICoreComponent,
      context: (parent as any).__comp.context,
      treeNode: new Tree(this),
      children: {},
      childrenKeys: [],
      prevChildrenArr: [],
      updated: false,
      iterateId: 0,
    };

    if (!(parent instanceof CoreComponent)) {
      this.__comp.parent = undefined;
      const protoParent = this.iterate.bind(this);
      this.iterate = function () {
        this.__comp.context.globalIterateId = Math.random();
        return protoParent();
      };
    }
  }

  public isIterated(): boolean {
    return this.__comp.iterateId === this.__comp.context.globalIterateId;
  }

  public performRender() {
    this.__comp.context.scheduler.scheduleUpdate();
  }

  public getParent(): ICoreComponent | void {
    return this.__comp.parent;
  }

  public setContext(context: object) {
    Object.assign(this.context, context);
    this.performRender();
  }

  protected unmount() {
    // noop
  }
  protected render() {
    // noop
  }
  protected updateChildren(): void | object[] {
    // noop
  }

  protected setProps(_props: object) {
    // noop
  }
  /* deprecated */
  protected __setProps(_props: object) {
    // noop
  }

  private __unmount() {
    this.__unmountChildren();
    this.unmount();
    this.performRender();
  }

  protected iterate(): boolean {
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
        currentChild.__setProps(child.props);
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

  public static create(props?: object, options: TOptions = fakeEmptyOptions) {
    return { props, options, klass: this };
  }

  public static mount(Component, props?: object) {
    const context = getRootParentData();
    const root = new Component(props, context);

    const scheduler = root.__comp.context.scheduler;
    scheduler.setRoot(root.__comp.treeNode);
    scheduler.scheduleUpdate();

    return root;
  }

  public static unmount(instance) {
    instance.__unmount();
  }
}

type TFakeParentData = {
  context: any; // public context
  __comp: any;
};

function getRootParentData(): TFakeParentData {
  return {
    context: {}, // public context
    __comp: {
      context: {
        scheduler: new Scheduler(),
        globalIterateId: 0,
      }, // private context
    },
  };
}
