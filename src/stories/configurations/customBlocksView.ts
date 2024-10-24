import { CanvasBlock, TGraphConfig } from "../../index";

import { storiesSettings } from "./definitions";

class SpecificBlockView extends CanvasBlock {
  protected renderStroke(color: string) {
    this.context.ctx.lineWidth = Math.round(3 / this.context.camera.getCameraScale());
    this.context.ctx.strokeStyle = color;
    this.context.ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [0, 30, 50, 60]);
    this.context.ctx.stroke();
  }

  public override renderSchematicView() {
    this.context.ctx.lineWidth = 2;
    this.context.ctx.fillStyle = "#C4EFC2";
    this.context.ctx.strokeStyle = "rgba(0, 0, 0, 0.30)";
    this.context.ctx.beginPath();
    this.context.ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [0, 30, 50, 60]);
    this.context.ctx.fill();
    this.context.ctx.beginPath();
    this.context.ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [0, 30, 50, 60]);
    this.context.ctx.stroke();

    if (this.shouldRenderText) {
      this.context.ctx.fillStyle = this.context.colors.block.text;
      this.context.ctx.textAlign = "center";
      this.renderText(this.state.name);
    }
    if (this.state.selected) {
      this.renderStroke(this.context.colors.block.selectedBorder);
    }

    this.context.ctx.restore();

    this.context.ctx.globalAlpha = 1;
  }
}

const SpecificBlockIs = "some-specific-view";
export const customSchematicViewConfig: TGraphConfig = {
  configurationName: "custom-schematic",
  blocks: [
    {
      x: 265,
      y: 334,
      is: SpecificBlockIs,
      width: 200,
      height: 160,
      id: "Lonely block without anchors",
      selected: false,
      name: "one block",
      anchors: [],
    },
  ],
  connections: [],
  cameraScale: 0.9,
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
  settings: {
    ...storiesSettings,
    blockComponents: {
      [SpecificBlockIs]: SpecificBlockView,
    },
  },
};
