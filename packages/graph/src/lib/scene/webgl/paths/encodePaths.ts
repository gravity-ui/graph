import { stockBezierSegments } from "../../../../components/canvas/connections/geometry/segments";
import { ALL_LEVELS_MASK } from "../../levels";
import type { TScenePrimitive } from "../../types";
import {
  InstanceList,
  MAX_SUB,
  NO_LIMIT,
  USE_BASE,
  checkSub,
  hasStrokeWidth,
  scaleBound,
  writeSize,
} from "../instances/encodeRects";
import type { TSlotOf } from "../instances/encodeRects";

import { closeStroke } from "./closedStroke";
import { INSTANCE_FLOATS, appendPathInstances, createEncodedChunk } from "./encodePathInstances";
import { markOverviewCurves } from "./overviewCurves";
import { PATH_ELEMENT_FLOATS } from "./pathRecords";

/** Offset of the straight rgba in a path instance (see `INSTANCE_FLOATS`). */
const COLOR_OFFSET = 8;

export type TEncodedPaths = {
  /** Straight segments, `INSTANCE_FLOATS` each (the 4-vertex template). */
  lines: Float32Array;
  /** Curve pieces, `INSTANCE_FLOATS` each (the 34-vertex template). */
  curves: Float32Array;
  /** Element data per line instance, `PATH_ELEMENT_FLOATS` each. */
  lineElements: Float32Array;
  /** Element data per curve instance, `PATH_ELEMENT_FLOATS` each. */
  curveElements: Float32Array;
  hasOverview: boolean;
};

function selectAll(): boolean {
  return true;
}

/** Writes `USE_BASE` as the colour of the instances [from, to): the path's stroke colour is unset. */
function useBase(data: Float32Array, from: number, to: number): void {
  for (let i = from; i < to; i++) data.set(USE_BASE, i * INSTANCE_FLOATS + COLOR_OFFSET);
}

/** Path vertices and their element records share a lifetime within one encode. */
export function createPathScratch() {
  return {
    chunk: createEncodedChunk(),
    lineElements: new InstanceList(PATH_ELEMENT_FLOATS),
    curveElements: new InstanceList(PATH_ELEMENT_FLOATS),
  };
}

function appendElementData(list: InstanceList, data: readonly number[], count: number): void {
  const at = list.claim(count);
  const buffer = list.buffer;
  for (let i = 0; i < count; i++) buffer.set(data, at + i * PATH_ELEMENT_FLOATS);
}

const NO_RECORDS = new Float32Array(0);

function pathRecords(data: Float32Array, length: number, retain: boolean): Float32Array {
  if (length === 0) return NO_RECORDS;
  return retain ? data.slice(0, length) : data.subarray(0, length);
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
  {
    scratch = createPathScratch(),
    retain = false,
    overviewChords,
  }: { scratch?: ReturnType<typeof createPathScratch>; retain?: boolean; overviewChords?: 8 | 16 } = {}
): TEncodedPaths {
  const { chunk, lineElements, curveElements } = scratch;
  chunk.lines.count = 0;
  chunk.curves.count = 0;
  lineElements.reset();
  curveElements.reset();
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
    appendPathInstances(primitive, widthValue, bucket, chunk, usesDistance);
    if (primitive.closed && !primitive.gaps && !usesDistance && primitive.arrowPosition === undefined)
      closeStroke(primitive.segments, bucket, chunk, lines, curves);
    if (stroke.color === undefined) {
      useBase(chunk.lines.data, lines, chunk.lines.count);
      useBase(chunk.curves.data, curves, chunk.curves.count);
    }
    appendElementData(lineElements, data, chunk.lines.count - lines);
    appendElementData(curveElements, data, chunk.curves.count - curves);
    if (
      overviewChords &&
      !primitive.gaps &&
      typeof width === "number" &&
      !stroke.dash?.length &&
      primitive.part === "line" &&
      stockBezierSegments.has(primitive.segments)
    ) {
      hasOverview =
        markOverviewCurves(
          chunk.curves.data,
          curveElements.buffer,
          curves,
          chunk.curves.count,
          width,
          overviewChords
        ) || hasOverview;
    }
  });
  return {
    // Opaque ranges consume the views immediately; translucent writes can outlive this encode.
    lines: pathRecords(chunk.lines.data, chunk.lines.count * INSTANCE_FLOATS, retain),
    curves: pathRecords(chunk.curves.data, chunk.curves.count * INSTANCE_FLOATS, retain),
    lineElements: pathRecords(lineElements.buffer, chunk.lines.count * PATH_ELEMENT_FLOATS, retain),
    curveElements: pathRecords(curveElements.buffer, chunk.curves.count * PATH_ELEMENT_FLOATS, retain),
    hasOverview,
  };
}
