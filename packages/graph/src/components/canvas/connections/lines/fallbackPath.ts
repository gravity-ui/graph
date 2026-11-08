import type { Path2DRenderStyleResult } from "../BatchPath2D";
import type { TConnectionGeometry } from "../geometry";

import type { TLineStroke } from "./types";

/** Key of a stroke: strokes with the same key share a Path2D style group. */
export function strokeKey(stroke: TLineStroke): string {
  return `${stroke.color}/${stroke.width}/${stroke.dash ? stroke.dash.pattern.join(",") : ""}`;
}

/** Applies the stroke to the context for a line pass. */
export function applyLineStyle(ctx: CanvasRenderingContext2D, stroke: TLineStroke): Path2DRenderStyleResult {
  ctx.lineWidth = stroke.width;
  ctx.strokeStyle = stroke.color;
  if (stroke.dash) ctx.setLineDash(stroke.dash.pattern as number[]);
  return { type: "stroke" };
}

/** Applies the arrow stroke to the context; a closed arrow is filled with the color too. */
export function applyArrowStyle(
  ctx: CanvasRenderingContext2D,
  stroke: TLineStroke,
  closed: boolean | undefined
): Path2DRenderStyleResult {
  ctx.lineWidth = stroke.width;
  ctx.strokeStyle = stroke.color;
  if (closed) {
    ctx.fillStyle = stroke.color;
    return { type: "both" };
  }
  return { type: "stroke" };
}

/** Batch group of an arrow item of the Path2D batch. */
export function getArrowGroup(closed: boolean | undefined, arrowStroke: TLineStroke, lineGroup: string): string {
  return `arrow/${closed ? "closed" : "open"}/${strokeKey(arrowStroke)}/${lineGroup}`;
}

/** A value built lazily from a geometry and kept while the geometry object stays the same. */
export class GeometryCache<T> {
  private geometry?: TConnectionGeometry;

  private value?: T;

  public get(geometry: TConnectionGeometry, create: (geometry: TConnectionGeometry) => T): T {
    if (this.geometry !== geometry || this.value === undefined) {
      this.value = create(geometry);
      this.geometry = geometry;
    }
    return this.value;
  }
}
