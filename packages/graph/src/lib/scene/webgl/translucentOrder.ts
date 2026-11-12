import type { InstanceRanges, TStepInstances } from "./InstanceRanges";
import { SCENE_DEPTH } from "./depth";

/** The depth keys of elements: the raised zIndex band, then the rank in it. */
const ELEMENT_KEYS = 2 ** (SCENE_DEPTH.BAND_BITS + SCENE_DEPTH.RANK_BITS);

/**
 * The steps an element can have: one per change of program in primitive order, so at most one per primitive, or two
 * for a path (its line pieces, then its curve pieces).
 */
export const MAX_STEPS = 2 * 2 ** SCENE_DEPTH.SUB_BITS;

/** The float of a rect or glyph instance, and of a path instance's element data, that holds the primitive's `sub`. */
export const SUB_FLOAT = 1;

/** One program's translucent instances of one element: `subs` holds each instance's `sub` at float `SUB_FLOAT`. */
export type TElementSubs = { subs: Float32Array; floats: number };

/** Consecutive instances of one element and one program that share a step. */
export type TStepChunk = { step: number; first: number; count: number };

/**
 * The local steps of one element's translucent instances. The instances of all its programs are merged in primitive
 * order (`sub`; on a tie, which only the line and curve pieces of one path share, the lower source first), and a new
 * step starts at each change of program. Within a step the primitive order is kept. Returns each source's chunks, in
 * the order of its instances. Example: body rects (step 0), title glyphs (step 1), anchor rects (step 2).
 */
export function elementSteps(sources: readonly TElementSubs[]): TStepChunk[][] {
  const chunks = sources.map((): TStepChunk[] => []);
  const next = sources.map(() => 0);
  const subAt = (source: number, index: number): number => {
    const { subs, floats } = sources[source];
    return subs[index * floats + SUB_FLOAT];
  };
  const countOf = (source: number): number => sources[source].subs.length / sources[source].floats;
  let step = -1;
  let previous = -1;
  for (;;) {
    let best = -1;
    let bestSub = Infinity;
    for (let source = 0; source < sources.length; source++) {
      if (next[source] < countOf(source) && subAt(source, next[source]) < bestSub) {
        best = source;
        bestSub = subAt(source, next[source]);
      }
    }
    if (best < 0) return chunks;
    const first = next[best];
    while (next[best] < countOf(best) && subAt(best, next[best]) === bestSub) next[best]++;
    const count = next[best] - first;
    if (best === previous) {
      chunks[best][chunks[best].length - 1].count += count;
    } else {
      step++;
      previous = best;
      chunks[best].push({ step, first, count });
    }
  }
}

/** The instances of `data` (`floats` per instance) cut into the chunks of `elementSteps`. */
export function splitSteps(data: Float32Array, floats: number, chunks: readonly TStepChunk[]): TStepInstances[] {
  return chunks.map(({ step, first, count }) => ({
    step,
    instances: data.subarray(first * floats, (first + count) * floats),
  }));
}

/**
 * The translucent instances of one program, kept per element and step. `elements` is the element data of a path
 * program, kept in step with `instances`.
 */
export type TTranslucentSource = { instances: InstanceRanges; elements?: InstanceRanges };

/** One instanced draw call: `count` instances of one source from instance `first`. */
export type TTranslucentRun = { source: number; first: number; count: number };

/** Instances of one source with one draw position `(level, step)`: a contiguous range of its buffer. */
export type TBucket = { bucket: number; first: number; count: number };

/** The draw position of a step of an element on a level: levels first, then steps. */
export function bucketOf(level: number, step: number): number {
  return level * MAX_STEPS + step;
}

/** The buffer order of a chunk of translucent instances: its level, its step, then its element's depth key. */
export function chunkOrder(level: number, step: number, elementKey: number): number {
  return bucketOf(level, step) * ELEMENT_KEYS + elementKey;
}

/**
 * Buckets beyond one per draw position (`outOfPlace`) that level changes may leave before `orderTranslucent` sorts
 * the data. Each costs about one draw call; a sort moves and uploads every instance between the first and the last
 * chunk it moves.
 */
export const MAX_OUT_OF_PLACE = 16;

/** A source's ranges grouped by draw position, in buffer order; a sorted source has one bucket per position. */
export function sourceBuckets(ranges: InstanceRanges, levelOf: (id: string) => number): TBucket[] {
  const buckets: TBucket[] = [];
  ranges.forEachRange((id, offset, count, step) => {
    const bucket = bucketOf(levelOf(id), step);
    const last = buckets[buckets.length - 1];
    if (last && last.bucket === bucket && last.first + last.count === offset) last.count += count;
    else buckets.push({ bucket, first: offset, count });
  });
  return buckets;
}

/** The buckets in draw order: by draw position, then by buffer order. */
export function sortBuckets(buckets: readonly TBucket[]): TBucket[] {
  return [...buckets].sort((a, b) => a.bucket - b.bucket || a.first - b.first);
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
  const next = sources.map(() => 0);
  const runs: TTranslucentRun[] = [];
  for (;;) {
    let best = -1;
    let bestBucket = Infinity;
    for (let source = 0; source < sources.length; source++) {
      const bucket = sources[source][next[source]];
      if (bucket && bucket.bucket < bestBucket) {
        best = source;
        bestBucket = bucket.bucket;
      }
    }
    if (best < 0) return runs;
    const bucket = sources[best][next[best]++];
    const last = runs[runs.length - 1];
    if (last && last.source === best && last.first + last.count === bucket.first) last.count += bucket.count;
    else runs.push({ source: best, first: bucket.first, count: bucket.count });
  }
}

/**
 * Returns the draw calls of all sources: for each level, for each step, an instanced draw per program with instances
 * there. The elements of one level never overlap (`TranslucentLevels`), so they share draws, and the steps keep each
 * element's own primitive order; where translucent primitives overlap, this is the scene order. `levelOf` gives an
 * element's level, `keyOf` its depth key.
 *
 * With `compact` (the default; the backend passes it when ranges were added or removed, which uploads the lists in
 * full anyway) every source's chunks are first sorted by `(level, step, element key)`, primitive order kept inside a
 * chunk, so each draw position of a program is one contiguous range and one draw. Without it the data stays where it
 * is: a chunk whose level changed is drawn from where it lies, at its new position in the draw order, which costs a
 * draw call or two instead of moving every instance between its old and new place. Once more than
 * `MAX_OUT_OF_PLACE` buckets are out of place, the sources are sorted anyway.
 */
export function orderTranslucent(
  sources: readonly TTranslucentSource[],
  levelOf: (id: string) => number,
  keyOf: (id: string) => number,
  compact = true
): TTranslucentRun[] {
  const sortSources = (): void => {
    const order = (id: string, step: number): number => chunkOrder(levelOf(id), step, keyOf(id));
    for (const { instances, elements } of sources) {
      instances.sortBy(order);
      elements?.sortBy(order);
    }
  };
  const bucketLists = (): TBucket[][] => sources.map((source) => sortBuckets(sourceBuckets(source.instances, levelOf)));
  if (compact) sortSources();
  let lists = bucketLists();
  if (!compact && lists.reduce((sum, list) => sum + outOfPlace(list), 0) > MAX_OUT_OF_PLACE) {
    sortSources();
    lists = bucketLists();
  }
  return mergeBuckets(lists);
}
