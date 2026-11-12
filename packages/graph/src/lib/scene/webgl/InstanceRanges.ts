/** The instances of one element and one step, in instances: `offset` in the buffer and `count`. */
type TRange = { id: string; step: number; offset: number; count: number };

/** The instances of one step of an element. */
export type TStepInstances = { step: number; instances: Float32Array };

export type TInstanceUpload =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "range"; byteOffset: number; data: Float32Array };

const INITIAL_INSTANCES = 64;

/** The source of revisions: shared by every list, so a new list never repeats the revision of a list it replaces. */
let lastRevision = 0;

function sameShape(ranges: readonly TRange[], steps: readonly TStepInstances[], floats: number): boolean {
  return (
    ranges.length === steps.length &&
    ranges.every(
      (range, index) => range.step === steps[index].step && range.count * floats === steps[index].instances.length
    )
  );
}

/**
 * Packs per-element instance data into one array and tells what to upload to the GPU. An element's instances are kept
 * per step (`setSteps`; `set` writes step 0 only), each step a range of its own, so ranges of one element can lie apart.
 * The ranges lie in the buffer back to back in the order `forEachRange` lists them: new ranges go to the end, a delete
 * closes the gap, and `sortBy` puts them in key order.
 */
export class InstanceRanges {
  public readonly floats: number;

  /** Every range in buffer order: each starts where the previous one ends. */
  private list: TRange[] = [];
  /** The ranges of each element, by ascending step. */
  private readonly byId = new Map<string, TRange[]>();
  private buffer: Float32Array;
  private used = 0;
  private full = false;
  private dirtyStart = Infinity;
  private dirtyEnd = -1;
  private changes = ++lastRevision;
  private layoutChanges = ++lastRevision;

  constructor(floatsPerInstance: number) {
    this.floats = floatsPerInstance;
    this.buffer = new Float32Array(INITIAL_INSTANCES * floatsPerInstance);
  }

  public get count(): number {
    return this.used;
  }

  public get data(): Float32Array {
    return this.buffer.subarray(0, this.used * this.floats);
  }

  /** Changes whenever instance data or the order of the ranges changes; unique across all lists. */
  public get revision(): number {
    return this.changes;
  }

  /**
   * Changes whenever a range is added, removed or moved, but not on an in-place rewrite; unique across all lists. A
   * full upload follows each such change, except a sort, which uploads the span it moved.
   */
  public get layoutRevision(): number {
    return this.layoutChanges;
  }

  /** The ranges in buffer order: `offset` and `count` in instances. */
  public forEachRange(visit: (id: string, offset: number, count: number, step: number) => void): void {
    for (const range of this.list) visit(range.id, range.offset, range.count, range.step);
  }

  /** Writes the element's instances as step 0, its only range. */
  public set(id: string, instances: Float32Array): void {
    this.setSteps(id, [{ step: 0, instances }]);
  }

  /**
   * Replaces the element's ranges by one range per step, steps in ascending order; empty steps are skipped, and with
   * none left the element is deleted. With the same steps and counts the data is rewritten in place (a range upload);
   * otherwise the old ranges are removed and the new ones go to the end (a full upload).
   */
  public setSteps(id: string, steps: readonly TStepInstances[]): void {
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
    this.reserve(this.used + chunks.reduce((sum, chunk) => sum + chunk.instances.length / this.floats, 0));
    this.byId.set(
      id,
      chunks.map((chunk) => this.append(id, chunk))
    );
    this.full = true;
  }

  public delete(id: string): void {
    const current = this.byId.get(id);
    if (!current) return;
    this.changes = ++lastRevision;
    this.layoutChanges = ++lastRevision;
    this.removeRanges(current);
    this.byId.delete(id);
    this.full = true;
  }

  /**
   * Puts the ranges in ascending `keyOf` order, a stable sort, and moves their instance data along. Only the span from
   * the first range that moved to the last one is rewritten, and only it is uploaded. Returns whether anything moved;
   * sorted ranges are left alone.
   */
  public sortBy(keyOf: (id: string, step: number) => number): boolean {
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
    this.dirtyStart = Math.min(this.dirtyStart, start);
    this.dirtyEnd = Math.max(this.dirtyEnd, end);
    this.changes = ++lastRevision;
    this.layoutChanges = ++lastRevision;
    return true;
  }

  public takeUpload(): TInstanceUpload {
    if (this.full) {
      this.clear();
      return { kind: "full" };
    }
    if (this.dirtyEnd < 0) return { kind: "none" };
    const upload: TInstanceUpload = {
      kind: "range",
      byteOffset: this.dirtyStart * this.floats * 4,
      data: this.buffer.subarray(this.dirtyStart * this.floats, this.dirtyEnd * this.floats),
    };
    this.clear();
    return upload;
  }

  private clear(): void {
    this.full = false;
    this.dirtyStart = Infinity;
    this.dirtyEnd = -1;
  }

  private write(range: TRange, instances: Float32Array): void {
    this.buffer.set(instances, range.offset * this.floats);
    this.dirtyStart = Math.min(this.dirtyStart, range.offset);
    this.dirtyEnd = Math.max(this.dirtyEnd, range.offset + range.count);
  }

  private append(id: string, chunk: TStepInstances): TRange {
    const range: TRange = { id, step: chunk.step, offset: this.used, count: chunk.instances.length / this.floats };
    this.buffer.set(chunk.instances, this.used * this.floats);
    this.list.push(range);
    this.used += range.count;
    return range;
  }

  /** Removes ranges and closes the gaps: one move per run of kept ranges after a removed one. */
  private removeRanges(ranges: readonly TRange[]): void {
    const removed = new Set(ranges);
    const kept: TRange[] = [];
    const floats = this.floats;
    let write = 0;
    // The kept ranges since the last removed one: they lie back to back at `runFrom` and move to `runTo`.
    let runFrom = 0;
    let runTo = 0;
    let runCount = 0;
    const flush = (): void => {
      if (runCount > 0 && runFrom !== runTo) {
        this.buffer.copyWithin(runTo * floats, runFrom * floats, (runFrom + runCount) * floats);
      }
      runCount = 0;
    };
    for (const range of this.list) {
      if (removed.has(range)) {
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
  }

  private reserve(instances: number): void {
    const needed = instances * this.floats;
    if (needed <= this.buffer.length) return;
    let capacity = Math.max(this.buffer.length, this.floats);
    while (capacity < needed) capacity *= 2;
    const grown = new Float32Array(capacity);
    grown.set(this.buffer);
    this.buffer = grown;
  }
}
