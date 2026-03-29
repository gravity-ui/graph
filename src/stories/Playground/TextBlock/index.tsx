import React from "react";

import { CanvasBlock, TBlockId, layoutText } from "../../..";
import { TCanvasStyleDeclaration } from "../../../services/canvasStyles";
import { TGravityTextBlock } from "../generateLayout";

import { TextBlockHtml } from "./TextBlockHtml";

import "./TextBlock.css";

type TTextBlockCanvasStyle = TCanvasStyleDeclaration;

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
    const styles = this.getTextBlockCanvasStyles();
    ctx.fillStyle = styles.text?.color ?? "rgba(189, 142, 75, 1)";
    ctx.textAlign = "center";
    this.renderText(this.state.meta.text, ctx);
  }

  public renderHTML() {
    return <TextBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />;
  }

  protected renderTextAtCenter(name: string, ctx: CanvasRenderingContext2D) {
    const rect = this.getContentRect();
    const scale = this.context.camera.getCameraScale();
    const styles = this.getTextBlockCanvasStyles();
    ctx.fillStyle = styles.text?.color ?? "rgba(189, 142, 75, 1)";
    ctx.textAlign = "center";
    ctx.textBaseline = styles.text?.baseline ?? "bottom";
    const textSize = typeof styles.text?.size === "number" ? styles.text.size : 13;
    const textWeight = styles.text?.weight ?? 500;
    const textFamily = styles.text?.family ?? "YS Text";
    const { lines, measures } = layoutText(name, ctx, rect, {
      font: `${textWeight} ${textSize}px ${textFamily}`,
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
    const styles = this.getTextBlockCanvasStyles();
    const lineWidth = typeof styles.stroke?.width === "number" ? styles.stroke.width : 2;
    const lineDash = Array.isArray(styles.stroke?.dash) ? styles.stroke.dash : [];

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.fillStyle = styles.fill?.color ?? "rgba(189, 142, 75, 0.1)";

    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, 8);
    ctx.fill();
    ctx.setLineDash(lineDash);
    ctx.strokeStyle = styles.stroke?.color ?? "rgba(189, 142, 75, 1)";
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

  protected getTextBlockCanvasStyles(): Readonly<TTextBlockCanvasStyle> {
    return this.resolveCanvasStyles([
      "block-text",
      this.state.selected && "selected",
      !this.state.selected && "not-selected",
    ]);
  }
}
