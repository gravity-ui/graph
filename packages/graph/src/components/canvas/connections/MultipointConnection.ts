import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import type { TPoint } from "../../../utils/types/shapes";

import type { TPathBounds } from "./BatchPath2D";
import { BlockConnection } from "./BlockConnection";
import { multipointGeometry } from "./geometry";
import type { TConnectionGeometryFn } from "./geometry";
import type { TMultipointConnection } from "./types";

const DEFAULT_FONT_SIZE = 14;

/** A polyline through the connection's `points` with a closed arrow at the end, and its `labels` drawn after it. */
export class MultipointConnection extends BlockConnection<TMultipointConnection> {
  public static override geometry: TConnectionGeometryFn = multipointGeometry;

  private labelsGeometry: { x: number; y: number; width: number; height: number; text: string }[] = [];

  public getPoints(): TPoint[] {
    return this.connectedState.$state.value.points || [];
  }

  public afterRender?(ctx: CanvasRenderingContext2D): void {
    this.renderLabelsText(ctx);
  }

  /** The labels with their paddings: what `afterRender()` draws. */
  protected override getAfterRenderBounds(): TPathBounds | undefined {
    if (!this.labelsGeometry.length) return undefined;
    const [top, right, bottom, left] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const label of this.labelsGeometry) {
      minX = Math.min(minX, label.x - left);
      minY = Math.min(minY, label.y - top);
      maxX = Math.max(maxX, label.x + label.width + right);
      maxY = Math.max(maxY, label.y + label.height + bottom);
    }
    return [minX, minY, maxX, maxY];
  }

  protected override hitTestLabel(shape: HitBoxData): boolean {
    if (!this.labelsGeometry.length) {
      return false;
    }

    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;
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
