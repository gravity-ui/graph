import { CoreComponent } from './CoreComponent';
import { assign } from './utils';

export class Component extends CoreComponent {
  protected firstIterate: boolean = true;
  protected firstRender = true;
  protected firstUpdateChildren = true;

  protected shouldRender: boolean = true;
  protected shouldUpdateChildren: boolean = true;
  protected shouldRenderChildren: boolean = true;

  public props: object;
  public state: object;
  private __data = {
    nextProps: void 0,
    nextState: void 0,
  };

  constructor (...args) {
    super(...args);

    this.state = {};
    this.props = args[0] || {};
  }

  public setProps (props?: object) {
    if (props === undefined) return;

    const data = this.__data;

    if (data.nextProps === void 0) {
      data.nextProps = assign(assign({}, this.props), props);
      this.performRender();
    } else {
      assign(data.nextProps, props);
    }
  }

  protected setState (state?: object) {
    if (state === undefined) return;

    const data = this.__data;

    if (data.nextState === void 0) {
      data.nextState = assign(assign({}, this.state), state);
      this.performRender();
    } else {
      assign(data.nextState, state);
    }
  }

  protected propsChanged (nextProps: object): void {}
  protected stateChanged (nextState: object): void {}

  protected checkData () {
    const data = this.__data;

    if (data.nextProps !== void 0) {
      this.propsChanged(data.nextProps);
      assign(this.props, data.nextProps);
      data.nextProps = void 0;
    }

    if (data.nextState !== void 0) {
      this.stateChanged(data.nextState);
      assign(this.state, data.nextState);
      data.nextState = void 0;
    }
  }

  protected willRender () {}
  protected didRender () {}

  protected renderLifeCycle () {
    this.willRender();
    this.render();
    this.didRender();

    this.firstRender = false;
  }

  protected willUpdateChildren () {}
  protected didUpdateChildren () {}

  protected childrenLifeCycle () {
    this.willUpdateChildren();
    this.__updateChildren();
    this.didUpdateChildren();

    this.firstUpdateChildren = false;
  }

  protected willIterate () {}
  protected didIterate () {}

  protected willNotRender () {}
  protected __setProps (props: object) {
    this.setProps(props);
  }

  protected iterate () {
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
      this.childrenLifeCycle()
    }

    this.didIterate();

    this.firstIterate = false;

    return this.shouldRenderChildren;
  }
}
