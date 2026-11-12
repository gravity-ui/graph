import type { TConnectionEffectUse } from "../../../components/canvas/connections/effects";
import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TUniformTypes } from "../../../components/canvas/connections/effects/types";
import type { TWebGLShape } from "../../../components/canvas/connections/lines/types";
import { INSTANCE_FLOATS, createEncodedChunk, encodeShapes } from "../../../components/canvas/connections/webgl/encode";
import { resolveSceneSize } from "../size";
import type { TScenePrimitive } from "../types";

import { NO_LIMIT, USE_BASE, checkSub, hasStrokeWidth, scaleBound } from "./encodeRects";
import type { TSlotOf } from "./encodeRects";

/** Offset of the straight rgba in a path instance (see `INSTANCE_FLOATS`). */
const COLOR_OFFSET = 8;

/** Floats of a path instance's element data: elementIndex, sub, stroke slot, 0, minScale, maxScale, 0, 0. */
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
 * unset draws nothing and is skipped. Widths are resolved at scale 1: camera-aware path widths are out of scope for the
 * slice. `select` skips paths without renumbering: `sub` stays the index in `primitives`.
 */
export function encodePaths(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  bucket: number,
  slotOf: TSlotOf,
  select: (primitive: TScenePrimitive, index: number) => boolean = selectAll
): TEncodedPaths {
  const chunk = createEncodedChunk();
  const lineElements: number[] = [];
  const curveElements: number[] = [];
  const effects: TConnectionEffectUse[] = [];
  primitives.forEach((primitive, sub) => {
    if (primitive.kind !== "path" || !select(primitive, sub)) return;
    checkSub(sub);
    const { stroke, effect } = primitive;
    if (!hasStrokeWidth(stroke)) return;
    const shape: TWebGLShape = {
      segments: primitive.segments,
      stroke: {
        // An unset colour: any parsable colour here, `USE_BASE` replaces it below.
        color: stroke.color ?? "#000",
        width: resolveSceneSize(stroke.width, 1),
        dash: stroke.dash ? { pattern: stroke.dash } : undefined,
      },
      effect: effect?.effect as unknown as ConnectionEffect<TUniformTypes, never> | undefined,
      params: effect?.params,
    };
    const data = [
      elementIndex,
      sub,
      slotOf(primitive.part),
      0,
      scaleBound(primitive.minScale, 0),
      scaleBound(primitive.maxScale, NO_LIMIT),
      0,
      0,
    ];
    const lines = chunk.lines.count;
    const curves = chunk.curves.count;
    encodeShapes([shape], bucket, chunk);
    if (stroke.color === undefined) {
      useBase(chunk.lines.data, lines, chunk.lines.count);
      useBase(chunk.curves.data, curves, chunk.curves.count);
    }
    lineElements.push(...elementData(data, chunk.lines.count - lines));
    curveElements.push(...elementData(data, chunk.curves.count - curves));
    if (effect) effects.push(effect);
  });
  return {
    lines: chunk.lines.data.slice(0, chunk.lines.count * INSTANCE_FLOATS),
    curves: chunk.curves.data.slice(0, chunk.curves.count * INSTANCE_FLOATS),
    lineElements: new Float32Array(lineElements),
    curveElements: new Float32Array(curveElements),
    effects,
  };
}
