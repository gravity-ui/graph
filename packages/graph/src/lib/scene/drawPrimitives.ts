import type { TSceneLevel } from "../../services/scene/types";

import { isOnLevel } from "./levels";
import { resolveSceneSize } from "./size";
import { applyStyle } from "./style";
import { placeText, resolveTextSize, textClip } from "./textLayout";
import { sceneTextLayout, sceneTextMetrics } from "./textMetrics";
import type { TSceneElement, TScenePrimitive, TSceneStroke, TSceneStyle, TSceneTextPolicy } from "./types";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;
type TRectPrimitive = Extract<TScenePrimitive, { kind: "rect" }>;
type TRectPaths = { x: number; y: number; face?: Path2D; inset?: number; border?: Path2D };

// A primitive is immutable. Keep just its latest position and resolved border inset.
const rectPaths = new WeakMap<TScenePrimitive, TRectPaths>();

export function isPrimitiveVisible(primitive: TScenePrimitive, scale: number, level?: TSceneLevel): boolean {
  if (primitive.minScale !== undefined && scale < primitive.minScale) return false;
  if (primitive.maxScale !== undefined && scale >= primitive.maxScale) return false;
  return isOnLevel(primitive.levelMask, level);
}

/** How far a stroke's centre line moves inwards from the shape's edge; an unset width draws no stroke. */
function strokeInset(stroke: TSceneStroke, scale: number): number {
  const width = stroke.width === undefined ? 0 : resolveSceneSize(stroke.width, scale);
  if (stroke.align === "inside") return width / 2;
  if (stroke.align === "outside") return -width / 2;
  return 0;
}

function insetRadius(radius: number | readonly number[] | undefined, inset: number): number | number[] {
  if (radius === undefined) return 0;
  if (typeof radius === "number") return Math.max(0, radius - inset);
  return radius.map((value) => Math.max(0, value - inset));
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  rect: TRectPrimitive,
  source: TScenePrimitive,
  x: number,
  y: number,
  scale: number
): void {
  let paths: TRectPaths | undefined;
  if (typeof Path2D.prototype.roundRect === "function") {
    paths = rectPaths.get(source);
    if (!paths || paths.x !== x || paths.y !== y) {
      paths = { x, y };
      rectPaths.set(source, paths);
    }
  }
  if (rect.fill) {
    ctx.fillStyle = rect.fill;
    if (paths) ctx.fill((paths.face ??= buildRectPath(rect, x, y, 0)));
    else {
      ctx.beginPath();
      appendRect(ctx, rect, x, y, 0);
      ctx.fill();
    }
  }
  if (rect.border && applyStroke(ctx, rect.border, scale)) {
    const inset = strokeInset(rect.border, scale);
    if (paths) {
      if (inset === 0) ctx.stroke((paths.face ??= buildRectPath(rect, x, y, 0)));
      else {
        if (!paths.border || paths.inset !== inset) {
          paths.inset = inset;
          paths.border = buildRectPath(rect, x, y, inset);
        }
        ctx.stroke(paths.border);
      }
    } else {
      ctx.beginPath();
      appendRect(ctx, rect, x, y, inset);
      ctx.stroke();
    }
  }
}

function buildRectPath(rect: TRectPrimitive, x: number, y: number, inset: number): Path2D {
  const path = new Path2D();
  appendRect(path, rect, x, y, inset);
  return path;
}

function appendRect(
  path: CanvasRenderingContext2D | Path2D,
  rect: TRectPrimitive,
  x: number,
  y: number,
  inset: number
): void {
  const width = rect.width - 2 * inset;
  const height = rect.height - 2 * inset;
  const radius = insetRadius(rect.radius, inset);
  const square = typeof radius === "number" ? radius === 0 : radius.every((value) => value === 0);
  // Square rects also draw in browsers without roundRect.
  if (square) path.rect(x + inset, y + inset, width, height);
  else path.roundRect(x + inset, y + inset, width, height, radius);
}

/** Sets the stroke's style; false when its colour or width is unset, which draws nothing. */
export function applyStroke(ctx: CanvasRenderingContext2D, stroke: TSceneStroke, scale: number): boolean {
  if (stroke.color === undefined || stroke.width === undefined) return false;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = resolveSceneSize(stroke.width, scale);
  ctx.setLineDash(stroke.dash ? [...stroke.dash] : []);
  return true;
}

export function strokeKey(stroke: TSceneStroke | undefined, scale: number): string {
  if (!stroke) return "none";
  const width = stroke.width === undefined ? "" : resolveSceneSize(stroke.width, scale);
  return `${stroke.color ?? ""}|${width}|${stroke.dash?.join(",") ?? ""}`;
}

/**
 * Draws a text whose coordinates are relative to (ox, oy), from the shared layout at its resolved size
 * (`textLayout.ts`, the one WebGL places its glyphs from): each line with `textBaseline = "top"` at its top, aligned to
 * the anchor by `align`. A text whose layout overflows its box (`TTextLayout.overflows`, the rule WebGL clips by too)
 * is clipped to it; the others draw without a clip, as v1 drew every text, so their glyphs may overhang the box by
 * their side bearings. `source` is the primitive as the element holds it: its layout is cached on it, so a styled copy
 * drawn every frame lays out nothing new.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  primitive: TTextPrimitive,
  source: TTextPrimitive,
  ox: number,
  oy: number,
  scale: number,
  policy: TSceneTextPolicy | undefined
): void {
  if (primitive.color === undefined) return;
  let opacity = 1;
  const end = primitive.fadeInUntil;
  if (end !== undefined && scale < end && Number.isFinite(end)) {
    const start = primitive.minScale ?? 0;
    if (scale <= start) return;
    const t = (scale - start) / (end - start);
    opacity = t * t * (3 - 2 * t);
  }
  const size = resolveTextSize(primitive, scale, policy);
  const layout = sceneTextLayout(source, primitive, size);
  const lines = layout.lines.length;
  if (lines === 0) return;
  const place = placeText(primitive, lines, size, sceneTextMetrics);
  const clip = layout.overflows;
  if (clip || opacity < 1) ctx.save();
  if (opacity < 1) ctx.globalAlpha *= opacity;
  if (clip) {
    const box = textClip(primitive);
    ctx.beginPath();
    if (Number.isFinite(box.minY)) ctx.rect(ox + box.minX, oy + box.minY, box.maxX - box.minX, box.maxY - box.minY);
    else ctx.rect(ox + box.minX, oy + place.top - size, box.maxX - box.minX, lines * place.pitch + 3 * size);
    ctx.clip();
  }
  ctx.fillStyle = primitive.color;
  ctx.textAlign = primitive.align ?? "left";
  ctx.textBaseline = "top";
  ctx.font = `${primitive.weight ?? "normal"} ${size}px ${primitive.family}`;
  for (let row = 0; row < lines; row++) {
    ctx.fillText(layout.lines[row], ox + place.x, oy + place.top + row * place.pitch);
  }
  if (clip || opacity < 1) ctx.restore();
}

/**
 * Draws a rect, circle, text or icon whose coordinates are relative to (ox, oy); `source` is the primitive before
 * styles (the text layout cache key).
 */
function drawShape(
  ctx: CanvasRenderingContext2D,
  primitive: TScenePrimitive,
  source: TScenePrimitive,
  ox: number,
  oy: number,
  scale: number,
  policy: TSceneTextPolicy | undefined
): void {
  switch (primitive.kind) {
    case "rect":
      drawRect(ctx, primitive, source, ox + primitive.x, oy + primitive.y, scale);
      return;
    case "circle": {
      ctx.beginPath();
      ctx.arc(ox + primitive.cx, oy + primitive.cy, primitive.r, 0, 2 * Math.PI);
      if (primitive.fill) {
        ctx.fillStyle = primitive.fill;
        ctx.fill();
      }
      if (primitive.border && applyStroke(ctx, primitive.border, scale)) {
        ctx.stroke();
      }
      return;
    }
    case "text":
      drawText(ctx, primitive, source.kind === "text" ? source : primitive, ox, oy, scale, policy);
      return;
    case "icon": {
      if (primitive.color === undefined) return;
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
  /** Style overrides by `element.styleId`; see `TSceneStyle`. */
  styles?: readonly TSceneStyle[];
  /** The colour a style's `dim` moves paints towards (`SceneStore.getDimColor()`); without it `dim` changes nothing. */
  dimColor?: string;
  /** The current scene level: primitives whose `levelMask` lacks it are skipped. Unset draws every level. */
  level?: TSceneLevel;
  /** Leaves text primitives out, as the minimap does. */
  skipText?: boolean;
  /** Draws hidden elements too, as the minimap does for blocks handed to HTML. */
  drawHidden?: boolean;
  /** What the graph allows text (the `cameraAwareText` setting); unset allows camera-aware text. */
  textPolicy?: TSceneTextPolicy;
};

function isPrimitiveDrawn(primitive: TScenePrimitive, scale: number, options: TDrawElementsOptions): boolean {
  if (primitive.kind === "sprite" || (options.skipText && primitive.kind === "text")) return false;
  return isPrimitiveVisible(primitive, scale, options.level);
}

/**
 * Whether a path or polygon of this stroke key and fill starts a new run instead of joining `run`: another stroke
 * style, a full run, or a polygon fill other than the run's.
 */
function endsRun(run: TRun, key: string, fill: string | undefined, maxRun: number): boolean {
  return run.key !== key || run.size >= maxRun || (fill !== undefined && run.fill !== undefined && run.fill !== fill);
}

function resolveMaxRun(maxRun: number | undefined): number {
  if (maxRun === undefined || maxRun === Infinity) return Infinity;
  if (!Number.isInteger(maxRun) || maxRun < 1) {
    throw new RangeError(`drawElements: maxRun must be a positive integer or Infinity, got ${maxRun}`);
  }
  return maxRun;
}

export function appendSegments(path: Path2D, segments: Float32Array, ox: number, oy: number, closed = false): void {
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
  if (closed && segments.length >= 8) path.closePath();
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
 * runs and the other primitives is kept. A style's `opacity` and `dim` are applied to the colours (`applyStyle`), so
 * paths of a different opacity have a different stroke key and never share a run.
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
    if (run.stroke && applyStroke(ctx, run.stroke, scale)) {
      ctx.stroke(run.strokePath);
    }
    run = undefined;
  };
  for (let e = 0; e < elements.length; e++) {
    const element = elements[e];
    if (element.hidden && !options.drawHidden) continue;
    const style = options.styles?.[element.styleId];
    for (let p = 0; p < element.primitives.length; p++) {
      const source = element.primitives[p];
      if (!isPrimitiveDrawn(source, scale, options)) continue;
      const painted =
        source.kind === "path" && source.canvasStroke ? { ...source, stroke: source.canvasStroke } : source;
      const primitive = applyStyle(painted, style, options.dimColor);
      if (!primitive) continue;
      drawn++;
      if (primitive.kind === "path" || primitive.kind === "polygon") {
        const stroke = primitive.stroke;
        const fill = primitive.kind === "polygon" ? primitive.fill : undefined;
        const key = strokeKey(stroke, scale);
        if (run && endsRun(run, key, fill, maxRun)) flush();
        if (!run) run = { key, stroke, strokePath: new Path2D(), fillPath: new Path2D(), size: 0 };
        run.size++;
        if (primitive.kind === "path") {
          appendSegments(run.strokePath, primitive.segments, element.x, element.y, primitive.closed);
        } else {
          run.fill = fill;
          appendPolygon(run.fillPath, primitive.points, element.x, element.y);
          if (stroke) appendPolygon(run.strokePath, primitive.points, element.x, element.y);
        }
        continue;
      }
      flush();
      drawShape(ctx, primitive, source, element.x, element.y, scale, options.textPolicy);
    }
  }
  flush();
  return drawn;
}
