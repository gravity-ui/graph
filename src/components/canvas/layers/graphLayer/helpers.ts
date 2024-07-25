import { Component } from "../../../../../lib/lib/Component";

export class DrawBelow extends Component {
  protected shouldUpdateChildren = false;

  protected shouldRenderChildren = false;

  protected render() {
    this.context.ctx.globalCompositeOperation = "destination-over";
    return;
  }
}

export class DrawOver extends Component {
  protected shouldUpdateChildren = false;

  protected shouldRenderChildren = false;

  protected render() {
    this.context.ctx.globalCompositeOperation = "source-over";
    return;
  }
}
