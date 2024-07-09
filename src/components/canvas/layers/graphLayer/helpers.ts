import { Component } from "ya-nirvana-renderer";

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
