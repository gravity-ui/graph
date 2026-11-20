import type { InstanceRanges } from "../instances/InstanceRanges";

import type { TTranslucentOrderCache, TTranslucentRun, TTranslucentSource } from "./translucentOrder";
import { ELEMENT_KEYS, maxStepsOf } from "./translucentSteps";

/** Instances of one source with one draw position `(level, step)`: a contiguous range of its buffer. */
export type TBucket = { bucket: number; first: number; count: number };

export type TSourceSnapshot = {
  layout: number;
  subBits: number;
  levelRevision?: number;
  positions: Float64Array;
  buckets: TBucket[];
};

/** The draw position of a step of an element on a level at the depth's sub-order width: levels first, then steps. */
export function bucketOf(level: number, step: number, subBits: number): number {
  return level * maxStepsOf(subBits) + step;
}

/**
 * The buffer order of a chunk of translucent instances: its level, its step, then its element key. The order is the
 * same at every width that holds the scene's roots; the numbers are not, so they are never kept across frames.
 */
export function chunkOrder(level: number, step: number, elementKey: number, subBits: number): number {
  return bucketOf(level, step, subBits) * ELEMENT_KEYS + elementKey;
}

/**
 * Buckets beyond one per draw position (`outOfPlace`) that level changes may leave before `orderTranslucent` sorts
 * the data. Each costs about one draw call; a sort moves and uploads every instance between the first and the last
 * chunk it moves.
 */
export const MAX_OUT_OF_PLACE = 16;

function appendBucket(buckets: TBucket[], bucket: number, first: number, count: number): void {
  const last = buckets[buckets.length - 1];
  if (last && last.bucket === bucket && last.first + last.count === first) last.count += count;
  else buckets.push({ bucket, first, count });
}

/** A source's ranges grouped by draw position, in buffer order; a sorted source has one bucket per position. */
export function sourceBuckets(
  ranges: InstanceRanges,
  levelOf: (id: string) => number,
  subBits: number,
  visible?: (first: number, count: number) => boolean
): TBucket[] {
  const buckets: TBucket[] = [];
  ranges.forEachRange((id, offset, count, step) => {
    if (visible && !visible(offset, count)) return;
    appendBucket(buckets, bucketOf(levelOf(id), step, subBits), offset, count);
  });
  return buckets;
}

/** The buckets in draw order: by draw position, then by buffer order. */
export function sortBuckets(buckets: readonly TBucket[]): TBucket[] {
  const groups = new Map<number, TBucket[]>();
  const unordered = new Set<number>();
  for (const bucket of buckets) {
    const group = groups.get(bucket.bucket);
    if (!group) groups.set(bucket.bucket, [bucket]);
    else {
      if (group[group.length - 1].first > bucket.first) unordered.add(bucket.bucket);
      group.push(bucket);
    }
  }
  const sorted: TBucket[] = [];
  // sourceBuckets already visits physical offsets in order. Sort only the few distinct draw positions, rather
  // than comparing every fragment; keep the helper exact for callers supplying arbitrary physical order too.
  for (const [position, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    if (unordered.has(position)) group.sort((a, b) => a.first - b.first);
    for (const bucket of group) sorted.push(bucket);
  }
  return sorted;
}

export function sameBucket(a: TBucket, b: TBucket): boolean {
  return a === b || (a.bucket === b.bucket && a.first === b.first && a.count === b.count);
}

/** A global level revision need not change this source's actual draw positions. */
export function cachedSourceBuckets(
  ranges: InstanceRanges,
  levelOf: (id: string) => number,
  subBits: number,
  cache: TTranslucentOrderCache
): TBucket[] {
  const sources = (cache.sources ??= new WeakMap());
  let snapshot = sources.get(ranges);
  const layout = ranges.layoutRevision;
  const levelRevision = cache.levelRevision;
  if (snapshot && snapshot.subBits === subBits && levelRevision !== undefined) {
    const sameLayout = snapshot.layout === layout;
    const sameLevels = snapshot.levelRevision === levelRevision;
    if (sameLayout && sameLevels) return snapshot.buckets;
    const changed = sameLevels ? [] : snapshot.levelRevision === levelRevision - 1 ? cache.changedLevelIds : undefined;
    // A delta covers exactly one revision. For a small change, query the source's existing element index.
    if (
      sameLayout &&
      changed &&
      changed.length <= snapshot.positions.length &&
      !changed.some((id) => ranges.countOf(id) > 0)
    ) {
      snapshot.levelRevision = levelRevision;
      return snapshot.buckets;
    }
  }

  const previous = snapshot?.buckets;
  let changed = false;
  if (!snapshot || snapshot.layout !== layout) {
    changed = true;
    let count = 0;
    ranges.forEachRange(() => count++);
    // Float64 keeps the existing JS-number bucket domain, including positions beyond Uint32.
    snapshot = {
      layout: ranges.layoutRevision,
      subBits,
      levelRevision,
      positions: snapshot?.positions.length === count ? snapshot.positions : new Float64Array(count),
      buckets: [],
    };
    sources.set(ranges, snapshot);
  } else {
    let index = 0;
    const positions = snapshot.positions;
    ranges.forEachRange((id, _first, _count, step) => {
      if (changed) return;
      changed = bucketOf(levelOf(id), step, subBits) !== positions[index++];
    });
  }
  snapshot.subBits = subBits;
  snapshot.levelRevision = levelRevision;
  if (changed) {
    const physical: TBucket[] = [];
    const positions = snapshot.positions;
    let index = 0;
    ranges.forEachRange((id, first, count, step) => {
      const bucket = bucketOf(levelOf(id), step, subBits);
      positions[index++] = bucket;
      appendBucket(physical, bucket, first, count);
    });
    const sorted = sortBuckets(physical);
    // Reusing a hole or rebuilding the layout can leave the effective schedule unchanged too.
    snapshot.buckets =
      previous?.length === sorted.length && sorted.every((bucket, index) => sameBucket(bucket, previous[index]))
        ? previous
        : sorted;
  }
  return snapshot.buckets;
}

/** Buckets beyond one per draw position in a sorted bucket list: what out-of-place chunks add. */
export function outOfPlace(sorted: readonly TBucket[]): number {
  let extra = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].bucket === sorted[i - 1].bucket) extra++;
  return extra;
}

/**
 * Merges the buckets of every source into draw calls: the lowest draw position first, the lower source index first on
 * a tie, and a bucket that follows a bucket of the same source in draw order and in its buffer joins its draw call.
 */
export function mergeBuckets(sources: readonly (readonly TBucket[])[]): TTranslucentRun[] {
  const runs: TTranslucentRun[] = [];
  mergeBucketSpan(
    sources,
    sources.map(() => 0),
    sources.map((list) => list.length),
    runs
  );
  return runs;
}

/** Append the sorted fragments in [next, ends) to the runs, joining an adjacent draw already in the output. */
function mergeBucketSpan(
  sources: readonly (readonly TBucket[])[],
  next: number[],
  ends: readonly number[],
  runs: TTranslucentRun[]
): void {
  for (;;) {
    let best = -1;
    let bestBucket = Infinity;
    for (let source = 0; source < sources.length; source++) {
      const bucket = sources[source][next[source]];
      if (next[source] < ends[source] && bucket.bucket < bestBucket) {
        best = source;
        bestBucket = bucket.bucket;
      }
    }
    if (best < 0) return;
    // Every fragment of this source at the winning position precedes the next source. Retained slots can leave
    // thousands of such fragments; search the sources once per position, not once per physical fragment.
    do {
      const bucket = sources[best][next[best]++];
      const last = runs[runs.length - 1];
      if (last && last.source === best && last.first + last.count === bucket.first) last.count += bucket.count;
      else runs.push({ source: best, first: bucket.first, count: bucket.count });
    } while (next[best] < ends[best] && sources[best][next[best]].bucket === bestBucket);
  }
}

/** Filters shader-inactive draws, sharing unchanged runs and copying only merges across inactive buffer gaps. */
export function filterTranslucentRuns(
  input: readonly TTranslucentRun[],
  visible: (source: number, first: number, count: number) => boolean,
  bridge: (source: number) => boolean = () => true,
  gapVisible = visible
): TTranslucentRun[] {
  const runs: TTranslucentRun[] = [];
  let borrowed = false;
  for (const run of input) {
    if (!visible(run.source, run.first, run.count)) continue;
    const last = runs[runs.length - 1];
    const gap = last ? run.first - last.first - last.count : -1;
    if (
      last &&
      last.source === run.source &&
      gap >= 0 &&
      (gap === 0 || bridge(run.source)) &&
      !gapVisible(run.source, last.first + last.count, gap)
    ) {
      if (borrowed) runs[runs.length - 1] = { ...last, count: last.count + gap + run.count };
      else last.count += gap + run.count;
      borrowed = false;
    } else {
      runs.push(run);
      borrowed = true;
    }
  }
  return runs;
}

/**
 * Returns the draw calls of all sources: for each level, for each step, an instanced draw per program with instances
 * there. The elements of one level never overlap (`TranslucentLevels`), so they share draws, and the steps keep each
 * element's own primitive order; where translucent primitives overlap, this is the scene order. `levelOf` gives an
 * element's level, `keyOf` its element key (below `ELEMENT_KEYS`) and `subBits` the depth's sub-order width of this
 * frame, which bounds the steps of an element.
 *
 * With `compact` (the default; the backend passes it after structural changes), dense sources are sorted by
 * `(level, step, element key)`, primitive order kept inside a chunk, so each draw position is one contiguous range.
 * Without it a chunk whose level changed is drawn from its resident offset at its new draw position, adding draws
 * instead of moving its neighbours. Once more than `MAX_OUT_OF_PLACE` dense buckets are out of place, those sources
 * are sorted anyway. Retained sources never move: their logical bucket schedule is rebuilt over the live ranges.
 */
export function orderTranslucent(
  sources: readonly TTranslucentSource[],
  levelOf: (id: string) => number,
  keyOf: (id: string) => number,
  subBits: number,
  compact = true,
  visible?: (source: number, first: number, count: number) => boolean
): TTranslucentRun[] {
  const bucketLists = (): TBucket[][] =>
    sources.map((source, index) =>
      sortBuckets(
        sourceBuckets(source.instances, levelOf, subBits, visible && ((first, count) => visible(index, first, count)))
      )
    );
  if (compact) sortDenseSources(sources, levelOf, keyOf, subBits);
  let lists = bucketLists();
  if (
    !compact &&
    lists.reduce((sum, list, source) => sum + (sources[source].instances.layoutRetained ? 0 : outOfPlace(list)), 0) >
      MAX_OUT_OF_PLACE
  ) {
    sortDenseSources(sources, levelOf, keyOf, subBits);
    lists = bucketLists();
  }
  return mergeBuckets(lists);
}

export function sortDenseSources(
  sources: readonly TTranslucentSource[],
  levelOf: (id: string) => number,
  keyOf: (id: string) => number,
  subBits: number
): void {
  const order = (id: string, step: number): number => chunkOrder(levelOf(id), step, keyOf(id), subBits);
  for (const { instances, companion } of sources) {
    if (instances.layoutRetained) continue;
    instances.sortBy(order);
    companion?.sortBy(order);
  }
}
