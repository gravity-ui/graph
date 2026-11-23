import { sceneTextLayout, sceneTextMetrics } from "../text/textMetrics";
import { placeText, resolveTextSize, textClip } from "../text/textPlacement";
import type { TScenePrimitive, TSceneStroke, TSceneTextPolicy } from "../types";
import { resolveSceneSize } from "../utils/size";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

type TRectPrimitive = Extract<TScenePrimitive, { kind: "rect" }>;

type TRectPaths = { x: number; y: number; face?: Path2D; inset?: number; border?: Path2D };

// A primitive is immutable. Keep just its latest position and resolved border inset.
const rectPaths = new WeakMap<TScenePrimitive, TRectPaths>();

/** How far a stroke's centre line moves inwards from the shape's edge. */
function strokeInset(align: TSceneStroke["align"], width: number): number {
  if (align === "inside") return width / 2;
  if (align === "outside") return -width / 2;
  return 0;
}

function insetRadius(radius: number | readonly number[] | undefined, inset: number): number | number[] {
  if (radius === undefined) return 0;
  if (typeof radius === "number") return Math.max(0, radius - inset);
  return radius.map((value) => Math.max(0, value - inset));
}

/** Square and non-degenerate rectangles have direct Canvas commands equivalent to their paths. */
function drawSquareRect(
  ctx: CanvasRenderingContext2D,
  rect: TRectPrimitive,
  x: number,
  y: number,
  scale: number
): boolean {
  const radius = rect.radius;
  if (typeof radius === "number" ? radius !== 0 : radius?.some((value) => value !== 0)) return false;
  const inset =
    rect.border?.width === undefined ? 0 : strokeInset(rect.border.align, resolveSceneSize(rect.border.width, scale));
  // Outsetting an explicit zero radius rounds the border; an omitted radius stays square.
  if (radius !== undefined && inset < 0) return false;
  if (!(rect.width > Math.max(0, 2 * inset) && rect.height > Math.max(0, 2 * inset))) return false;
  if (rect.fill) {
    ctx.fillStyle = rect.fill;
    ctx.fillRect(x, y, rect.width, rect.height);
  }
  if (rect.border && applyStroke(ctx, rect.border, scale)) {
    ctx.strokeRect(x + inset, y + inset, rect.width - 2 * inset, rect.height - 2 * inset);
  }
  return true;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  rect: TRectPrimitive,
  source: TScenePrimitive,
  x: number,
  y: number,
  scale: number
): void {
  if (drawSquareRect(ctx, rect, x, y, scale)) return;
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
  const width = rect.border && applyStroke(ctx, rect.border, scale);
  if (width) {
    const inset = strokeInset(rect.border?.align, width);
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

/** Sets the stroke's style and returns its resolved width, or 0 when it draws nothing. */
export function applyStroke(ctx: CanvasRenderingContext2D, stroke: TSceneStroke, scale: number): number {
  if (stroke.color === undefined || stroke.width === undefined) return 0;
  const width = resolveSceneSize(stroke.width, scale);
  // Canvas ignores invalid line widths and would stroke with the previous width.
  if (!(width > 0) || !Number.isFinite(width)) return 0;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = width;
  ctx.setLineDash(stroke.dash ? [...stroke.dash] : []);
  return width;
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
  const rotation = primitive.rotation ?? 0;
  if (clip || opacity < 1 || rotation) ctx.save();
  if (opacity < 1) ctx.globalAlpha *= opacity;
  if (rotation) {
    ctx.translate(ox + place.x, oy + place.y);
    ctx.rotate(rotation);
    ctx.translate(-ox - place.x, -oy - place.y);
  }
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
  if (clip || opacity < 1 || rotation) ctx.restore();
}

/**
 * Draws a rect, circle, text or icon whose coordinates are relative to (ox, oy); `source` is the primitive before
 * styles (the text layout cache key).
 */
export function drawShape(
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
    case "polygon": {
      const path = new Path2D();
      appendPolygon(path, primitive.points, ox, oy);
      if (primitive.fill) {
        ctx.fillStyle = primitive.fill;
        ctx.fill(path);
      }
      if (primitive.stroke && applyStroke(ctx, primitive.stroke, scale)) ctx.stroke(path);
      return;
    }
    case "circle": {
      const { r, fill, border } = primitive;
      const x = ox + primitive.cx;
      const y = oy + primitive.cy;
      if (fill) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (!border) return;
      const width = applyStroke(ctx, border, scale);
      if (!width) return;
      // An inside border fills the radius at most. Keep a valid centre line for dashes at that limit.
      const strokeWidth = border.align === "inside" ? Math.min(width, r) : width;
      if (strokeWidth <= 0) return;
      if (strokeWidth !== width) ctx.lineWidth = strokeWidth;
      const inset = strokeInset(border.align, strokeWidth);
      if (!fill || inset !== 0) {
        ctx.beginPath();
        ctx.arc(x, y, r - inset, 0, 2 * Math.PI);
      }
      ctx.stroke();
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
