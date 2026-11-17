/**
 * The instances of one element and one step, in instances: `offset` in the buffer and `count`. A removed range stays in
 * the list, `dead`, until the next compaction.
 */
type TRange = { id: string; step: number; offset: number; count: number; dead: boolean };
type TFreeSlot = { offset: number; count: number };

/** The instances of one step of an element. */
export type TStepInstances = { step: number; instances: Float32Array };

/**
 * The instances of one step as `set` and `setSteps` take them: the list copies them at once and keeps nothing of them,
 * so they may be a view that the next encode overwrites (`TInstanceView`).
 */
type TStepSource = { step: number; instances: ArrayLike<number> };

/** A part of a list to upload: the floats of `data`, written at `byteOffset` of the GPU buffer. */
export type TInstanceSpan = { readonly byteOffset: number; readonly data: Float32Array };

/**
 * What a list uploads: nothing, everything, or its dirty spans (`spans`, ascending and apart, `bytes` in all), each
 * written on its own.
 */
export type TInstanceUpload =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "range"; spans: readonly TInstanceSpan[]; bytes: number };

/**
 * How the dirty spans of a list go up (`InstanceRanges.takeUpload`), within a byte budget: a list never uploads more
 * than twice its dirty bytes in a frame.
 * - `enclose`: when the span that encloses every dirty span is at most twice their bytes (a dense change, such as
 *   every block restyled), it goes up as one write;
 * - otherwise gaps are merged, the smallest first, while the gaps merged add up to no more than the bytes of the spans
 *   themselves: `mergeGapBytes`, neighbouring spans closer than this go up as one; `maxSpans`, past this many spans
 *   larger gaps are merged too. Where meeting the count would break the budget, more spans go up.
 *
 * Chosen from a probe with the GPU (Task 17i fix round 2: Chromium 145, ANGLE Metal, Apple M3 Pro, a 52 MiB list in use
 * by the previous frame's draw, `t17i-fix2-upload-probe*.log`). Partial writes of up to about 26 MiB in a frame cost
 * 0.03-0.1 ms per MiB, less per byte than merging them into fewer, larger writes. Many large partial writes in one
 * frame can stall it for 25-260 ms, where one write of the whole list takes 13-18 ms.
 *
 * @internal Mutable for the bench, which tries other values.
 */
export const instanceUploadPolicy: { mergeGapBytes: number; maxSpans: number; enclose: boolean } = {
  mergeGapBytes: 16384,
  maxSpans: 64,
  enclose: true,
};

/**
 * The tracked dirty spans at which they are sorted and joined in place (their exact union: no gap is merged), and
 * twice the count left after that: however many writes a frame makes, tracking stays O(n log n), and the spans keep the
 * exact dirty bytes the upload's budget is taken from.
 */
const COMPACT_SPANS = 4096;

const FLOAT_BYTES = 4;

const INITIAL_INSTANCES = 64;

/**
 * The compactions appends may force between two reads of the layout before the buffer grows for room instead: past
 * them the frame's changes keep refilling a nearly full buffer, and each compaction walks the whole list.
 */
const FORCED_COMPACTIONS = 8;

/** The source of revisions: shared by every list, so a new list never repeats the revision of a list it replaces. */
let lastRevision = 0;

function sameShape(ranges: readonly TRange[], steps: readonly TStepSource[], floats: number): boolean {
  return (
    ranges.length === steps.length &&
    ranges.every(
      (range, index) => range.step === steps[index].step && range.count * floats === steps[index].instances.length
    )
  );
}

/**
 * Packs per-element instance data into one array and tells what to upload to the GPU. An element's instances are kept
 * per step (`setSteps`; `set` writes step 0 only), each step a range of its own, so ranges of one element can lie
 * apart.
 * The ranges lie in the buffer back to back in the order `forEachRange` lists them: new ranges go to the end, a delete
 * closes the gap, and `sortBy` puts them in key order.
 *
 * A removal (a delete, or a count change that moves an element's ranges to the end) only marks the ranges dead. The
 * gaps close before the next read of the layout (`count`, `data`, `forEachRange`, `sortBy`, `takeUpload`), and before
 * the buffer would grow: an append that does not fit closes them first, so the buffer grows only where closing every
 * gap at once would have made it grow, and never keeps the room of dead ranges. A removal frees no room until then,
 * so in a nearly full buffer the appends of one frame can fill it again and again; after `FORCED_COMPACTIONS` such
 * compactions between two reads the buffer grows to twice what the live instances need, so a frame walks the list at
 * most `FORCED_COMPACTIONS` + 2 times (the last at the read) whatever it reshapes, instead of once per element. Only
 * that case can leave the buffer larger than closing every gap at once would, at most twice.
 *
 * `retainLayout` keeps existing offsets after the initial packing. Removed instances become zero-filled holes,
 * reused best-fit before appending; neighbouring holes join and trailing ones trim. `count`/`data` then include
 * interior holes, `liveCount` and `forEachRange` exclude them, and sorting no longer moves data. Only draw sources
 * whose zero-filled instances are invisible may use this mode. Main and companion lists retain/allocate together.
 */
export class InstanceRanges {
  public readonly floats: number;

  /** Every range in buffer order: each starts where the previous one ends. Dead ranges stay until `compact()`. */
  private list: TRange[] = [];
  /** How many ranges of `list` are dead. */
  private deadRanges = 0;
  /** The compactions appends forced since the layout was last read (`reserve`). */
  private forcedCompactions = 0;
  /** The ranges of each element, by ascending step. */
  private readonly byId = new Map<string, TRange[]>();
  private buffer: Float32Array;
  private used = 0;
  private live = 0;
  private retained = false;
  private slotsDirty = false;
  private readonly freeStarts = new Map<number, TFreeSlot>();
  private readonly freeEnds = new Map<number, TFreeSlot>();
  private readonly freeSizes = new Map<number, Set<TFreeSlot>>();
  private readonly freeCounts: number[] = [];
  private full = false;
  /** The span enclosing every dirty span, in instances: what goes up once the spans are not tracked apart. */
  private dirtyStart = Infinity;
  private dirtyEnd = -1;
  /** The dirty spans since the last upload, in instances, in the order they were written (`markSpan`). */
  private readonly spanStarts: number[] = [];
  private readonly spanEnds: number[] = [];
  /** Whether `spanStarts` ascends. */
  private spansSorted = true;
  /** The span count at which the spans are joined in place (`joinSpans`). */
  private compactAt = COMPACT_SPANS;
  private changes = ++lastRevision;
  private layoutChanges = ++lastRevision;

  constructor(floatsPerInstance: number) {
    this.floats = floatsPerInstance;
    this.buffer = new Float32Array(INITIAL_INSTANCES * floatsPerInstance);
  }

  public get count(): number {
    if (!this.retained) this.settle();
    return this.used;
  }

  /** Live instances only; a retained layout's `count` also includes its interior holes. */
  public get liveCount(): number {
    return this.live;
  }

  public get layoutRetained(): boolean {
    return this.retained;
  }

  /** Keeps resident offsets after the initial sort. Future holes are cleared and reused, never compacted or sorted. */
  public retainLayout(): void {
    if (this.retained) return;
    this.settle();
    this.retained = true;
  }

  /** Resident instances of one element, without settling or changing its pending upload. */
  public countOf(id: string): number {
    let count = 0;
    for (const range of this.byId.get(id) ?? []) count += range.count;
    return count;
  }

  public get data(): Float32Array {
    if (!this.retained) this.settle();
    return this.buffer.subarray(0, this.used * this.floats);
  }

  /** Changes whenever instance data or the order of the ranges changes; unique across all lists. */
  public get revision(): number {
    return this.changes;
  }

  /**
   * Changes whenever a range is added, removed or moved, but not on an in-place rewrite; unique across all lists.
   */
  public get layoutRevision(): number {
    return this.layoutChanges;
  }

  /** The ranges in buffer order: `offset` and `count` in instances. */
  public forEachRange(visit: (id: string, offset: number, count: number, step: number) => void): void {
    this.settle();
    for (const range of this.list) if (!range.dead) visit(range.id, range.offset, range.count, range.step);
  }

  /** Writes the element's instances as step 0, its only range: a copy (`TStepSource`). */
  public set(id: string, instances: ArrayLike<number>, onlyIfChanged = false): void {
    const current = this.byId.get(id);
    // The rewrite in place of `setSteps` for one step of the same count, without its step lists.
    if (current?.length === 1 && current[0].step === 0 && instances.length > 0) {
      if (current[0].count * this.floats === instances.length) {
        const range = current[0];
        if (onlyIfChanged && this.matches(range, instances)) return;
        this.changes = ++lastRevision;
        this.write(range, instances);
        return;
      }
    }
    this.setSteps(id, [{ step: 0, instances }]);
  }

  private matches(range: TRange, instances: ArrayLike<number>): boolean {
    const start = range.offset * this.floats;
    for (let i = 0; i < instances.length; i++) {
      if (this.buffer[start + i] !== instances[i]) return false;
    }
    return true;
  }

  /**
   * Replaces the element's ranges by one range per step, steps in ascending order; empty steps are skipped, and with
   * none left the element is deleted. With the same steps and counts the data is rewritten in place (a range upload);
   * otherwise the old ranges are removed and the new ones go to the end. Only new or moved instances are uploaded.
   */
  public setSteps(id: string, steps: readonly TStepSource[]): void {
    const chunks = steps.filter((chunk) => chunk.instances.length > 0);
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].step <= chunks[i - 1].step) throw new Error("InstanceRanges.setSteps: steps must ascend");
    }
    if (chunks.length === 0) {
      this.delete(id);
      return;
    }
    this.changes = ++lastRevision;
    const current = this.byId.get(id);
    if (current && sameShape(current, chunks, this.floats)) {
      current.forEach((range, index) => this.write(range, chunks[index].instances));
      return;
    }
    if (current) this.removeRanges(current);
    this.layoutChanges = ++lastRevision;
    if (!this.retained) this.reserve(chunks.reduce((sum, chunk) => sum + chunk.instances.length / this.floats, 0));
    this.byId.set(
      id,
      chunks.map((chunk) => this.append(id, chunk))
    );
  }

  /**
   * Changes the element's instances in place: `edit` gets the live instances of each of its ranges (a view into the
   * buffer, valid during the call only), in ascending step order, and may rewrite their floats. The steps and counts
   * stay, so the list ends as a `setSteps` with the edited instances leaves it: data, revisions and upload. Returns
   * false, calling nothing, when the element has no instances.
   */
  public edit(id: string, edit: (instances: Float32Array, step: number) => void): boolean {
    const current = this.byId.get(id);
    if (!current) return false;
    this.changes = ++lastRevision;
    for (const range of current) {
      const from = range.offset * this.floats;
      edit(this.buffer.subarray(from, from + range.count * this.floats), range.step);
      this.markDirty(range);
    }
    return true;
  }

  /**
   * Rewrites `count` instances of the element in place, from its instance `first` on, counted over its ranges in
   * ascending step order (as `setSteps` got them): `edit` gets the buffer and the float offset of the first of them,
   * valid during the call only, and may rewrite those floats. The span must lie in one range. Only those instances go
   * up with the next range upload, and the list ends as a `setSteps` with the edited instances would leave it. Returns
   * false, calling nothing, when the element has no instances.
   */
  public editSpan(id: string, first: number, count: number, edit: (data: Float32Array, at: number) => void): boolean {
    const current = this.byId.get(id);
    if (!current) return false;
    let before = 0;
    for (const range of current) {
      if (first < before + range.count) {
        if (first < before || first - before + count > range.count) {
          throw new Error("InstanceRanges.editSpan: the span crosses the end of a range");
        }
        const from = range.offset + first - before;
        this.changes = ++lastRevision;
        edit(this.buffer, from * this.floats);
        this.markSpan(from, from + count);
        return true;
      }
      before += range.count;
    }
    throw new Error("InstanceRanges.editSpan: the span lies past the element's instances");
  }

  public delete(id: string): void {
    const current = this.byId.get(id);
    if (!current) return;
    this.changes = ++lastRevision;
    this.layoutChanges = ++lastRevision;
    this.removeRanges(current);
    this.byId.delete(id);
  }

  /**
   * Puts the ranges in ascending `keyOf` order, a stable sort, and moves their instance data along. Only the span from
   * the first range that moved to the last one is rewritten, and only it is uploaded. Returns whether anything moved;
   * sorted ranges and retained layouts are left alone.
   */
  public sortBy(keyOf: (id: string, step: number) => number): boolean {
    if (this.retained) return false;
    this.settle();
    const list = this.list;
    const keys = new Float64Array(list.length);
    let sorted = true;
    for (let i = 0; i < list.length; i++) {
      keys[i] = keyOf(list[i].id, list[i].step);
      if (i > 0 && keys[i - 1] > keys[i]) sorted = false;
    }
    if (sorted) return false;
    const order = Array.from(list.keys()).sort((a, b) => keys[a] - keys[b] || a - b);
    let first = 0;
    while (order[first] === first) first++;
    let last = order.length - 1;
    while (order[last] === last) last--;
    const start = list[first].offset;
    const end = list[last].offset + list[last].count;
    const moved = new Float32Array((end - start) * this.floats);
    let at = start;
    for (let i = first; i <= last; i++) {
      const range = list[order[i]];
      const from = range.offset * this.floats;
      moved.set(this.buffer.subarray(from, from + range.count * this.floats), (at - start) * this.floats);
      range.offset = at;
      at += range.count;
    }
    this.buffer.set(moved, start * this.floats);
    this.list = order.map((index) => list[index]);
    this.markSpan(start, end);
    this.changes = ++lastRevision;
    this.layoutChanges = ++lastRevision;
    return true;
  }

  /**
   * What to upload since the last call: everything after an initial write, resize or complete move, else dirty spans (merged by
   * `instanceUploadPolicy`), or nothing.
   */
  public takeUpload(): TInstanceUpload {
    if (!this.retained) this.settle();
    if (this.full) {
      this.clear();
      return { kind: "full" };
    }
    // Compaction may discard dirty instances at the tail. Old offsets inside the live prefix are harmless: moved
    // instances are dirty at their new offsets too, and an extra write still uploads the final data at that offset.
    if (this.dirtyEnd > this.used) this.clipSpans();
    if (this.dirtyEnd < 0) return { kind: "none" };
    const spans = this.spanStarts.length <= 1 ? [this.spanOf(this.dirtyStart, this.dirtyEnd)] : this.mergedSpans();
    let bytes = 0;
    for (const span of spans) bytes += span.data.byteLength;
    this.clear();
    return { kind: "range", spans, bytes };
  }

  private clear(): void {
    this.full = false;
    this.dirtyStart = Infinity;
    this.dirtyEnd = -1;
    this.spanStarts.length = 0;
    this.spanEnds.length = 0;
    this.spansSorted = true;
    this.compactAt = COMPACT_SPANS;
  }

  private clipSpans(): void {
    let kept = 0;
    this.dirtyStart = Infinity;
    this.dirtyEnd = -1;
    for (let i = 0; i < this.spanStarts.length; i++) {
      const start = this.spanStarts[i];
      const end = Math.min(this.spanEnds[i], this.used);
      if (start >= end) continue;
      this.spanStarts[kept] = start;
      this.spanEnds[kept] = end;
      this.dirtyStart = Math.min(this.dirtyStart, start);
      this.dirtyEnd = Math.max(this.dirtyEnd, end);
      kept++;
    }
    this.spanStarts.length = kept;
    this.spanEnds.length = kept;
  }

  private spanOf(start: number, end: number): TInstanceSpan {
    return {
      byteOffset: start * this.floats * FLOAT_BYTES,
      data: this.buffer.subarray(start * this.floats, end * this.floats),
    };
  }

  /**
   * The dirty spans in buffer order (`joinSpans`): by `instanceUploadPolicy`, their enclosing span when it is at most
   * twice their bytes (`enclose`), or neighbours merged across their gaps, the smallest gaps first, while the gaps
   * merged add up to no more than the spans' own bytes: each gap under `mergeGapBytes`, and larger ones while more
   * than `maxSpans` spans are left. A gap past what is left of the budget ends the merging (the later ones are no
   * smaller), whatever the count.
   */
  private mergedSpans(): TInstanceSpan[] {
    this.joinSpans();
    const starts = this.spanStarts;
    const ends = this.spanEnds;
    const instanceBytes = this.floats * FLOAT_BYTES;
    let budget = 0;
    for (let i = 0; i < starts.length; i++) budget += (ends[i] - starts[i]) * instanceBytes;
    const { mergeGapBytes, maxSpans, enclose } = instanceUploadPolicy;
    const last = starts.length - 1;
    if (enclose && (ends[last] - starts[0]) * instanceBytes <= 2 * budget) return [this.spanOf(starts[0], ends[last])];
    // Gap i lies between span i and span i + 1; the smallest first, the earlier of two equal ones first.
    const gapOf = (gap: number): number => starts[gap + 1] - ends[gap];
    const gaps = Array.from({ length: starts.length - 1 }, (_, index) => index);
    gaps.sort((a, b) => gapOf(a) - gapOf(b) || a - b);
    const merged = new Uint8Array(gaps.length);
    let left = starts.length;
    for (const gap of gaps) {
      const bytes = gapOf(gap) * instanceBytes;
      if (bytes > budget || (bytes >= mergeGapBytes && left <= maxSpans)) break;
      budget -= bytes;
      merged[gap] = 1;
      left--;
    }
    const spans: TInstanceSpan[] = [];
    let from = starts[0];
    for (let i = 0; i < starts.length; i++) {
      if (i < merged.length && merged[i] === 1) continue;
      spans.push(this.spanOf(from, ends[i]));
      if (i + 1 < starts.length) from = starts[i + 1];
    }
    return spans;
  }

  /** Sorts the tracked spans by start (when they do not ascend) and joins overlapping and touching ones, in place. */
  private joinSpans(): void {
    const starts = this.spanStarts;
    const ends = this.spanEnds;
    if (!this.spansSorted) {
      const order = Array.from({ length: starts.length }, (_, index) => index);
      order.sort((a, b) => starts[a] - starts[b]);
      const sortedStarts = order.map((index) => starts[index]);
      const sortedEnds = order.map((index) => ends[index]);
      for (let i = 0; i < order.length; i++) {
        starts[i] = sortedStarts[i];
        ends[i] = sortedEnds[i];
      }
      this.spansSorted = true;
    }
    let kept = 0;
    for (let i = 0; i < starts.length; i++) {
      if (kept > 0 && starts[i] <= ends[kept - 1]) {
        if (ends[i] > ends[kept - 1]) ends[kept - 1] = ends[i];
      } else {
        starts[kept] = starts[i];
        ends[kept] = ends[i];
        kept++;
      }
    }
    starts.length = kept;
    ends.length = kept;
  }

  private write(range: TRange, instances: ArrayLike<number>): void {
    this.buffer.set(instances, range.offset * this.floats);
    this.markDirty(range);
  }

  /** The range's instances go up with the next range upload. */
  private markDirty(range: TRange): void {
    this.markSpan(range.offset, range.offset + range.count);
  }

  /** Instances `start` to `end` go up with the next range upload, as a span of their own unless they join one. */
  private markSpan(start: number, end: number): void {
    if (start < this.dirtyStart) this.dirtyStart = start;
    if (end > this.dirtyEnd) this.dirtyEnd = end;
    const last = this.spanStarts.length - 1;
    if (last >= 0) {
      const lastStart = this.spanStarts[last];
      // Inside or right after the last span (writes in buffer order): it grows.
      if (start >= lastStart && start <= this.spanEnds[last]) {
        if (end > this.spanEnds[last]) this.spanEnds[last] = end;
        return;
      }
      if (start < lastStart) this.spansSorted = false;
    }
    this.spanStarts.push(start);
    this.spanEnds.push(end);
    if (this.spanStarts.length >= this.compactAt) {
      this.joinSpans();
      this.compactAt = Math.max(COMPACT_SPANS, 2 * this.spanStarts.length);
    }
  }

  private append(id: string, chunk: TStepSource): TRange {
    const range: TRange = {
      id,
      step: chunk.step,
      offset: this.used,
      count: chunk.instances.length / this.floats,
      dead: false,
    };
    if (this.retained) {
      // A long batch may remove and replace each element without reading the layout. Discard old metadata only
      // after at least half the records are dead, so those changes never walk all live ranges per element.
      if (this.deadRanges > 64 && this.deadRanges * 2 > this.list.length) this.settle();
      const slot = this.freeSlot(range.count);
      if (slot) {
        range.offset = slot.offset;
        this.removeFree(slot);
        if (slot.count > range.count) {
          this.addFree({ offset: slot.offset + range.count, count: slot.count - range.count });
        }
        this.list.push(range);
        this.slotsDirty = true;
        this.live += range.count;
        this.write(range, chunk.instances);
        return range;
      }
      this.reserve(range.count);
    }
    if (this.used === 0) this.full = true;
    this.buffer.set(chunk.instances, this.used * this.floats);
    this.list.push(range);
    this.used += range.count;
    this.live += range.count;
    this.markDirty(range);
    return range;
  }

  private freeSlot(count: number): TFreeSlot | undefined {
    const size = this.freeCounts[this.freeSizeIndex(count)];
    return this.freeSizes.get(size)?.values().next().value;
  }

  /** Lower bound over distinct free sizes, not over all resident ranges. */
  private freeSizeIndex(count: number): number {
    let low = 0;
    let high = this.freeCounts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.freeCounts[middle] < count) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private addFree(slot: TFreeSlot): void {
    this.freeStarts.set(slot.offset, slot);
    this.freeEnds.set(slot.offset + slot.count, slot);
    let sameSize = this.freeSizes.get(slot.count);
    if (!sameSize) {
      sameSize = new Set();
      this.freeSizes.set(slot.count, sameSize);
      this.freeCounts.splice(this.freeSizeIndex(slot.count), 0, slot.count);
    }
    sameSize.add(slot);
  }

  private removeFree(slot: TFreeSlot): void {
    this.freeStarts.delete(slot.offset);
    this.freeEnds.delete(slot.offset + slot.count);
    const sameSize = this.freeSizes.get(slot.count);
    sameSize?.delete(slot);
    if (sameSize?.size === 0) {
      this.freeSizes.delete(slot.count);
      this.freeCounts.splice(this.freeSizeIndex(slot.count), 1);
    }
  }

  private releaseSlot(offset: number, count: number): void {
    const left = this.freeEnds.get(offset);
    const right = this.freeStarts.get(offset + count);
    if (left) {
      this.removeFree(left);
      offset = left.offset;
      count += left.count;
    }
    if (right) {
      this.removeFree(right);
      count += right.count;
    }
    if (offset + count === this.used) this.used = offset;
    else this.addFree({ offset, count });
  }

  /** Marks ranges dead; the next read of the layout closes their gaps (`compact`). */
  private removeRanges(ranges: readonly TRange[]): void {
    for (const range of ranges) {
      range.dead = true;
      this.live -= range.count;
      if (this.retained) {
        this.buffer.fill(0, range.offset * this.floats, (range.offset + range.count) * this.floats);
        this.markDirty(range);
        this.releaseSlot(range.offset, range.count);
        this.slotsDirty = true;
      }
    }
    this.deadRanges += ranges.length;
  }

  /** Closes the gaps of the dead ranges before a read of the layout, which also ends the appends' count (`reserve`). */
  private settle(): void {
    this.forcedCompactions = 0;
    if (this.retained) {
      if (this.slotsDirty) {
        this.list = this.list.filter((range) => !range.dead).sort((a, b) => a.offset - b.offset);
        this.deadRanges = 0;
        this.slotsDirty = false;
      }
    } else if (this.deadRanges > 0) this.compact();
  }

  /** Drops the dead ranges and closes the gaps in one walk: one move per run of kept ranges after a dead one. */
  private compact(): void {
    const kept: TRange[] = [];
    const floats = this.floats;
    let write = 0;
    // The kept ranges since the last dead one: they lie back to back at `runFrom` and move to `runTo`.
    let runFrom = 0;
    let runTo = 0;
    let runCount = 0;
    const flush = (): void => {
      if (runCount > 0 && runFrom !== runTo) {
        this.buffer.copyWithin(runTo * floats, runFrom * floats, (runFrom + runCount) * floats);
        this.markSpan(runTo, runTo + runCount);
        if (runTo === 0) this.full = true;
      }
      runCount = 0;
    };
    for (const range of this.list) {
      if (range.dead) {
        flush();
        continue;
      }
      if (runCount === 0) {
        runFrom = range.offset;
        runTo = write;
      }
      range.offset = write;
      write += range.count;
      runCount += range.count;
      kept.push(range);
    }
    flush();
    this.list = kept;
    this.used = write;
    this.deadRanges = 0;
  }

  /**
   * Makes room for `added` more instances after the used ones. Dead ranges are dropped first when they do not fit, so
   * the buffer grows only when the live instances need it, as with a compaction on every removal. Past
   * `FORCED_COMPACTIONS` such compactions since the last read, it grows to twice the need instead, so the rest of the
   * frame's appends find room without walking the list again.
   */
  private reserve(added: number): void {
    if ((this.used + added) * this.floats <= this.buffer.length) return;
    if (this.deadRanges > 0 && !this.retained) {
      this.compact();
      this.forcedCompactions++;
    }
    const needed = (this.used + added) * this.floats;
    const target = this.forcedCompactions > FORCED_COMPACTIONS ? 2 * needed : needed;
    if (target <= this.buffer.length) return;
    let capacity = Math.max(this.buffer.length, this.floats);
    while (capacity < target) capacity *= 2;
    const grown = new Float32Array(capacity);
    grown.set(this.buffer);
    this.buffer = grown;
    this.full = true;
  }
}
