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

/** A view over immutable, canonical runs of one source in physical order. */
export type TTranslucentPart = {
  readonly runs: readonly TTranslucentRun[];
  readonly first: number;
  readonly end: number;
};

/** Instances of one source with one draw position `(level, step)`: a contiguous range of its buffer. */
export type TBucket = { bucket: number; first: number; count: number };

type TSourceSnapshot = {
  layout: number;
  subBits: number;
  levelRevision?: number;
  positions: Float64Array;
  buckets: TBucket[];
};

type TOrderPage = { bucket: number; page: number; from: number; to: number; part: TTranslucentPart };
type TPagedSource = { source: InstanceRanges; buckets: TBucket[]; pages: TOrderPage[] };
type TPageBand = { pages: TOrderPage[]; parts: TTranslucentPart[] };
type TPainterPosition = { bucket: number; bands: Map<number, TPageBand>; parts: TTranslucentPart[] };
type TSourceOrder = { source: InstanceRanges; positions: TPainterPosition[]; dense?: TPagedSource };
type TOrderWindow = {
  parts: TTranslucentPart[];
  incoming?: TTranslucentPart;
  body?: TTranslucentPart[];
  groups: TTranslucentPart[][];
  tail?: TTranslucentPart;
};
type TOrderChunks = {
  windows: Map<number, TOrderWindow>;
  dirty: Set<number>;
  subBits: number;
  sources: TSourceOrder[];
  parts: readonly TTranslucentPart[];
  retained: (TRetainedOrder | undefined)[];
  views: WeakMap<readonly TTranslucentRun[], TTranslucentPart[]>;
  joins: WeakMap<TTranslucentRun, WeakMap<TTranslucentRun, TTranslucentPart>>;
};

/** Backend-owned snapshots; weak source keys do not keep retired instance lists alive. */
export type TTranslucentOrderCache = {
  /** Optional revision of levelOf; callers without one compare the numeric positions on every call. */
  levelRevision?: number;
  /** All IDs whose levels changed from the previous numeric revision to this one, when known. */
  changedLevelIds?: readonly string[];
  changedLevelRange?: readonly [number, number];
  /** Consecutive parts of the returned order. Unchanged windows retain their groups across local edits. */
  partGroups?: readonly (readonly TTranslucentPart[])[];
  chunks?: TOrderChunks;
  sources?: WeakMap<InstanceRanges, TSourceSnapshot>;
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

function sameBucket(a: TBucket, b: TBucket): boolean {
  return a === b || (a.bucket === b.bucket && a.first === b.first && a.count === b.count);
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

function sortDenseSources(
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

/**
 * Group the physical slots of each draw position. The address boundary stays put through inserts, level moves
 * and sparse holes, even when almost every range of a source shares one painter position.
 */
const ORDER_PAGE_SLOTS = 1024;

function pageOrder(aBucket: number, aPage: number, bBucket: number, bPage: number): number {
  return aBucket - bBucket || aPage - bPage;
}

function pagePart(source: number, buckets: TBucket[], from: number, to: number): TTranslucentPart {
  const runs: TTranslucentRun[] = [];
  for (let index = from; index < to; index++) {
    const { first, count } = buckets[index];
    const previous = runs[runs.length - 1];
    if (previous && previous.first + previous.count === first) previous.count += count;
    else runs.push({ source, first, count });
  }
  return { runs, first: 0, end: runs.length };
}

function orderPages(source: InstanceRanges, index: number, buckets: TBucket[], before?: TPagedSource): TPagedSource {
  if (before?.source !== source) before = undefined;
  if (before?.buckets === buckets) return before;
  const pages: TOrderPage[] = [];
  const old = before?.pages ?? [];
  let previous = 0;
  for (let from = 0; from < buckets.length; ) {
    const { bucket, first } = buckets[from];
    const page = Math.floor(first / ORDER_PAGE_SLOTS);
    let to = from + 1;
    while (to < buckets.length && buckets[to].bucket === bucket && buckets[to].first < (page + 1) * ORDER_PAGE_SLOTS)
      to++;
    while (previous < old.length && pageOrder(old[previous].bucket, old[previous].page, bucket, page) < 0) previous++;
    const candidate = old[previous];
    let same =
      before !== undefined &&
      candidate !== undefined &&
      pageOrder(candidate.bucket, candidate.page, bucket, page) === 0 &&
      candidate.to - candidate.from === to - from;
    if (same && before && candidate) {
      for (let k = from; k < to; k++) {
        if (!sameBucket(buckets[k], before.buckets[candidate.from + k - from])) {
          same = false;
          break;
        }
      }
    }
    const part = same && candidate ? candidate.part : pagePart(index, buckets, from, to);
    pages.push({ bucket, page, from, to, part });
    from = to;
  }
  return { source, buckets, pages };
}

function viewPart(part: TTranslucentPart, first: number, end: number, state: TOrderChunks): TTranslucentPart {
  const { runs } = part;
  let views = state.views.get(runs);
  if (!views) state.views.set(runs, (views = []));
  // A boundary can trim the first or last run, or both. Joined seam runs are separate one-run parts.
  const key = first + (runs.length - end) * 2;
  return (views[key] ??= { runs, first, end });
}

function joinPart(a: TTranslucentRun, b: TTranslucentRun, state: TOrderChunks): TTranslucentPart {
  let right = state.joins.get(a);
  if (!right) state.joins.set(a, (right = new WeakMap()));
  let joined = right.get(b);
  if (!joined) {
    joined = { runs: [{ source: a.source, first: a.first, count: a.count + b.count }], first: 0, end: 1 };
    right.set(b, joined);
  }
  return joined;
}

type TRetainedPage = { entries: TTranslucentRun[]; order: TOrderPage };

type TRetainedOrder = {
  layout: number;
  levelRevision: number | undefined;
  bucketAt: Map<number, number>;
  physical: Map<number, Map<number, TRetainedPage>>;
  ordered: TSourceOrder;
};

function physicalPage(first: number): number {
  return Math.floor(first / ORDER_PAGE_SLOTS);
}

function compareOrderPages(a: TOrderPage, b: TOrderPage): number {
  return pageOrder(a.bucket, a.page, b.bucket, b.page);
}

// Fixed physical bands preserve compound part identity when a different slot is inserted or deleted.
const ORDER_BAND_PAGES = 16;
const SMALL_GROUP_RUNS = 128;

function appendPart(parts: TTranslucentPart[], part: TTranslucentPart, state: TOrderChunks): void {
  const previous = parts[parts.length - 1];
  const last = previous?.runs[previous.end - 1];
  const first = part.runs[part.first];
  if (last && last.source === first.source && last.first + last.count === first.first) {
    parts.pop();
    if (previous.end - previous.first > 1) parts.push(viewPart(previous, previous.first, previous.end - 1, state));
    parts.push(joinPart(last, first, state));
    if (part.end - part.first > 1) parts.push(viewPart(part, part.first + 1, part.end, state));
  } else {
    parts.push(part);
  }
}

function appendGroup(parts: TTranslucentPart[], group: readonly TTranslucentPart[], state: TOrderChunks): void {
  // Internal seams are already canonical. Only the first part can touch the previous group's last range.
  appendPart(parts, group[0], state);
  for (let i = 1; i < group.length; i++) parts.push(group[i]);
}

function pageBand(pages: TOrderPage[], state: TOrderChunks, previous?: TPageBand): TPageBand {
  if (previous?.pages.length === pages.length && pages.every((page, i) => page.part === previous.pages[i].part))
    return previous;
  const parts: TTranslucentPart[] = [];
  for (let from = 0; from < pages.length; ) {
    let to = from + 1;
    let count = pages[from].part.end;
    while (to < pages.length && count + pages[to].part.end <= SMALL_GROUP_RUNS) count += pages[to++].part.end;
    if (to === from + 1) appendPart(parts, pages[from].part, state);
    else {
      const runs: TTranslucentRun[] = [];
      for (let i = from; i < to; i++) {
        for (const run of pages[i].part.runs) {
          const last = runs[runs.length - 1];
          if (last && last.first + last.count === run.first)
            runs[runs.length - 1] = { ...last, count: last.count + run.count };
          else runs.push(run);
        }
      }
      appendPart(parts, { runs, first: 0, end: runs.length }, state);
    }
    from = to;
  }
  return { pages, parts };
}

function painterPosition(bucket: number, bands: Map<number, TPageBand>, state: TOrderChunks): TPainterPosition {
  const parts: TTranslucentPart[] = [];
  for (const key of [...bands.keys()].sort((a, b) => a - b)) appendGroup(parts, bands.get(key)!.parts, state);
  return { bucket, bands, parts };
}

function sourceOrder(
  source: InstanceRanges,
  pages: TOrderPage[],
  state: TOrderChunks,
  before?: TSourceOrder
): TSourceOrder {
  const positions: TPainterPosition[] = [];
  const previous = new Map(before?.positions.map((position) => [position.bucket, position]));
  for (let i = 0; i < pages.length; ) {
    const bucket = pages[i].bucket;
    const old = previous.get(bucket);
    const bands = new Map<number, TPageBand>();
    let same = old !== undefined;
    do {
      const start = i;
      const key = Math.floor(pages[i].page / ORDER_BAND_PAGES);
      do i++;
      while (i < pages.length && pages[i].bucket === bucket && Math.floor(pages[i].page / ORDER_BAND_PAGES) === key);
      const band = pageBand(pages.slice(start, i), state, old?.bands.get(key));
      bands.set(key, band);
      if (band !== old?.bands.get(key)) same = false;
    } while (i < pages.length && pages[i].bucket === bucket);
    positions.push(same && old && old.bands.size === bands.size ? old : painterPosition(bucket, bands, state));
  }
  for (const position of positions) {
    if (previous.get(position.bucket) !== position) state.dirty.add(windowOf(position.bucket, state));
    previous.delete(position.bucket);
  }
  for (const bucket of previous.keys()) state.dirty.add(windowOf(bucket, state));
  return { source, positions };
}

type TPageChange = { page: number; next?: TOrderPage };

function firstPosition(positions: TPainterPosition[], bucket: number): number {
  let lo = 0;
  let hi = positions.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (positions[mid].bucket < bucket) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function updateBandPages(
  previous: TPageBand | undefined,
  edits: TPageChange[],
  first: number,
  end: number
): TOrderPage[] {
  const pages = previous?.pages.slice() ?? [];
  let at = 0;
  for (let i = first; i < end; i++) {
    const { page, next } = edits[i];
    while (at < pages.length && pages[at].page < page) at++;
    if (pages[at]?.page === page) {
      if (next) pages[at++] = next;
      else pages.splice(at, 1);
    } else if (next) pages.splice(at++, 0, next);
  }
  return pages;
}

function patchPositions(order: TSourceOrder, changes: Map<number, TPageChange[]>, state: TOrderChunks): TSourceOrder {
  if (!changes.size) return order;
  const positions = order.positions.slice();
  for (const [bucket, edits] of changes) {
    state.dirty.add(windowOf(bucket, state));
    const at = firstPosition(positions, bucket);
    const old = positions[at]?.bucket === bucket ? positions[at] : undefined;
    const bands = old?.bands ?? new Map<number, TPageBand>();
    edits.sort((a, b) => a.page - b.page);
    for (let i = 0; i < edits.length; ) {
      const key = Math.floor(edits[i].page / ORDER_BAND_PAGES);
      const first = i;
      do i++;
      while (i < edits.length && Math.floor(edits[i].page / ORDER_BAND_PAGES) === key);
      const pages = updateBandPages(bands.get(key), edits, first, i);
      if (pages.length) bands.set(key, pageBand(pages, state));
      else bands.delete(key);
    }
    if (bands.size) {
      const position = painterPosition(bucket, bands, state);
      if (old) positions[at] = position;
      else positions.splice(at, 0, position);
    } else if (old) positions.splice(at, 1);
  }
  return { source: order.source, positions };
}

const EMPTY_PART: TTranslucentPart = { runs: [], first: 0, end: 0 };

function retainedPage(physical: TRetainedOrder["physical"], first: number, bucket: number): TRetainedPage {
  const key = physicalPage(first);
  let page = physical.get(key);
  if (!page) physical.set(key, (page = new Map()));
  let position = page.get(bucket);
  if (!position) {
    position = { entries: [], order: { bucket, page: key, from: 0, to: 0, part: EMPTY_PART } };
    page.set(bucket, position);
  }
  return position;
}

function firstSlot(entries: TTranslucentRun[], first: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (entries[mid].first < first) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function finishPage(page: TRetainedPage): TOrderPage {
  const { entries, order } = page;
  // An isolated owner range is already a draw. Only joined neighbors need another object.
  const previous = order.part.runs;
  let prior = 0;
  const runs: TTranslucentRun[] = [];
  for (let i = 0; i < entries.length; ) {
    const entry = entries[i++];
    let end = entry.first + entry.count;
    while (i < entries.length && entries[i].first === end) end += entries[i++].count;
    if (end === entry.first + entry.count) runs.push(entry);
    else {
      while (prior < previous.length && previous[prior].first < entry.first) prior++;
      const old = previous[prior];
      const count = end - entry.first;
      runs.push(
        old?.first === entry.first && old.count === count ? old : { source: entry.source, first: entry.first, count }
      );
    }
  }
  return (page.order = {
    bucket: order.bucket,
    page: order.page,
    from: 0,
    to: entries.length,
    part: { runs, first: 0, end: runs.length },
  });
}

function readRetainedSource(
  source: InstanceRanges,
  index: number,
  levelOf: (id: string) => number,
  subBits: number,
  levelRevision: number | undefined,
  state: TOrderChunks,
  before?: TRetainedOrder
): TRetainedOrder {
  const bucketAt = new Map<number, number>();
  const physical = new Map<number, Map<number, TRetainedPage>>();
  const pages: TOrderPage[] = [];
  source.forEachRange((id, first, count, step) => {
    const bucket = bucketOf(levelOf(id), step, subBits);
    bucketAt.set(first, bucket);
    retainedPage(physical, first, bucket).entries.push({ source: index, first, count });
  });
  for (const [key, at] of physical) {
    for (const [bucket, page] of at) {
      const old = before?.physical.get(key)?.get(bucket);
      const { entries } = page;
      // forEachRange visits physical addresses in order.
      if (
        old &&
        entries.length === old.entries.length &&
        entries.every((entry, i) => entry.first === old.entries[i].first && entry.count === old.entries[i].count)
      ) {
        at.set(bucket, old);
        pages.push(old.order);
      } else pages.push(finishPage(page));
    }
  }
  return {
    layout: source.layoutRevision,
    levelRevision,
    bucketAt,
    physical,
    ordered: sourceOrder(source, pages.sort(compareOrderPages), state, before?.ordered),
  };
}

/** Redistribute a large overlap delta in physical slot order, retaining unchanged draw records. */
function replacePhysicalPages(
  snapshot: TRetainedOrder,
  replacements: Map<number, TBucket | undefined>,
  source: number,
  dirty: Set<TRetainedPage>
): void {
  const edits = new Map<number, number[]>();
  for (const first of replacements.keys()) {
    const key = physicalPage(first);
    let offsets = edits.get(key);
    if (!offsets) edits.set(key, (offsets = []));
    offsets.push(first);
  }
  const slots: (TTranslucentRun | undefined)[] = new Array(ORDER_PAGE_SLOTS);
  const buckets = new Float64Array(ORDER_PAGE_SLOTS);
  for (const [key, offsets] of edits) {
    slots.fill(undefined);
    const start = key * ORDER_PAGE_SLOTS;
    const pages = snapshot.physical.get(key);
    if (pages) {
      for (const [bucket, page] of pages) {
        for (const entry of page.entries) {
          slots[entry.first - start] = entry;
          buckets[entry.first - start] = bucket;
        }
      }
    }
    const touched = new Map<number, TRetainedPage>();
    for (const first of offsets) {
      const at = first - start;
      const entry = slots[at];
      const bucket = buckets[at];
      const next = replacements.get(first);
      if (entry && next?.bucket === bucket && next.count === entry.count) continue;
      if (entry) touched.set(bucket, retainedPage(snapshot.physical, first, bucket));
      if (next) {
        touched.set(next.bucket, retainedPage(snapshot.physical, first, next.bucket));
        buckets[at] = next.bucket;
        if (entry?.count !== next.count) slots[at] = { source, first, count: next.count };
        snapshot.bucketAt.set(first, next.bucket);
      } else {
        slots[at] = undefined;
        snapshot.bucketAt.delete(first);
      }
    }
    for (const page of touched.values()) {
      page.entries = [];
      dirty.add(page);
    }
    for (let at = 0; at < slots.length; at++) {
      const entry = slots[at];
      if (entry) touched.get(buckets[at])?.entries.push(entry);
    }
  }
}

function patchRetainedPages(
  snapshot: TRetainedOrder,
  source: InstanceRanges,
  index: number,
  levelOf: (id: string) => number,
  subBits: number,
  levelRevision: number | undefined,
  changed: readonly string[] | undefined,
  state: TOrderChunks
): boolean {
  if (!changed) return false;
  const layout = source.layoutRevision;
  const shapes = snapshot.layout === layout ? undefined : source.retainedChangesSince(snapshot.layout);
  if (snapshot.layout !== layout && !shapes) return false;
  const replacements = new Map<number, TBucket | undefined>();
  const replaceOwner = (id: string): void => {
    const ranges = source.ownerRanges(id);
    if (!ranges.length) return;
    const level = levelOf(id);
    for (const { offset: first, count, step } of ranges)
      replacements.set(first, { first, count, bucket: bucketOf(level, step, subBits) });
  };
  for (const shape of shapes ?? []) for (const span of shape.previous) replacements.set(span.offset, undefined);
  for (const shape of shapes ?? []) replaceOwner(shape.id);
  if (source.liveCount > 0) {
    for (const id of changed) replaceOwner(id);
  }
  const dirty = new Set<TRetainedPage>();
  if (replacements.size > ORDER_PAGE_SLOTS) {
    replacePhysicalPages(snapshot, replacements, index, dirty);
  } else {
    for (const [first, next] of replacements) {
      const bucket = snapshot.bucketAt.get(first);
      if (bucket !== undefined) {
        const page = retainedPage(snapshot.physical, first, bucket);
        const at = firstSlot(page.entries, first);
        if (next?.bucket === bucket && next.count === page.entries[at].count) continue;
        page.entries.splice(at, 1);
        dirty.add(page);
      }
      if (next) {
        snapshot.bucketAt.set(first, next.bucket);
        const page = retainedPage(snapshot.physical, first, next.bucket);
        page.entries.splice(firstSlot(page.entries, first), 0, { source: index, first, count: next.count });
        dirty.add(page);
      } else snapshot.bucketAt.delete(first);
    }
  }
  snapshot.layout = layout;
  snapshot.levelRevision = levelRevision;
  const changes = new Map<number, TPageChange[]>();
  for (const page of dirty) {
    const { bucket, page: key } = page.order;
    let order = changes.get(bucket);
    if (!order) changes.set(bucket, (order = []));
    if (page.entries.length) {
      order.push({ page: key, next: finishPage(page) });
    } else {
      const at = snapshot.physical.get(key);
      at?.delete(bucket);
      if (!at?.size) snapshot.physical.delete(key);
      order.push({ page: key });
    }
  }
  snapshot.ordered = patchPositions(snapshot.ordered, changes, state);
  return true;
}

function retainedSourcePages(
  source: InstanceRanges,
  index: number,
  state: TOrderChunks,
  levelOf: (id: string) => number,
  cache: TTranslucentOrderCache
): TSourceOrder {
  const { subBits } = state;
  const { levelRevision } = cache;
  let before = state.retained[index];
  if (before?.ordered.source !== source) before = undefined;
  if (before && levelRevision !== undefined) {
    const sameLevels = before.levelRevision === levelRevision;
    if (sameLevels && before.layout === source.layoutRevision) return before.ordered;
    let changed = sameLevels ? [] : before.levelRevision === levelRevision - 1 ? cache.changedLevelIds : undefined;
    const span = cache.changedLevelRange;
    const positions = before.ordered.positions;
    if (
      changed?.length &&
      span &&
      (positions.length === 0 ||
        positions[0].bucket >= bucketOf(span[1] + 1, 0, subBits) ||
        positions[positions.length - 1].bucket < bucketOf(span[0], 0, subBits))
    )
      changed = [];
    if (changed?.length === 0 && before.layout === source.layoutRevision) {
      before.levelRevision = levelRevision;
      return before.ordered;
    }
    if (patchRetainedPages(before, source, index, levelOf, subBits, levelRevision, changed, state))
      return before.ordered;
  }
  const next = readRetainedSource(source, index, levelOf, subBits, levelRevision, state, before);
  state.retained[index] = next;
  return next.ordered;
}

// Fixed painter windows keep a change near the back from shifting the groups and their boundaries near the front.
const WINDOW_LEVELS = 8;
function windowOf(bucket: number, state: TOrderChunks): number {
  return Math.floor(bucket / (WINDOW_LEVELS * maxStepsOf(state.subBits)));
}

function windowParts(sources: TSourceOrder[], key: number, state: TOrderChunks): TTranslucentPart[] {
  const parts: TTranslucentPart[] = [];
  const width = WINDOW_LEVELS * maxStepsOf(state.subBits);
  const end = (key + 1) * width;
  const cursors = sources.map((source) => firstPosition(source.positions, key * width));
  for (;;) {
    let source = -1;
    let bucket = end;
    for (let i = 0; i < sources.length; i++) {
      const position = sources[i].positions[cursors[i]];
      if (position && position.bucket < bucket) {
        source = i;
        bucket = position.bucket;
      }
    }
    if (source < 0) return parts;
    appendGroup(parts, sources[source].positions[cursors[source]++].parts, state);
  }
}

function partGroups(parts: TTranslucentPart[], previous?: TTranslucentPart[][]): TTranslucentPart[][] {
  const groups: TTranslucentPart[][] = [];
  let runCount = 0;
  const anchors = new Map(previous?.map((group) => [group[0], group]));
  for (let at = 0; at < parts.length; ) {
    const old = anchors.get(parts[at]);
    if (old?.every((part, i) => parts[at + i] === part)) {
      groups.push(old);
      for (const part of old) runCount += part.end - part.first;
      at += old.length;
      continue;
    }
    const start = at;
    let runs = 0;
    do {
      const part = parts[at++];
      runs += part.end - part.first;
    } while (
      at < parts.length &&
      at - start < 32 &&
      runs + parts[at].end - parts[at].first <= 128 &&
      !anchors.has(parts[at])
    );
    groups.push(parts.slice(start, at));
    runCount += runs;
  }
  if (previous?.length && groups.length > 2 * (Math.ceil(parts.length / 32) + Math.ceil(runCount / 128)))
    return partGroups(parts);
  return groups;
}

function materializeParts(
  sources: TSourceOrder[],
  state: TOrderChunks,
  cache: TTranslucentOrderCache
): readonly TTranslucentPart[] {
  for (const key of state.dirty) {
    const old = state.windows.get(key);
    const parts = windowParts(sources, key, state);
    if (!parts.length) state.windows.delete(key);
    else if (!old || parts.length !== old.parts.length || parts.some((part, i) => part !== old.parts[i])) {
      state.windows.set(key, { parts, groups: old?.groups ?? [] });
    }
  }
  state.dirty.clear();
  const groups: (readonly TTranslucentPart[])[] = [];
  let tail: TTranslucentPart | undefined;
  const bodies: TTranslucentPart[][] = [];
  for (const [, window] of [...state.windows].sort((a, b) => a[0] - b[0])) {
    if (!window.body || window.incoming !== tail) {
      const parts = tail ? [tail] : [];
      appendGroup(parts, window.parts, state);
      window.tail = parts.pop();
      window.incoming = tail;
      window.groups = partGroups(parts, window.groups);
      window.body = parts;
    }
    for (const group of window.groups) groups.push(group);
    bodies.push(window.body);
    tail = window.tail;
  }
  if (tail) {
    bodies.push([tail]);
    const last = cache.partGroups?.at(-1);
    groups.push(last?.length === 1 && last[0] === tail ? last : [tail]);
  }
  cache.partGroups = groups;
  // Each window already has its canonical body, including the incoming seam and excluding its outgoing tail.
  return bodies.flat();
}

/** Materialize only changed ranges and keep exact raw joins before the visibility filter sees them. */
export function orderTranslucentChunks(
  sources: readonly TTranslucentSource[],
  levelOf: (id: string) => number,
  keyOf: (id: string) => number,
  subBits: number,
  compact: boolean,
  cache: TTranslucentOrderCache,
  denseLevelOf = levelOf
): readonly TTranslucentPart[] {
  let state = cache.chunks;
  if (!state || state.subBits !== subBits) {
    cache.partGroups = [];
    state = {
      windows: new Map(),
      dirty: new Set(),
      subBits,
      sources: [],
      parts: [],
      retained: [],
      views: new WeakMap(),
      joins: new WeakMap(),
    };
    cache.chunks = state;
  }
  const current = state;
  const previous = current.sources;
  const orderAll = (): TSourceOrder[] =>
    sources.map(({ instances }, index) => {
      if (instances.layoutRetained) return retainedSourcePages(instances, index, current, levelOf, cache);
      current.retained[index] = undefined;
      const before = previous[index]?.source === instances ? previous[index] : undefined;
      const dense = orderPages(
        instances,
        index,
        cachedSourceBuckets(instances, levelOf, subBits, cache),
        before?.dense
      );
      if (before?.dense === dense) return before;
      return { ...sourceOrder(instances, dense.pages, current, before), dense };
    });
  if (compact) sortDenseSources(sources, denseLevelOf, keyOf, subBits);
  let next = orderAll();
  if (
    !compact &&
    next.reduce((sum, source) => sum + (source.dense ? outOfPlace(source.dense.buckets) : 0), 0) > MAX_OUT_OF_PLACE
  ) {
    sortDenseSources(sources, denseLevelOf, keyOf, subBits);
    next = orderAll();
  }
  for (let i = 0; i < previous.length; i++) {
    if (previous[i].source !== next[i]?.source)
      for (const position of previous[i].positions) state.dirty.add(windowOf(position.bucket, state));
  }
  current.retained.length = sources.length;
  if (next.length === previous.length && next.every((source, index) => source === previous[index])) return state.parts;
  state.sources = next;
  return (state.parts = materializeParts(next, state, cache));
}
