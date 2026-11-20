import type { TScenePrimitive } from "../../types";
import { isFilledTriangle } from "../instances/encodeTriangles";
import { SUB_FLOAT } from "../order/translucentSteps";
import type { TElementSubs } from "../order/translucentSteps";
import { isTranslucentText } from "../text/encodeText";

import type { TBatch, TCompanion, TTranslucentWrite } from "./batchTypes";

/** The float of a companion instance that holds the primitive's sub. */
const COMPANION_SUB_FLOAT: Record<TCompanion["kind"], number> = { elements: SUB_FLOAT, subs: 0 };

/**
 * The companion data written with instances of a batch that keeps a companion list: one companion instance per
 * instance, or the lists would part.
 */
function companionData<TData extends ArrayLike<number>>(
  batch: TBatch,
  companion: TCompanion,
  instances: ArrayLike<number>,
  data?: TData
): TData {
  if (!data || data.length / companion.ranges.floats !== instances.length / batch.ranges.floats) {
    throw new Error(`The scene batch ${batch.model.id} needs one companion instance per instance`);
  }
  return data;
}

/**
 * Writes the instances of an element and their companion data, or removes the element when it has none. The ranges
 * copy them at once, so they may be an encode's views (`TInstanceView`): each is handed here before the next encode
 * with its encoder.
 */
export function setInstances(
  batch: TBatch,
  id: string,
  instances: ArrayLike<number>,
  companion?: ArrayLike<number>
): void {
  if (instances.length > 0) {
    batch.ranges.set(id, instances, Boolean(batch.pathRecords));
    if (batch.companion) {
      const data = companionData(batch, batch.companion, instances, companion);
      batch.companion.ranges.set(id, data, batch.companion.kind === "elements");
    }
  } else {
    removeInstances(batch, id);
  }
}

export function removeInstances(batch: TBatch, id: string): void {
  batch.ranges.delete(id);
  batch.companion?.ranges.delete(id);
}

/** Where a translucent write holds its subs: in its companion data when its batch keeps them there, else inline. */
export function subsOfWrite(write: TTranslucentWrite): TElementSubs {
  const { batch, instances, companion } = write;
  if (!batch.companion) return { subs: instances, floats: batch.ranges.floats };
  return {
    subs: companionData(batch, batch.companion, instances, companion),
    floats: batch.companion.ranges.floats,
    subFloat: COMPANION_SUB_FLOAT[batch.companion.kind],
  };
}

/** Geometry of the translucent pass. A text can emit new glyphs on relayout without changing its primitive. */
export function translucentPrimitives(
  primitives: readonly TScenePrimitive[],
  sources: readonly TElementSubs[],
  subBase: number
): readonly TScenePrimitive[] {
  if (primitives.length <= 1) return primitives;
  const emitted = new Set<number>();
  for (const { subs, floats, subFloat = SUB_FLOAT } of sources) {
    for (let at = subFloat; at < subs.length; at += floats) {
      const index = subs[at] - subBase;
      if (!Number.isInteger(index) || index < 0 || index >= primitives.length) return primitives;
      emitted.add(index);
    }
  }
  return emitted.size === primitives.length
    ? primitives
    : primitives.filter(
        (primitive, index) => emitted.has(index) || (primitive.kind === "text" && isTranslucentText(primitive))
      );
}

/** Unsupported primitives, including polygons beyond the filled arrow triangles. */
export function classifyPrimitives(primitives: readonly TScenePrimitive[]) {
  const counts = { polygon: 0, icon: 0, sprites: false };
  for (const primitive of primitives) {
    if (primitive.kind === "polygon" && !isFilledTriangle(primitive)) counts.polygon++;
    else if (primitive.kind === "icon") counts.icon++;
    else if (primitive.kind === "sprite") counts.sprites = true;
  }
  return counts;
}
