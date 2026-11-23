import { ALL_LEVELS_MASK } from "../../levels";
import type { TScenePrimitive } from "../../types";

import {
  NO_LIMIT,
  checkSub,
  createInstanceLists,
  hasStrokeWidth,
  isTranslucentFloats,
  paintFloats,
  scaleBound,
  takeLists,
} from "./encodeRects";
import type { TEncodedInstances, TSlotOf } from "./encodeRects";

type TPolygon = Extract<TScenePrimitive, { kind: "polygon" }>;

export const TRIANGLE_FLOATS = 16;

const TRIANGLE_LISTS = createInstanceLists(TRIANGLE_FLOATS);

export function isFilledTriangle(primitive: TScenePrimitive): primitive is TPolygon {
  // shortcut: fill-only triangles for arrowheads. Add polygon tessellation if general polygon support is needed.
  return (
    primitive.kind === "polygon" &&
    primitive.points.length === 6 &&
    (primitive.fill !== undefined ? Boolean(primitive.fill) : primitive.part !== undefined) &&
    !hasStrokeWidth(primitive.stroke)
  );
}

export function encodeTriangles(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  slotOf: TSlotOf,
  subBase: number,
  maxSub: number
): TEncodedInstances {
  const { opaque, translucent } = takeLists(TRIANGLE_LISTS);
  for (let sub = 0; sub < primitives.length; sub++) {
    const primitive = primitives[sub];
    if (!isFilledTriangle(primitive)) continue;
    const at = subBase + sub;
    checkSub(at, maxSub);
    const fill = paintFloats(primitive.fill);
    const out = (isTranslucentFloats(fill) ? translucent : opaque).next();
    out[0] = elementIndex;
    out[1] = at;
    out[2] = slotOf(primitive.part);
    out[3] = primitive.levelMask ?? ALL_LEVELS_MASK;
    out.set(primitive.points, 4);
    out[10] = scaleBound(primitive.minScale, 0);
    out[11] = scaleBound(primitive.maxScale, NO_LIMIT);
    out.set(fill, 12);
  }
  return { opaque: opaque.view(), translucent: translucent.toArray() };
}
