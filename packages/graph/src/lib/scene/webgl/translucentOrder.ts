import type { InstanceRanges, TStepInstances } from "./InstanceRanges";
import { SCENE_DEPTH } from "./depth";

/**
 * The element keys of the translucent order: the root's depth key times the sub-order width, plus the sub base of a
 * child element (`WebGLSceneBackend.orderKeyOf`). They lie below the depth indices at every width.
 */
export const ELEMENT_KEYS = 2 ** SCENE_DEPTH.INDEX_BITS;

/**
 * The steps an element can have at a sub-order width: one per change of program in primitive order, so at most one
 * per primitive, or two for a path (its line pieces, then its curve pieces); an element has at most 2^subBits
 * primitives.
 */
export function maxStepsOf(subBits: number): number {
  return 2 * 2 ** subBits;
}

/**
 * The float of a rect instance, and of a path instance's element data, that holds the primitive's `sub`. A glyph's sub
 * is the only float of its instance in the glyph sub list (`TEncodedGlyphs.subs`).
 */
export const SUB_FLOAT = 1;

/**
 * One program's translucent instances of one element: `subs` holds each instance's `sub` at float `subFloat` (default
 * `SUB_FLOAT`) of its `floats` floats.
 */
export type TElementSubs = { subs: Float32Array; floats: number; subFloat?: number };

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
    const { subs, floats, subFloat = SUB_FLOAT } = sources[source];
    return subs[index * floats + subFloat];
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
 * The translucent instances of one program, kept per element and step. `companion` is a second per-instance list of
 * the program kept in step with `instances` (a path's element data, a glyph's sub): it is sorted along with them.
 */
export type TTranslucentSource = { instances: InstanceRanges; companion?: InstanceRanges };

/** One instanced draw call: `count` instances of one source from instance `first`. */
export type TTranslucentRun = { source: number; first: number; count: number };

/** Instances of one source with one draw position `(level, step)`: a contiguous range of its buffer. */
export type TBucket = { bucket: number; first: number; count: number };

type TSourceSnapshot = {
  layout: number;
  subBits: number;
  levelRevision?: number;
  positions: Float64Array;
  buckets: TBucket[];
};

/** Backend-owned snapshots; weak source keys do not keep retired instance lists alive. */
export type TTranslucentOrderCache = {
  /** Optional revision of levelOf; callers without one compare the numeric positions on every call. */
  levelRevision?: number;
  sources?: WeakMap<InstanceRanges, TSourceSnapshot>;
  lists?: readonly (readonly TBucket[])[];
  runs?: TTranslucentRun[];
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

/** A global level revision need not change this source's actual draw positions. */
function cachedSourceBuckets(
  ranges: InstanceRanges,
  levelOf: (id: string) => number,
  subBits: number,
  cache: TTranslucentOrderCache
): TBucket[] {
  const sources = (cache.sources ??= new WeakMap());
  let snapshot = sources.get(ranges);
  const layout = ranges.layoutRevision;
  const levelRevision = cache.levelRevision;
  if (
    snapshot?.layout === layout &&
    snapshot.subBits === subBits &&
    levelRevision !== undefined &&
    snapshot.levelRevision === levelRevision
  )
    return snapshot.buckets;

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
      previous?.length === sorted.length &&
      sorted.every((bucket, index) => {
        const known = previous[index];
        return bucket.bucket === known.bucket && bucket.first === known.first && bucket.count === known.count;
      })
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
    // Every fragment of this source at the winning position precedes the next source. Retained slots can leave
    // thousands of such fragments; search the sources once per position, not once per physical fragment.
    do {
      const bucket = sources[best][next[best]++];
      const last = runs[runs.length - 1];
      if (last && last.source === best && last.first + last.count === bucket.first) last.count += bucket.count;
      else runs.push({ source: best, first: bucket.first, count: bucket.count });
    } while (sources[best][next[best]]?.bucket === bestBucket);
  }
}

/** Filters shader-inactive draws, sharing unchanged runs and copying only merges across inactive buffer gaps. */
export function filterTranslucentRuns(
  input: readonly TTranslucentRun[],
  visible: (source: number, first: number, count: number) => boolean,
  bridge: (source: number) => boolean = () => true
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
      !visible(run.source, last.first + last.count, gap)
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
  visible?: (source: number, first: number, count: number) => boolean,
  cache?: TTranslucentOrderCache
): TTranslucentRun[] {
  const sortSources = (): void => {
    const order = (id: string, step: number): number => chunkOrder(levelOf(id), step, keyOf(id), subBits);
    for (const { instances, companion } of sources) {
      if (instances.layoutRetained) continue;
      instances.sortBy(order);
      companion?.sortBy(order);
    }
  };
  const bucketLists = (): TBucket[][] =>
    sources.map((source, index) =>
      cache && !visible
        ? cachedSourceBuckets(source.instances, levelOf, subBits, cache)
        : sortBuckets(
            sourceBuckets(
              source.instances,
              levelOf,
              subBits,
              visible && ((first, count) => visible(index, first, count))
            )
          )
    );
  if (compact) sortSources();
  let lists = bucketLists();
  if (
    !compact &&
    lists.reduce((sum, list, source) => sum + (sources[source].instances.layoutRetained ? 0 : outOfPlace(list)), 0) >
      MAX_OUT_OF_PLACE
  ) {
    sortSources();
    lists = bucketLists();
  }
  if (!cache || visible) return mergeBuckets(lists);
  if (cache.runs && cache.lists?.length === lists.length && lists.every((list, index) => list === cache.lists?.[index]))
    return cache.runs;
  cache.lists = lists;
  return (cache.runs = mergeBuckets(lists));
}
