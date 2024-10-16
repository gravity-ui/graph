import React from "react";
import { Anchor, CanvasBlock, EAnchorType, layoutText, TAnchor, TBlockId, TPoint } from "../../..";
import { ActionBlockHtml } from "./ActionBlockHtml";

import { renderSVG } from "../../../utils/renderers/svgPath";
import { TGravityActionBlock } from "../generateLayout";
import './ActionBlock.css';

function getAnchorY(index) {
  let y = 18 * index;
  if (index >= 1) {
    y += 8 * index;
  }
  return y + 18;
}

export class ActionBlock extends CanvasBlock<TGravityActionBlock> {

  public cursor = 'pointer';

  protected hovered: boolean = false;

  protected subscribe(id: TBlockId) {
    const subs = super.subscribe(id);
    subs.push(
      this.addEventListener('mouseenter', (e) => {
          this.hovered = true;
          this.performRender();
        }
      ),
      this.addEventListener('mouseleave', (e) => {
        this.hovered = false;
        this.performRender();
      })
    )
    return subs;
  }

  protected renderName(ctx: CanvasRenderingContext2D) {
    const scale = this.context.camera.getCameraScale();

    if (scale > this.context.constants.block.SCALES[0]) {
      ctx.fillStyle = this.context.colors.block.text;
      ctx.textAlign = "center";
      this.renderText(this.state.name, ctx);
    }
  }

  public renderHTML() {
    return <ActionBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />
  }

  protected renderAnchor(anchor: TAnchor, getPosition: (anchor: TAnchor) => TPoint) {
    return Anchor.create({
      ...anchor,
      zIndex: this.zIndex,
      size: 18,
      lineWidth: 2,
      getPosition,
    }, {
      key: anchor.id
    });
  }

  protected getAnchorsYOffter(type: EAnchorType) {
    const anchors = this.connectedState.$state.value.anchors.filter((a) => a.type === type);
    const { height } = this.getContentRect();
    return (height - getAnchorY(anchors.length - 1)) / 2;
  }

  public getAnchorPosition(anchor: TAnchor): TPoint {
    const a = this.getAnchorsYOffter(anchor.type as EAnchorType);
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    const y = getAnchorY(index);
    return {
      x: anchor.type === EAnchorType.OUT ? this.state.width : 0,
      y: a + y,
    };
  }

  protected renderTextAtCenter(name: string, ctx: CanvasRenderingContext2D) {
    const rect = this.getContentRect();
    const scale = this.context.camera.getCameraScale();
    ctx.fillStyle = this.context.colors.block.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const { lines, measures } = layoutText(name, ctx, rect, { font: `500 ${9 / scale}px YS Text`, lineHeight: 9 / scale })
    const shiftY = rect.height / 2 - measures.height / 2;
    for (let index = 0; index < lines.length; index++) {
      const [line, x, y] = lines[index];
      const rY = (y + shiftY) | 0;
      ctx.fillText(line, x, rY);
    }
  }

  public renderBody(ctx: CanvasRenderingContext2D) {
    const scale = this.context.camera.getCameraScale();

    ctx.lineWidth = Math.min(Math.round(2 / scale), 12);
    ctx.fillStyle = this.hovered ? "rgba(57, 47, 57, 1)" : this.context.colors.block.background;

    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, 8);
    ctx.fill();
    if (this.state.selected) {
      ctx.strokeStyle = this.context.colors.block.selectedBorder;
    } else {
      ctx.strokeStyle = this.hovered ? 'rgba(229, 229, 229, 0.4)' : this.context.colors.block.border;
    }
    ctx.stroke();
    ctx.closePath();
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D): void {
      this.renderBody(ctx);
      // do not show icon for large scale
      if(this.context.camera.getCameraScale() < 0.1) {
        return;
      }

      ctx.fillStyle = "rgba(255, 190, 92, 1)";
      renderSVG({
        path: 'M5.75 2.5H10.25C10.7842 2.5 11.2532 2.77929 11.519 3.19983C10.6259 3.58121 10 4.46751 10 5.5C10 6.61941 10.7357 7.56698 11.75 7.88555V12C11.75 12.8284 11.0784 13.5 10.25 13.5H5.75C5.21576 13.5 4.74676 13.2207 4.48102 12.8002C5.3741 12.4188 6 11.5325 6 10.5C6 9.38059 5.26428 8.43302 4.25 8.11445V7.88555C5.26428 7.56698 6 6.61941 6 5.5C6 4.46751 5.3741 3.58121 4.48102 3.19982C4.74676 2.77929 5.21576 2.5 5.75 2.5ZM2.75 8.11445V7.88555C1.73572 7.56698 1 6.61941 1 5.5C1 4.32762 1.80699 3.34373 2.8958 3.0735C3.28617 1.87008 4.41648 1 5.75 1H10.25C11.5835 1 12.7138 1.87008 13.1042 3.07351C14.193 3.34373 15 4.32762 15 5.5C15 6.61941 14.2643 7.56698 13.25 7.88555V12C13.25 13.6569 11.9069 15 10.25 15H5.75C4.41647 15 3.28616 14.1299 2.8958 12.9265C1.80699 12.6563 1 11.6724 1 10.5C1 9.38059 1.73572 8.43302 2.75 8.11445ZM3.5 11.5C4.05228 11.5 4.5 11.0523 4.5 10.5C4.5 9.94771 4.05228 9.5 3.5 9.5C2.94772 9.5 2.5 9.94772 2.5 10.5C2.5 11.0523 2.94772 11.5 3.5 11.5ZM2.5 5.5C2.5 4.94772 2.94772 4.5 3.5 4.5C4.05228 4.5 4.5 4.94772 4.5 5.5C4.5 6.05228 4.05228 6.5 3.5 6.5C2.94772 6.5 2.5 6.05229 2.5 5.5ZM12.5 4.5C11.9477 4.5 11.5 4.94772 11.5 5.5C11.5 6.05229 11.9477 6.5 12.5 6.5C13.0523 6.5 13.5 6.05229 13.5 5.5C13.5 4.94772 13.0523 4.5 12.5 4.5Z',
        width: 14 * 4,
        height: 14 * 4,
        iniatialWidth: 14,
        initialHeight: 14,
      }, ctx, this.getContentRect());
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx);

    const scale = this.context.camera.getCameraScale();
    const shouldRenderText = scale > this.context.constants.block.SCALES[0];

    if (shouldRenderText) {
      ctx.fillStyle = this.context.colors.block.text;
      ctx.textAlign = "center";
      this.renderTextAtCenter(this.state.name, ctx);
    }
  }
}