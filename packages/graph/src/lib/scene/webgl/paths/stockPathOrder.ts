import { SUB_FLOAT } from "../order/translucentSteps";

import { PATH_ELEMENT_FLOATS } from "./pathRecords";

type TPathDraw<T> = { batch: T; first: number; count: number; curveDetail?: number };
type TPathDrawSource = { elements: Float32Array; tie: number };
type TOrderedPathDraw<T> = TPathDraw<T> & { key: number; sub: number; tie: number };

/** Keeps native barriers and reversals intact while joining already adjacent resident ranges. */
function mergeAdjacentDraws<T>(ordered: TPathDraw<T>[]): TPathDraw<T>[] {
  let kept = 0;
  for (const draw of ordered) {
    const last = ordered[kept - 1];
    if (
      last &&
      last.batch === draw.batch &&
      last.curveDetail === draw.curveDetail &&
      last.first + last.count === draw.first
    )
      last.count += draw.count;
    else ordered[kept++] = draw;
  }
  ordered.length = kept;
  return ordered;
}

/**
 * Puts culled resident paths in strict painter order, keeping each program and template available to the draw
 * planner. The companion stores each primitive's absolute sub, including any child offset. The table supplies
 * the current root depth and the hidden sentinel. Ties follow pass order, then physical piece order.
 */
export function orderResidentPathDraws<T>(
  draws: readonly TPathDraw<T>[],
  table: Float32Array,
  sourceOf: (batch: T) => TPathDrawSource | undefined,
  visible: (batch: T, first: number, count: number) => boolean
): TPathDraw<T>[] | undefined {
  const ordered: TOrderedPathDraw<T>[] = [];
  for (const draw of draws) {
    const { batch, first, count } = draw;
    if (count === 0) continue;
    if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0) return undefined;
    const source = sourceOf(batch);
    const end = first + count;
    if (!source || end > source.elements.length / PATH_ELEMENT_FLOATS) return undefined;
    const { elements, tie } = source;
    for (let from = first; from < end; ) {
      const at = from * PATH_ELEMENT_FLOATS;
      const owner = elements[at];
      const sub = elements[at + SUB_FLOAT];
      let next = from + 1;
      while (
        next < end &&
        elements[next * PATH_ELEMENT_FLOATS] === owner &&
        elements[next * PATH_ELEMENT_FLOATS + SUB_FLOAT] === sub
      )
        next++;
      const key = table[owner * 4 + 2];
      if (key >= 0 && visible(batch, from, next - from)) {
        ordered.push({ ...draw, first: from, count: next - from, key, sub, tie });
      }
      from = next;
    }
  }
  ordered.sort((a, b) => a.key - b.key || a.sub - b.sub || a.tie - b.tie || a.first - b.first);
  return mergeAdjacentDraws(ordered);
}
