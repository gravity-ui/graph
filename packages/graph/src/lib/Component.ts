import { CoreComponent, CoreComponentContext, CoreComponentProps } from "./CoreComponent";
import { assign } from "./utils";

export type TComponentState = Record<string, unknown>;
export type TComponentProps = CoreComponentProps;
export type TComponentContext = CoreComponentContext;

export class Component<
  Props extends CoreComponentProps = CoreComponentProps,
  State extends TComponentState = TComponentState,
  Context extends CoreComponentContext = CoreComponentContext,
> extends CoreComponent<Props, Context> {
  /** @internal Whether an extension uses its own parent-props lifecycle hooks. */
  public static hasParentPropsOverrides(extension: Component, base: Component): boolean {
    return (
      extension.shouldReceiveParentProps !== base.shouldReceiveParentProps ||
      extension.setProps !== base.setProps ||
      extension.propsChanged !== base.propsChanged
    );
  }

  protected firstIterate = true;

  /** willMount() runs once, even when the first frame prepares this component more than once. */
  private mountNotified = false;
  protected firstRender = true;
  protected firstUpdateChildren = true;

  protected shouldRender = true;
  protected shouldUpdateChildren = true;
  protected shouldRenderChildren = true;

  /** `shouldRenderChildren` when the previous iterate() ended. */
  private iteratedRenderChildren = true;

  public state: State;

  protected __data: { nextProps: Props | undefined; nextState: State | undefined; removedStateKeys?: Set<string> } = {
    nextProps: undefined,
    nextState: undefined,
  };

  constructor(props: Props, parent?: CoreComponent) {
    super(props, parent);
    this.state = {} as State;
  }

  protected willMount() {
    // noop
  }

  public setContext<K extends keyof Context>(context: Partial<Pick<Context, K>>) {
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    super.setContext({ ...this.context, ...context });
    this.contextChanged(this.context);
  }

  public setProps<K extends keyof Props>(props?: Pick<Props, K>) {
    if (props === undefined) return;

    const data = this.__data;

    if (data.nextProps === undefined) {
      data.nextProps = assign(assign({}, this.props), props);
      this.performRender();
    } else {
      assign(data.nextProps, props);
    }
  }

  public getState() {
    const next = this.__data.nextState;
    return next ? this.applyPendingState({ ...this.state }, next) : this.state;
  }

  private applyPendingState(target: State, next: State): State {
    if (this.__data.removedStateKeys) {
      for (const key of this.__data.removedStateKeys) delete target[key];
    }
    return assign(target, next);
  }

  protected setState<K extends keyof State>(state: Pick<State, K>) {
    const data = this.__data;

    if (data.nextState === undefined) {
      data.nextState = assign(assign({}, this.state), state);
      this.performRender();
    } else {
      assign(data.nextState, state);
    }
  }

  /** Queue removals from a complete data snapshot alongside pending component updates. */
  protected clearRemovedData(previous: object, next: object, retainedKeys: readonly string[]): void {
    const data = this.__data;
    for (const key of Object.keys(previous)) {
      if (Object.prototype.hasOwnProperty.call(next, key) || retainedKeys.includes(key)) continue;
      if (!data.nextState) {
        data.nextState = { ...this.state };
        this.performRender();
      }
      delete data.nextState[key];
      (data.removedStateKeys ??= new Set()).add(key);
    }
  }

  protected propsChanged(_nextProps: Props): void {
    // noop
  }

  protected stateChanged(_nextState: State): void {
    // noop
  }

  protected contextChanged(_nextContext: Context): void {
    // noop
  }

  protected checkData() {
    const data = this.__data;
    let updated = false;

    if (data.nextProps !== undefined) {
      this.propsChanged(data.nextProps);
      assign(this.props, data.nextProps);
      data.nextProps = undefined;
      updated = true;
    }

    if (data.nextState !== undefined) {
      this.stateChanged(data.nextState);
      this.applyPendingState(this.state, data.nextState);
      data.removedStateKeys = undefined;
      data.nextState = undefined;
      updated = true;
    }
    return updated;
  }

  protected willRender() {
    // noop
  }
  protected didRender() {
    // noop
  }

  protected renderLifeCycle() {
    this.willRender();
    this.render();
    this.didRender();

    this.firstRender = false;
  }

  protected willUpdateChildren() {
    // noop
  }
  protected didUpdateChildren() {
    // noop
  }

  protected childrenLifeCycle() {
    this.willUpdateChildren();
    this.__updateChildren();
    this.didUpdateChildren();

    this.firstUpdateChildren = false;
  }

  protected willIterate() {
    if (this.firstIterate && !this.mountNotified) {
      this.mountNotified = true;
      this.willMount();
    }
    // noop
  }
  protected didIterate() {
    // noop
  }

  protected willNotRender() {
    // noop
  }

  /** Semantic paint veto checked after the tree's viewport decision, for example for hidden elements. */
  protected isRenderAllowed(): boolean {
    return true;
  }

  public override prepareUpdate(): boolean {
    if (this.updatePrepared) return this.shouldRenderChildren;
    super.prepareUpdate();
    // The hooks below run with this update on the stack: `CoreComponent.applyUpdatesNow` does not enter it again.
    const comp = this.__comp;
    const updating = comp.updating;
    comp.updating = true;
    try {
      this.checkData();
      this.willIterate();

      if (this.shouldUpdateChildren) {
        this.shouldUpdateChildren = false;
        this.childrenLifeCycle();
      }
    } finally {
      comp.updating = updating;
    }
    return this.shouldRenderChildren;
  }

  protected override applyDetachedUpdate(): void {
    super.applyDetachedUpdate();
    this.firstIterate = false;
  }

  public override iterate(): boolean {
    const node = this.__comp.treeNode;
    const prepared = node.framePrepared;
    const visible = node.frameVisible;
    node.framePrepared = false;
    node.frameVisible = true;
    if (!prepared) this.prepareUpdate();
    this.updatePrepared = false;
    // Without culling the walk records the children decision only after iterate() returns: record the prepared one now,
    // so detached children asked while this component paints answer for this frame, as with culling.
    if (!node.scope) node.setChildrenWalkAllowed(this.shouldRenderChildren);
    // Without culling the tree paints every component: it decides itself, with the geometry it just prepared.
    const inViewport = node.scope ? visible : visible && this.isInViewport();

    if (inViewport && this.shouldRender && this.isRenderAllowed()) {
      this.renderLifeCycle();
    } else {
      this.willNotRender();
    }

    this.didIterate();

    this.firstIterate = false;

    // A culled tree walks children by the component's preparation: a change made while painting requests one frame,
    // whose preparation applies it.
    if (this.shouldRenderChildren !== this.iteratedRenderChildren) {
      this.iteratedRenderChildren = this.shouldRenderChildren;
      if (node.scope && this.shouldRenderChildren !== node.childrenWalkAllowed) this.performRender();
    }

    return this.shouldRenderChildren;
  }
}
