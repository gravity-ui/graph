import { Constructor } from "../utils/types/helpers";

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
  protected firstIterate = true;
  protected firstRender = true;
  protected firstUpdateChildren = true;

  protected shouldRender = true;
  protected shouldUpdateChildren = true;
  protected shouldRenderChildren = true;

  public state: State;

  protected __data: { nextProps: Props | undefined; nextState: State | undefined } = {
    nextProps: undefined,
    nextState: undefined,
  };

  constructor(props: Props, parent: CoreComponent) {
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

  protected setState<K extends keyof State>(state: Pick<State, K>) {
    const data = this.__data;

    if (data.nextState === undefined) {
      data.nextState = assign(assign({}, this.state), state);
      this.performRender();
    } else {
      assign(data.nextState, state);
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
      assign(this.state, data.nextState);
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
    if (this.firstIterate) {
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

  public iterate() {
    super.iterate();

    this.checkData();
    this.willIterate();

    if (this.shouldRender) {
      this.renderLifeCycle();
    } else {
      this.willNotRender();
    }

    if (this.shouldUpdateChildren) {
      this.shouldUpdateChildren = false;
      this.childrenLifeCycle();
    }

    this.didIterate();

    this.firstIterate = false;

    return this.shouldRenderChildren;
  }
}
