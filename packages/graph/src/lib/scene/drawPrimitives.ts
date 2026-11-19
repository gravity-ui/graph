import type { TSceneLevel } from "../../services/scene/types";

import { readColorRgba } from "./colorAlpha";
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
  const inset = rect.border ? strokeInset(rect.border, scale) : 0;
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

/** Consecutive opaque paths with the same stroke. */
type TRun = { key: string; stroke: TSceneStroke; path: Path2D; size: number };

export type TDrawElementsOptions = {
  /**
   * Maximum consecutive opaque paths per stroke. A positive integer, Infinity, or undefined (unbounded).
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

type TPaint = { source: TScenePrimitive; primitive: TScenePrimitive };
type TPaints = {
  style?: TSceneStyle;
  dimColor?: string;
  paints: readonly TPaint[];
};

// Styles change on tag/theme updates; the primitive list changes on geometry edits. Neither changes during a pan.
const elementPaints = new WeakMap<readonly TScenePrimitive[], TPaints>();

function paintsOf(
  primitives: readonly TScenePrimitive[],
  style: TSceneStyle | undefined,
  dimColor: string | undefined
): readonly TPaint[] {
  const cached = elementPaints.get(primitives);
  if (cached && cached.style === style && cached.dimColor === dimColor) return cached.paints;
  const paints: TPaint[] = [];
  for (const source of primitives) {
    const painted = source.kind === "path" && source.canvasStroke ? { ...source, stroke: source.canvasStroke } : source;
    const primitive = applyStyle(painted, style, dimColor);
    if (primitive) paints.push({ source, primitive });
  }
  elementPaints.set(primitives, { style, dimColor, paints });
  return paints;
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

type TPathSpan = {
  dimColor?: string;
  members: {
    element: TSceneElement;
    primitives: readonly TScenePrimitive[];
    style?: TSceneStyle;
    x: number;
    y: number;
  }[];
  run: TRun;
};

// Keep only the spans used by the last paint of this canvas. Chunk boundaries follow scene order so a path
// entering the viewport or changing during a drag does not invalidate the rest of a long series of connections.
const canvasSpans = new WeakMap<CanvasRenderingContext2D, Map<TSceneElement, TPathSpan>>();
const SPAN_SIZE = 128;

/** A CSS colour whose opacity cannot be established needs its own paint at crossings. */
function isOpaque(color: string): boolean {
  return readColorRgba(color)?.[3] === 1;
}

function pathSpanEnd(elements: readonly TSceneElement[], start: number): number {
  const bucket = Math.floor(elements[start].order / SPAN_SIZE);
  let end = start + 1;
  while (
    end < elements.length &&
    end - start < SPAN_SIZE &&
    Math.floor(elements[end].order / SPAN_SIZE) === bucket &&
    elements[end].primitives[0]?.kind === "path"
  ) {
    end++;
  }
  return end;
}

function samePathSpan(
  previous: TPathSpan,
  elements: readonly TSceneElement[],
  start: number,
  end: number,
  options: TDrawElementsOptions
): boolean {
  return (
    previous.dimColor === options.dimColor &&
    previous.members.length === end - start &&
    previous.members.every((member, i) => {
      const element = elements[start + i];
      return (
        member.element === element &&
        !element.hidden &&
        element.primitives === member.primitives &&
        options.styles?.[element.styleId] === member.style &&
        element.x === member.x &&
        element.y === member.y
      );
    })
  );
}

function opaquePathSpan(
  elements: readonly TSceneElement[],
  start: number,
  end: number,
  options: TDrawElementsOptions,
  previous: TPathSpan | undefined
): TPathSpan | undefined {
  if (end - start < 2) return undefined;
  if (previous && samePathSpan(previous, elements, start, end, options)) return previous;
  const members: TPathSpan["members"] = [];
  let run: TRun | undefined;
  for (let i = start; i < end; i++) {
    const element = elements[i];
    if (element.hidden) return undefined;
    const style = options.styles?.[element.styleId];
    // These spans can be used at any zoom and level. The ordinary path handles scale-dependent geometry and visibility.
    for (const { primitive } of paintsOf(element.primitives, style, options.dimColor)) {
      if (
        primitive.kind !== "path" ||
        primitive.minScale !== undefined ||
        primitive.maxScale !== undefined ||
        primitive.levelMask !== undefined ||
        !primitive.stroke?.color ||
        typeof primitive.stroke.width !== "number" ||
        !isOpaque(primitive.stroke.color)
      ) {
        return undefined;
      }
      const key = strokeKey(primitive.stroke, 1);
      if (run && run.key !== key) return undefined;
      run ??= { key, stroke: primitive.stroke, path: new Path2D(), size: 0 };
      appendSegments(run.path, primitive.segments, element.x, element.y, primitive.closed);
      run.size++;
    }
    members.push({ element, x: element.x, y: element.y, primitives: element.primitives, style });
  }
  return run ? { run, members, dimColor: options.dimColor } : undefined;
}

/** Draws visible primitives in scene order. Only consecutive opaque strokes may share a paint. */
export function drawElements(
  ctx: CanvasRenderingContext2D,
  elements: readonly TSceneElement[],
  scale: number,
  options: TDrawElementsOptions = {}
): number {
  const maxRun = resolveMaxRun(options.maxRun);
  const compositeOpaque = ctx.globalAlpha === 1 && ctx.globalCompositeOperation === "source-over";
  let run: TRun | undefined;
  let drawn = 0;
  const cached = canvasSpans.get(ctx);
  let next: Map<TSceneElement, TPathSpan> | undefined;
  const useSpans = compositeOpaque && maxRun === Infinity && elements.length >= SPAN_SIZE;
  let nextSpan = 0;
  const flush = (): void => {
    if (!run) return;
    if (applyStroke(ctx, run.stroke, scale)) ctx.stroke(run.path);
    run = undefined;
  };
  const strokePath = (stroke: TSceneStroke, key: string, size: number): Path2D => {
    if (run && (run.key !== key || run.size + size > maxRun)) flush();
    run ??= { key, stroke, path: new Path2D(), size: 0 };
    run.size += size;
    return run.path;
  };
  const drawPath = (primitive: Extract<TScenePrimitive, { kind: "path" }>, x: number, y: number): void => {
    const stroke = primitive.stroke;
    if (!stroke?.color || stroke.width === undefined) return;
    const path = strokePath(stroke, strokeKey(stroke, scale), 1);
    appendSegments(path, primitive.segments, x, y, primitive.closed);
    if (!compositeOpaque || !isOpaque(stroke.color)) flush();
  };
  for (let e = 0; e < elements.length; e++) {
    const element = elements[e];
    if (element.hidden && !options.drawHidden) continue;
    if (useSpans && e >= nextSpan && element.primitives[0]?.kind === "path") {
      nextSpan = pathSpanEnd(elements, e);
      const span = opaquePathSpan(elements, e, nextSpan, options, cached?.get(element));
      if (span) {
        strokePath(span.run.stroke, span.run.key, span.run.size).addPath(span.run.path);
        drawn += span.run.size;
        (next ??= new Map()).set(element, span);
        e = nextSpan - 1;
        continue;
      }
    }
    const style = options.styles?.[element.styleId];
    const paints = paintsOf(element.primitives, style, options.dimColor);
    for (let p = 0; p < paints.length; p++) {
      const { source, primitive } = paints[p];
      if (!isPrimitiveDrawn(primitive, scale, options)) continue;
      drawn++;
      if (primitive.kind === "path") {
        drawPath(primitive, element.x, element.y);
        continue;
      }
      flush();
      drawShape(ctx, primitive, source, element.x, element.y, scale, options.textPolicy);
    }
  }
  flush();
  if (next) canvasSpans.set(ctx, next);
  else canvasSpans.delete(ctx);
  return drawn;
}
