import React from "react";

import { CanvasBlock, TBlockId, layoutText } from "../../..";
import { TGravityTextBlock } from "../generateLayout";

import { TextBlockHtml } from "./TextBlockHtml";

import "./TextBlock.css";

export class TextBlock extends CanvasBlock<TGravityTextBlock> {
  public cursor = "pointer";

  protected hovered = false;

  protected subscribe(id: TBlockId) {
    const subs = super.subscribe(id);
    this.addEventListener("mouseenter", () => {
      this.hovered = true;
      this.performRender();
    });
    this.addEventListener("mouseleave", () => {
      this.hovered = false;
      this.performRender();
    });
    return subs;
  }

  protected renderName(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(189, 142, 75, 1)";
    ctx.textAlign = "center";
    this.renderText(this.state.meta.text, ctx);
  }

  public renderHTML() {
    return <TextBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />;
  }

  protected renderTextAtCenter(name: string, ctx: CanvasRenderingContext2D) {
    const rect = this.getContentRect();
    const scale = this.context.camera.getCameraScale();
    ctx.fillStyle = "rgba(189, 142, 75, 1)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const { lines, measures } = layoutText(name, ctx, rect, {
      font: `500 ${13 / scale}px YS Text`,
      lineHeight: 9 / scale,
    });
    const shiftY = rect.height / 2 - measures.height / 2;
    for (let index = 0; index < lines.length; index++) {
      const [line, x, y] = lines[index];
      const rY = (y + shiftY) | 0;
      ctx.fillText(line, x, rY);
    }
  }

  public renderBody(ctx: CanvasRenderingContext2D) {
    const scale = this.context.camera.getCameraScale();

    ctx.save();

    ctx.lineWidth = Math.min(Math.round(2 / scale), 12);
    ctx.fillStyle = "rgba(189, 142, 75, 0.1)";

    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, 8);
    ctx.fill();

    if (this.state.selected) {
      ctx.lineWidth = Math.min(Math.round(2 / scale), 12);
    } else {
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
    }

    ctx.strokeStyle = "rgba(189, 142, 75, 1)";
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D): void {
    this.renderBody(ctx);
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx);

    const scale = this.context.camera.getCameraScale();
    const shouldRenderText = scale > this.context.constants.block.SCALES[0];

    if (shouldRenderText) {
      this.renderName(ctx);
    }
  }
}
