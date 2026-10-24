import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import { curvePolyline } from "../../../utils/shapes/curvePolyline";
import { getTriangleArrowPoints } from "../../../utils/shapes/triangle";
import { TPoint, TRect } from "../../../utils/types/shapes";

import { Path2DRenderStyleResult } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { isPointInStroke } from "./bezierHelpers";
import type { TMultipointConnection } from "./types";

const DEFAULT_FONT_SIZE = 14;

export class MultipointConnection extends BlockConnection<TMultipointConnection> {
  private labelsGeometry: { x: number; y: number; width: number; height: number; text: string }[] = [];

  protected override hasGeometry(): boolean {
    const count = this.getPoints().length;
    return count === 0 ? super.hasGeometry() : count >= 2;
  }

  protected override collectBBoxPoints(props: TConnectionProps = this.props) {
    const points = [...this.getPoints(), ...super.collectBBoxPoints(props)];
    const [top, right, bottom, left] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    for (const label of this.labelsGeometry) {
      points.push(
        { x: label.x - left, y: label.y - top },
        { x: label.x + label.width + right, y: label.y + label.height + bottom }
      );
    }
    return points;
  }

  public createPath() {
    const points = this.getPoints();
    if (points.length === 0) return super.createPath();
    if (points.length === 1) return new Path2D();
    return curvePolyline(points, 10);
  }

  public createArrowPath(): Path2D {
    const path = super.createArrowPath();
    if (this.getPoints().length >= 2) path.closePath();
    return path;
  }

  protected override getArrowPoints(props: TConnectionProps = this.props): TPoint[] {
    const points = this.getPoints();
    if (points.length === 0) return super.getArrowPoints(props);
    if (points.length === 1) return [];

    const [start, end] = points.slice(points.length - 2);
    return getTriangleArrowPoints(start, end, 16, 10);
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
    if (this.isInViewport()) this.renderLabelsText(ctx);
  }

  public updatePoints(additionalPoints?: TPoint[], props: TConnectionProps = this.props): void {
    super.updatePoints(additionalPoints, props);
    return;
  }

  public getBBox() {
    return super.getBBox();
  }

  protected override getHitBoxRect(): TRect {
    const [minX, minY, maxX, maxY] = this.getBBox();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

    this.labelsGeometry.forEach(({ x, y, text, height, width }) => {
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

  protected override updateLabelGeometry(): void {
    this.labelsGeometry = (this.connectedState.$state.value.labels ?? []).flatMap(({ x, y, text, width, height }) =>
      x === undefined || y === undefined || text === undefined || width === undefined || height === undefined
        ? []
        : [{ x, y, text, width, height }]
    );
  }
}
