import { CoreComponent } from "./CoreComponent";
import { assign } from "./utils";

export class Component extends CoreComponent {
  protected firstIterate = true;
  protected firstRender = true;
  protected firstUpdateChildren = true;

  protected shouldRender = true;
  protected shouldUpdateChildren = true;
  protected shouldRenderChildren = true;

  public props: object;
  public state: object;
  private __data = {
    nextProps: undefined,
    nextState: undefined,
  };

  constructor(...args) {
    super(...args);

    this.state = {};
    this.props = args[0] || {};
  }

  public setProps(props?: object) {
    if (props === undefined) return;

    const data = this.__data;

    if (data.nextProps === undefined) {
      data.nextProps = assign(assign({}, this.props), props);
      this.performRender();
    } else {
      assign(data.nextProps, props);
    }
  }

  protected setState(state?: object) {
    if (state === undefined) return;

    const data = this.__data;

    if (data.nextState === undefined) {
      data.nextState = assign(assign({}, this.state), state);
      this.performRender();
    } else {
      assign(data.nextState, state);
    }
  }

  protected propsChanged(_nextProps: object): void {
    // noop
  }

  protected stateChanged(_nextState: object): void {
    // noop
  }

  protected checkData() {
    const data = this.__data;

    if (data.nextProps !== undefined) {
      this.propsChanged(data.nextProps);
      assign(this.props, data.nextProps);
      data.nextProps = undefined;
    }

    if (data.nextState !== undefined) {
      this.stateChanged(data.nextState);
      assign(this.state, data.nextState);
      data.nextState = undefined;
    }
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
    // noop
  }
  protected didIterate() {
    // noop
  }

  protected willNotRender() {
    // noop
  }
  protected __setProps(props: object) {
    this.setProps(props);
  }

  protected iterate() {
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
