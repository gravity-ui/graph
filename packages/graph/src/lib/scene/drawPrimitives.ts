import { renderText } from "../../utils/renderers/text";

import type { TSceneElement, TScenePrimitive, TSceneStroke, TSceneTextSize } from "./types";

export function isPrimitiveVisible(primitive: TScenePrimitive, scale: number): boolean {
  if (primitive.minScale !== undefined && scale < primitive.minScale) return false;
  if (primitive.maxScale !== undefined && scale >= primitive.maxScale) return false;
  return true;
}

export function textWorldSize(size: TSceneTextSize, scale: number): number {
  if (typeof size === "number") return size;
  return Math.min(Math.max(size.px / scale, size.minWorld ?? 0), size.maxWorld ?? Infinity);
}

/** How far a stroke's centre line moves inwards from the shape's edge. */
function strokeInset(stroke: TSceneStroke): number {
  if (stroke.align === "inside") return stroke.width / 2;
  if (stroke.align === "outside") return -stroke.width / 2;
  return 0;
}

function insetRadius(radius: number | readonly number[] | undefined, inset: number): number | number[] {
  if (radius === undefined) return 0;
  if (typeof radius === "number") return Math.max(0, radius - inset);
  return radius.map((value) => Math.max(0, value - inset));
}

export function applyStroke(ctx: CanvasRenderingContext2D, stroke: TSceneStroke): void {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.setLineDash(stroke.dash ? [...stroke.dash] : []);
}

export function strokeKey(stroke: TSceneStroke | undefined): string {
  return stroke ? `${stroke.color}|${stroke.width}|${stroke.dash?.join(",") ?? ""}` : "none";
}

/** Draws a rect, circle, text or icon whose coordinates are relative to (ox, oy). */
function drawShape(
  ctx: CanvasRenderingContext2D,
  primitive: TScenePrimitive,
  ox: number,
  oy: number,
  scale: number
): void {
  switch (primitive.kind) {
    case "rect": {
      const x = ox + primitive.x;
      const y = oy + primitive.y;
      if (primitive.fill) {
        ctx.fillStyle = primitive.fill;
        ctx.beginPath();
        ctx.roundRect(x, y, primitive.width, primitive.height, insetRadius(primitive.radius, 0));
        ctx.fill();
      }
      if (primitive.border) {
        const inset = strokeInset(primitive.border);
        applyStroke(ctx, primitive.border);
        ctx.beginPath();
        ctx.roundRect(
          x + inset,
          y + inset,
          primitive.width - 2 * inset,
          primitive.height - 2 * inset,
          insetRadius(primitive.radius, inset)
        );
        ctx.stroke();
      }
      return;
    }
    case "circle": {
      ctx.beginPath();
      ctx.arc(ox + primitive.cx, oy + primitive.cy, primitive.r, 0, 2 * Math.PI);
      if (primitive.fill) {
        ctx.fillStyle = primitive.fill;
        ctx.fill();
      }
      if (primitive.border) {
        applyStroke(ctx, primitive.border);
        ctx.stroke();
      }
      return;
    }
    case "text": {
      const size = textWorldSize(primitive.size, scale);
      ctx.fillStyle = primitive.color;
      ctx.textAlign = primitive.align ?? "left";
      renderText(
        primitive.text,
        ctx,
        { x: ox + primitive.x, y: oy + primitive.y, width: primitive.width, height: primitive.height },
        { font: `${primitive.weight ?? "normal"} ${size}px ${primitive.family}`, lineHeight: primitive.lineHeight }
      );
      return;
    }
    case "icon": {
      const factor = primitive.size / primitive.viewBox;
      ctx.save();
      ctx.translate(ox + primitive.x, oy + primitive.y);
      ctx.scale(factor, factor);
      ctx.fillStyle = primitive.color;
      ctx.fill(primitive.path, "evenodd");
      ctx.restore();
      return;
    }
    default:
      return;
  }
}

/** Consecutive paths and polygons of one stroke style, drawn with one fill and one stroke. */
type TRun = {
  key: string;
  stroke?: TSceneStroke;
  fill?: string;
  strokePath: Path2D;
  fillPath: Path2D;
  /** Paths and polygons in the run. */
  size: number;
};

export type TDrawElementsOptions = {
  /**
   * Ends a run after this many paths and polygons: a positive integer, or `Infinity` / `undefined` for unbounded (the
   * default). Any other value throws a RangeError. Chromium's Path2D.closePath() costs time in proportion to the path
   * built so far, so one run of thousands of polygons costs quadratic time.
   */
  maxRun?: number;
};

function resolveMaxRun(maxRun: number | undefined): number {
  if (maxRun === undefined || maxRun === Infinity) return Infinity;
  if (!Number.isInteger(maxRun) || maxRun < 1) {
    throw new RangeError(`drawElements: maxRun must be a positive integer or Infinity, got ${maxRun}`);
  }
  return maxRun;
}

export function appendSegments(path: Path2D, segments: Float32Array, ox: number, oy: number): void {
  let lastX = NaN;
  let lastY = NaN;
  for (let i = 0; i + 8 <= segments.length; i += 8) {
    const x0 = ox + segments[i];
    const y0 = oy + segments[i + 1];
    if (x0 !== lastX || y0 !== lastY) path.moveTo(x0, y0);
    lastX = ox + segments[i + 6];
    lastY = oy + segments[i + 7];
    path.bezierCurveTo(
      ox + segments[i + 2],
      oy + segments[i + 3],
      ox + segments[i + 4],
      oy + segments[i + 5],
      lastX,
      lastY
    );
  }
}

export function appendPolygon(path: Path2D, points: Float32Array, ox: number, oy: number): void {
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (i === 0) path.moveTo(ox + points[i], oy + points[i + 1]);
    else path.lineTo(ox + points[i], oy + points[i + 1]);
  }
  path.closePath();
}

/**
 * Draws visible primitives of the elements in the given order. Paths and polygons of one stroke style that follow each
 * other form a run, drawn with one `fill` of all its polygons and then one `stroke` of all its paths and polygon
 * outlines. Inside a run the order is therefore not kept: every polygon fill lies under every stroke of the run, also
 * under the stroke of a path that came before the polygon. Any other primitive ends the run first, so the order between
 * runs and the other primitives is kept.
 */
export function drawElements(
  ctx: CanvasRenderingContext2D,
  elements: readonly TSceneElement[],
  scale: number,
  options: TDrawElementsOptions = {}
): number {
  const maxRun = resolveMaxRun(options.maxRun);
  let run: TRun | undefined;
  let drawn = 0;
  const flush = (): void => {
    if (!run) return;
    if (run.fill) {
      ctx.fillStyle = run.fill;
      ctx.fill(run.fillPath);
    }
    if (run.stroke) {
      applyStroke(ctx, run.stroke);
      ctx.stroke(run.strokePath);
    }
    run = undefined;
  };
  for (let e = 0; e < elements.length; e++) {
    const element = elements[e];
    if (element.hidden) continue;
    for (let p = 0; p < element.primitives.length; p++) {
      const primitive = element.primitives[p];
      if (!isPrimitiveVisible(primitive, scale)) continue;
      drawn++;
      if (primitive.kind === "path" || primitive.kind === "polygon") {
        const stroke = primitive.stroke;
        const fill = primitive.kind === "polygon" ? primitive.fill : undefined;
        const key = strokeKey(stroke);
        if (
          run &&
          (run.key !== key || run.size >= maxRun || (fill !== undefined && run.fill !== undefined && run.fill !== fill))
        ) {
          flush();
        }
        if (!run) run = { key, stroke, strokePath: new Path2D(), fillPath: new Path2D(), size: 0 };
        run.size++;
        if (primitive.kind === "path") {
          appendSegments(run.strokePath, primitive.segments, element.x, element.y);
        } else {
          run.fill = fill;
          appendPolygon(run.fillPath, primitive.points, element.x, element.y);
          if (stroke) appendPolygon(run.strokePath, primitive.points, element.x, element.y);
        }
        continue;
      }
      flush();
      drawShape(ctx, primitive, element.x, element.y, scale);
    }
  }
  flush();
  return drawn;
}
