import type { TSceneLevel } from "../../../services/scene/types";
import { isOnLevel } from "../levels";
import { trimConnectionShaft } from "../styles/connectionArrow";
import { applyStyle } from "../styles/style";
import type { TSceneElement, TScenePrimitive, TSceneStroke, TSceneStyle, TSceneTextPolicy } from "../types";
import { readColorRgba } from "../utils/colorAlpha";
import { cutPathGaps } from "../utils/cutPathGaps";

import { appendSegments, applyStroke, drawShape, strokeKey } from "./drawShapes";

type TCanvasSceneElement = TSceneElement<HTMLImageElement | HTMLCanvasElement>;
type TCanvasPrimitives = TCanvasSceneElement["primitives"];

export function isPrimitiveVisible(primitive: TScenePrimitive, scale: number, level?: TSceneLevel): boolean {
  if (primitive.minScale !== undefined && scale < primitive.minScale) return false;
  if (primitive.maxScale !== undefined && scale >= primitive.maxScale) return false;
  return isOnLevel(primitive.levelMask, level);
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
  if (options.skipText && primitive.kind === "text") return false;
  return isPrimitiveVisible(primitive, scale, options.level);
}

type TPaint = { source: TScenePrimitive; primitive: TScenePrimitive };

type TPaints = {
  style?: TSceneStyle;
  dimColor?: string;
  paints: readonly TPaint[];
};

// Styles change on tag/theme updates; the primitive list changes on geometry edits. Neither changes during a pan.
const elementPaints = new WeakMap<TCanvasPrimitives, TPaints>();

function paintsOf(
  primitives: TCanvasPrimitives,
  style: TSceneStyle | undefined,
  dimColor: string | undefined
): readonly TPaint[] {
  const cached = elementPaints.get(primitives);
  if (cached && cached.style === style && cached.dimColor === dimColor) return cached.paints;
  const paints: TPaint[] = [];
  for (let i = 0; i < primitives.length; i++) {
    const item = primitives[i];
    if (item.kind === "sprite") continue;
    const next = primitives[1];
    const source = i === 0 && next?.kind === "path" ? trimConnectionShaft(item, next, style) : item;
    const painted = source.kind === "path" && source.canvasStroke ? { ...source, stroke: source.canvasStroke } : source;
    const primitive = applyStyle(painted, style, dimColor);
    if (primitive?.kind === "path" && primitive.arrowPosition !== undefined && primitive.closed) {
      const { segments, stroke } = primitive;
      if (stroke.width !== undefined) {
        const points = new Float32Array([
          segments[0],
          segments[1],
          segments[6],
          segments[7],
          segments[14],
          segments[15],
        ]);
        paints.push({
          source,
          primitive: { ...primitive, kind: "polygon", points, fill: stroke.color, stroke: undefined },
        });
      }
    } else if (primitive) paints.push({ source, primitive });
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

type TPathSpan = {
  dimColor?: string;
  members: {
    element: TCanvasSceneElement;
    primitives: TCanvasPrimitives;
    style?: TSceneStyle;
    x: number;
    y: number;
  }[];
  run: TRun;
};

// Keep only the spans used by the last paint of this canvas. Chunk boundaries follow scene order so a path
// entering the viewport or changing during a drag does not invalidate the rest of a long series of connections.
const canvasSpans = new WeakMap<CanvasRenderingContext2D, Map<TCanvasSceneElement, TPathSpan>>();

const SPAN_SIZE = 128;

/** A CSS colour whose opacity cannot be established needs its own paint at crossings. */
function isOpaque(color: string): boolean {
  return readColorRgba(color)?.[3] === 1;
}

function pathSpanEnd(elements: readonly TCanvasSceneElement[], start: number): number {
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
  elements: readonly TCanvasSceneElement[],
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
  elements: readonly TCanvasSceneElement[],
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
        primitive.gaps !== undefined ||
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
  elements: readonly TCanvasSceneElement[],
  scale: number,
  options: TDrawElementsOptions = {}
): number {
  const maxRun = resolveMaxRun(options.maxRun);
  const compositeOpaque = ctx.globalAlpha === 1 && ctx.globalCompositeOperation === "source-over";
  let run: TRun | undefined;
  let drawn = 0;
  const cached = canvasSpans.get(ctx);
  let next: Map<TCanvasSceneElement, TPathSpan> | undefined;
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
    const cut = primitive.gaps && cutPathGaps(primitive.segments, primitive.gaps);
    if (cut && stroke.dash?.length) {
      flush();
      ctx.save();
      if (applyStroke(ctx, stroke, scale)) {
        const initialOffset = ctx.lineDashOffset;
        for (const [i, { offset, distance }] of cut.runs.entries()) {
          const path = new Path2D();
          appendSegments(path, cut.segments.subarray(offset, cut.runs[i + 1]?.offset), x, y);
          ctx.lineDashOffset = initialOffset + distance;
          ctx.stroke(path);
        }
      }
      ctx.restore();
      return;
    }
    const path = strokePath(stroke, strokeKey(stroke, scale), 1);
    if (cut) {
      for (const [i, { offset }] of cut.runs.entries()) {
        appendSegments(path, cut.segments.subarray(offset, cut.runs[i + 1]?.offset), x, y);
      }
    } else {
      appendSegments(path, primitive.segments, x, y, primitive.closed);
    }
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
