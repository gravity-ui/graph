import { GraphComponent } from "../../graphComponent";

export class DrawBelow extends GraphComponent {
  protected shouldUpdateChildren = false;

  protected shouldRenderChildren = false;

  protected isVisible(): boolean {
    return true;
  }

  protected render() {
    this.context.ctx.globalCompositeOperation = "destination-over";
    return;
  }
}

export class DrawOver extends GraphComponent {
  protected shouldUpdateChildren = false;

  protected shouldRenderChildren = false;

  protected isVisible(): boolean {
    return true;
  }

  protected render() {
    this.context.ctx.globalCompositeOperation = "source-over";
    return;
  }
}
