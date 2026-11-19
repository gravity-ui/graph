import type { TConnectionEffectUse } from "../../../components/canvas/connections/effects";
import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TUniformTypes } from "../../../components/canvas/connections/effects/types";
import { stockBezierSegments } from "../../../components/canvas/connections/geometry/segments";
import type { TWebGLShape } from "../../../components/canvas/connections/lines/types";
import { INSTANCE_FLOATS, createEncodedChunk, encodeShapes } from "../../../components/canvas/connections/webgl/encode";
import type { TEncodedChunk } from "../../../components/canvas/connections/webgl/encode";
import { ALL_LEVELS_MASK } from "../levels";
import type { TScenePrimitive } from "../types";

import { closeStroke } from "./closedStroke";
import { MAX_SUB, NO_LIMIT, USE_BASE, checkSub, hasStrokeWidth, scaleBound, writeSize } from "./encodeRects";
import type { TSlotOf } from "./encodeRects";
import { markOverviewCurves } from "./overviewCurves";

/** Offset of the straight rgba in a path instance (see `INSTANCE_FLOATS`). */
const COLOR_OFFSET = 8;

/**
 * Floats of a path instance's element data: elementIndex, sub, stroke slot, width minimum, minScale, maxScale,
 * level mask in the low three bits plus width mode in the high bits, width maximum.
 */
export const PATH_ELEMENT_FLOATS = 8;

export type TEncodedPaths = {
  /** Straight segments, `INSTANCE_FLOATS` each (the 4-vertex template). */
  lines: Float32Array;
  /** Curve pieces, `INSTANCE_FLOATS` each (the 34-vertex template). */
  curves: Float32Array;
  /** Element data per line instance, `PATH_ELEMENT_FLOATS` each. */
  lineElements: Float32Array;
  /** Element data per curve instance, `PATH_ELEMENT_FLOATS` each. */
  curveElements: Float32Array;
  /** The effect use of every path that has one, in primitive order. */
  effects: TConnectionEffectUse[];
  hasOverview: boolean;
};

function selectAll(): boolean {
  return true;
}

/** Writes `USE_BASE` as the colour of the instances [from, to): the path's stroke colour is unset. */
function useBase(data: Float32Array, from: number, to: number): void {
  for (let i = from; i < to; i++) data.set(USE_BASE, i * INSTANCE_FLOATS + COLOR_OFFSET);
}

/** The element data of `count` instances of one path. */
function elementData(data: readonly number[], count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(...data);
  return out;
}

/**
 * Path primitives as connection-line instances for the scale bucket, each with its element data (element, sub, the
 * stroke's part slot, scale bounds). An unset stroke colour is written as `USE_BASE`; a path whose stroke width is
 * unset draws nothing and is skipped. The shader resolves camera-aware widths from the packed width mode and bounds.
 * `select` skips paths without renumbering: `sub` is `subBase` plus the path's index in `primitives`.
 *
 * @param subBase The depth sub-order of the first primitive: a child element's primitives follow its parent's and its
 * earlier siblings'.
 * @param maxSub The largest sub the depth keys leave room for (`checkSub`).
 */
export function encodePaths(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  bucket: number,
  slotOf: TSlotOf,
  select: (primitive: TScenePrimitive, index: number) => boolean = selectAll,
  subBase = 0,
  maxSub = MAX_SUB,
  scratch?: TEncodedChunk,
  overviewChords?: 8 | 16
): TEncodedPaths {
  const chunk = scratch ?? createEncodedChunk();
  chunk.lines.count = 0;
  chunk.curves.count = 0;
  const lineElements: number[] = [];
  const curveElements: number[] = [];
  const effects: TConnectionEffectUse[] = [];
  let hasOverview = false;
  let widthSize: number[] | undefined;
  primitives.forEach((primitive, sub) => {
    if (primitive.kind !== "path" || !select(primitive, sub)) return;
    const at = subBase + sub;
    checkSub(at, maxSub);
    const { stroke, effect } = primitive;
    if (!hasStrokeWidth(stroke)) return;
    const width = stroke.width;
    let widthValue: number;
    let widthMode = 0;
    let minWidth = 0;
    let maxWidth = 0;
    if (typeof width === "number") {
      widthValue = width;
    } else {
      widthSize ??= [];
      writeSize(widthSize, 0, width);
      [widthMode, widthValue, minWidth, maxWidth] = widthSize;
    }
    const shape: TWebGLShape = {
      segments: primitive.segments,
      stroke: {
        // An unset colour: any parsable colour here, `USE_BASE` replaces it below.
        color: stroke.color ?? "#000",
        width: widthValue,
        dash: stroke.dash ? { pattern: stroke.dash } : undefined,
      },
      effect: effect?.effect as unknown as ConnectionEffect<TUniformTypes, never> | undefined,
      params: effect?.params,
      interaction: effect || primitive.effectShowsSelection ? primitive.interaction : undefined,
      effectShowsSelection: primitive.effectShowsSelection,
    };
    const data = [
      elementIndex,
      at,
      slotOf(primitive.part),
      minWidth,
      scaleBound(primitive.minScale, 0),
      scaleBound(primitive.maxScale, NO_LIMIT),
      (primitive.levelMask ?? ALL_LEVELS_MASK) + widthMode * 8,
      maxWidth,
    ];
    const lines = chunk.lines.count;
    const curves = chunk.curves.count;
    // Only dashes and effects read the longitudinal distances in the shader.
    const usesDistance = effect !== undefined || Boolean(stroke.dash?.length);
    encodeShapes([shape], bucket, chunk, usesDistance);
    if (primitive.closed && !usesDistance) closeStroke(primitive.segments, bucket, chunk, lines, curves);
    if (stroke.color === undefined) {
      useBase(chunk.lines.data, lines, chunk.lines.count);
      useBase(chunk.curves.data, curves, chunk.curves.count);
    }
    lineElements.push(...elementData(data, chunk.lines.count - lines));
    curveElements.push(...elementData(data, chunk.curves.count - curves));
    if (
      overviewChords &&
      typeof width === "number" &&
      !stroke.dash?.length &&
      primitive.part === "line" &&
      stockBezierSegments.has(primitive.segments)
    ) {
      hasOverview =
        markOverviewCurves(chunk.curves.data, curveElements, curves, chunk.curves.count, width, overviewChords) ||
        hasOverview;
    }
    if (effect) effects.push(effect);
  });
  return {
    // The opaque ranges copy both views before this scratch chunk is reused.
    lines: scratch
      ? chunk.lines.data.subarray(0, chunk.lines.count * INSTANCE_FLOATS)
      : chunk.lines.data.slice(0, chunk.lines.count * INSTANCE_FLOATS),
    curves: scratch
      ? chunk.curves.data.subarray(0, chunk.curves.count * INSTANCE_FLOATS)
      : chunk.curves.data.slice(0, chunk.curves.count * INSTANCE_FLOATS),
    lineElements: new Float32Array(lineElements),
    curveElements: new Float32Array(curveElements),
    effects,
    hasOverview,
  };
}
