import { BlockConnection, HitBoxData, Path2DRenderStyleResult, isPointInStroke } from "@gravity-ui/graph";
import { curvePolyline, trangleArrowForVector } from "@gravity-ui/graph/utils";
import intersects from "intersects";

import { TMultipointConnection } from "../types";

const DEFAULT_FONT_SIZE = 14;

export class MultipointConnection extends BlockConnection<TMultipointConnection> {
  private labelsGeometry: { x: number; y: number; width: number; height: number }[] = [];

  public createPath() {
    const points = this.getPoints();
    if (!points.length) {
      return super.createPath();
    }
    return curvePolyline(points, 10);
  }

  public createArrowPath(): Path2D {
    const points = this.getPoints();
    if (!points.length) {
      return undefined;
    }

    const [start, end] = points.slice(points.length - 2);
    return trangleArrowForVector(start, end, 16, 10);
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    ctx.fillStyle = this.state.selected
      ? this.context.colors.connection.selectedBackground
      : this.context.colors.connection.background;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = this.state.selected || this.state.hovered ? -1 : 1;
    return { type: "both" };
  }

  public getPoints() {
    return this.connectedState.$state.value.points || [];
  }

  public afterRender?(ctx: CanvasRenderingContext2D): void {
    this.renderLabelsText(ctx);
  }

  public updatePoints(): void {
    super.updatePoints();
    return;
  }

  public getBBox() {
    const points = this.getPoints();
    if (!points.length) {
      return super.getBBox();
    }

    const x = [];
    const y = [];
    points.forEach((point) => {
      x.push(point.x);
      y.push(point.y);
    });

    return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)] as const;
  }

  public onHitBox(shape: HitBoxData): boolean {
    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;

    if (isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT * 2)) {
      return true;
    }

    if (!this.labelsGeometry.length) {
      return false;
    }

    const x = (shape.minX + shape.maxX) / 2;
    const y = (shape.minY + shape.maxY) / 2;
    const relativeThreshold = THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();
    return this.labelsGeometry.some((labelGeometry) => {
      return intersects.boxBox(
        x - relativeThreshold / 2,
        y - relativeThreshold / 2,
        relativeThreshold,
        relativeThreshold,
        labelGeometry.x,
        labelGeometry.y,
        labelGeometry.width,
        labelGeometry.height
      );
    });
  }

  private renderLabelsText(ctx: CanvasRenderingContext2D) {
    const [labelInnerTopPadding, labelInnerRightPadding, labelInnerBottomPadding, labelInnerLeftPadding] =
      this.context.constants.connection.LABEL.INNER_PADDINGS;

    const { labels } = this.connectedState.$state.value;
    if (!labels || !labels.length) {
      return;
    }

    this.labelsGeometry = [];
    labels.forEach(({ x, y, text, height, width }) => {
      if ([x, y, text].some((i) => i === undefined) || (x === 0 && y === 0)) {
        return;
      }

      this.labelsGeometry.push({
        x,
        y,
        width,
        height,
      });

      ctx.fillStyle = this.context.colors.connectionLabel.text;

      if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
      if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedText;

      ctx.textAlign = "left";
      ctx.font = `${DEFAULT_FONT_SIZE}px sans-serif`;
      ctx.fillText(text, x, y, width);

      ctx.fillStyle = this.context.colors.connectionLabel.background;

      if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
      if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;

      ctx.fillRect(
        x - labelInnerLeftPadding,
        y - labelInnerTopPadding,
        width + labelInnerLeftPadding + labelInnerRightPadding,
        height + labelInnerTopPadding + labelInnerBottomPadding
      );
    });

    return;
  }
}
