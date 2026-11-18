import type { TTileRect } from "../../culling/TileIndex";

import { DEPTH_INDICES, SCENE_DEPTH } from "./depth";

/** The grid has at most this many cells: a larger world gets larger cells. */
const MAX_CELLS = 2 ** 18;

/** An element that covers more cells than this skips the grid: it is tested against every element instead. */
const WIDE_CELLS = 4096;

/** Elements sampled for the typical element size. */
const SIZE_SAMPLES = 64;

/** The incremental pass can scan a few times the records and cell entries of a fresh pass. */
const MOVE_SCAN_FACTOR = 4;
const MIN_MOVE_SCAN_WORK = 2048;
/** Larger membership edits rebuild directly instead of seeding many overlapping local repairs. */
const MAX_LOCAL_EDITS = 64;
type TMoveBudget = { remaining: number };
type TBox = [minX: number, minY: number, maxX: number, maxY: number];
type TCompareSlots = (a: number, b: number) => number;

function sameBounds(a: TTileRect | undefined, b: TTileRect | undefined): boolean {
  if (!a || !b) return a === b;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/** Whether boxes `a` and `b` of a flat array of (minX, minY, maxX, maxY) intersect; touching counts, NaN counts. */
function intersects(boxes: Float64Array, a: number, b: number): boolean {
  const i = a * 4;
  const j = b * 4;
  return !(
    boxes[i + 2] < boxes[j] ||
    boxes[j + 2] < boxes[i] ||
    boxes[i + 3] < boxes[j + 1] ||
    boxes[j + 3] < boxes[i + 1]
  );
}

/** The extent of the finite coordinates of the first `count` boxes; (0, 0, 0, 0) on an axis without any. */
function finiteExtent(boxes: Float64Array, count: number): TTileRect {
  const box: TTileRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < count * 4; i += 4) {
    for (let axis = 0; axis < 2; axis++) {
      const low = boxes[i + axis];
      const high = boxes[i + axis + 2];
      const min = axis === 0 ? "minX" : "minY";
      const max = axis === 0 ? "maxX" : "maxY";
      if (Number.isFinite(low)) {
        box[min] = Math.min(box[min], low);
        box[max] = Math.max(box[max], low);
      }
      if (Number.isFinite(high)) {
        box[min] = Math.min(box[min], high);
        box[max] = Math.max(box[max], high);
      }
    }
  }
  if (box.minX > box.maxX) {
    box.minX = 0;
    box.maxX = 0;
  }
  if (box.minY > box.maxY) {
    box.minY = 0;
    box.maxY = 0;
  }
  return box;
}

/** The median of the larger sides of up to `SIZE_SAMPLES` boxes spread over the list; 0 when none is finite. */
function typicalSize(boxes: Float64Array, count: number): number {
  const sizes: number[] = [];
  const step = Math.max(1, Math.floor(count / SIZE_SAMPLES));
  for (let index = 0; index < count; index += step) {
    const i = index * 4;
    const size = Math.max(boxes[i + 2] - boxes[i], boxes[i + 3] - boxes[i + 1]);
    if (Number.isFinite(size) && size > 0) sizes.push(size);
  }
  if (sizes.length === 0) return 0;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/** A binary min-heap of box indices: a move re-levels boxes in scene order. */
class MinQueue {
  private readonly items: number[] = [];

  constructor(private readonly compare: TCompareSlots) {}

  public push(value: number): void {
    const { items } = this;
    items.push(value);
    let at = items.length - 1;
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (this.compare(items[parent], value) <= 0) break;
      items[at] = items[parent];
      at = parent;
    }
    items[at] = value;
  }

  public pop(): number | undefined {
    const { items } = this;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop() as number;
    if (items.length > 0) {
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        if (left >= items.length) break;
        const right = left + 1;
        const child = right < items.length && this.compare(items[right], items[left]) < 0 ? right : left;
        if (this.compare(items[child], last) >= 0) break;
        items[at] = items[child];
        at = child;
      }
      items[at] = last;
    }
    return top;
  }
}

/**
 * Overlap levels on a uniform world grid, kept between calls so that a move re-levels only what it can change.
 *
 * The cell edge is the median of the larger sides of the boxes (sampled), so a typical element covers about four
 * cells; it doubles until the grid over the boxes' extent has at most 2^18 cells. Each cell keeps an upper bound of the
 * levels in it and the boxes that touch it. A box's level is 1 + the highest level of the earlier boxes that really
 * intersect it (each candidate is tested on its bounds), found in its cells; a cell whose bound cannot raise the result
 * is skipped. A box over more than 4096 cells is wide: it is tested against every earlier box, and every later box
 * tests it, instead of entering the grid. Unbounded and NaN coordinates reach the grid's edge on their side, and boxes
 * that move out of the grid's extent stay in its edge cells.
 */
export class OverlapGrid {
  /** The boxes and levels of the last `compute`: the caller's arrays. */
  private boxes: Float64Array = new Float64Array(0);
  private levels: Int32Array = new Int32Array(0);
  private count = 0;
  private x0 = 0;
  private y0 = 0;
  private cell = 0;
  private columns = 1;
  private rows = 1;
  private cellLevel = new Int32Array(0);
  private cellHead = new Int32Array(0);
  private entryNext = new Int32Array(0);
  private entryBox = new Int32Array(0);
  private entries = 0;
  private freeEntry = -1;
  /** Per box, its cell range (cx0, cy0, cx1, cy1); cx0 is -1 for a wide box, which is in no cell. */
  private ranges = new Int32Array(0);
  private wide: number[] = [];
  /** Boxes waiting in the queue of a `move`. */
  private queued = new Uint8Array(0);
  private top = -1;
  private compare?: TCompareSlots;

  public get values(): Int32Array {
    return this.levels;
  }

  public writeBox(slot: number, [x0, y0, x1, y1]: TBox): boolean {
    const at = slot * 4;
    const { boxes } = this;
    if (boxes[at] === x0 && boxes[at + 1] === y0 && boxes[at + 2] === x1 && boxes[at + 3] === y1) return false;
    boxes[at] = x0;
    boxes[at + 1] = y0;
    boxes[at + 2] = x1;
    boxes[at + 3] = y1;
    return true;
  }

  /** The number of distinct levels: the highest level + 1, 0 without boxes. */
  public get levelCount(): number {
    return this.top + 1;
  }

  /**
   * Levels of the first `count` boxes of `boxes` (minX, minY, maxX, maxY each), given in scene order, into `out`. Keeps
   * both arrays: `move` reads the boxes the caller changes in place and writes the levels.
   */
  public compute(boxes: Float64Array, count: number, out: Int32Array): void {
    this.boxes = boxes;
    this.levels = out;
    this.count = count;
    this.top = -1;
    this.wide = [];
    if (count === 0) {
      this.cell = 0;
      return;
    }
    const { minX, minY, maxX, maxY } = finiteExtent(boxes, count);
    let cell = typicalSize(boxes, count) || Math.max(maxX - minX, maxY - minY, 1);
    let columns = Math.floor((maxX - minX) / cell) + 1;
    let rows = Math.floor((maxY - minY) / cell) + 1;
    while (columns * rows > MAX_CELLS) {
      cell *= 2;
      columns = Math.floor((maxX - minX) / cell) + 1;
      rows = Math.floor((maxY - minY) / cell) + 1;
    }
    this.x0 = minX;
    this.y0 = minY;
    this.cell = cell;
    this.columns = columns;
    this.rows = rows;
    this.reset(columns * rows, count);
    for (let box = 0; box < count; box++) {
      // Every box filed so far is earlier: the level comes before the box enters the grid.
      this.setRange(box);
      out[box] = this.levelFor(box);
      this.top = Math.max(this.top, out[box]);
      this.file(box);
    }
  }

  /**
   * Re-levels after the boxes `moved` changed in place in the array given to `compute`. A single move queues only
   * possible lost supports and new raises, including wide boxes; multiple moves conservatively visit later boxes
   * in every old and new cell. Propagation follows scene order. Returns the boxes whose level changed, or restores
   * the previous levels and returns undefined if the scan budget runs out or a multi-move touches a wide box. The
   * caller then rebuilds the grid with `compute`.
   */
  public move(moved: readonly number[], compare?: TCompareSlots): number[] | undefined {
    const single = moved.length === 1;
    return this.repair(
      compare,
      (enqueue, budget) => {
        for (const slot of moved) {
          if (!this.refileMoved(slot, enqueue, budget, single)) return false;
          enqueue(slot);
        }
        return true;
      },
      single
    )?.changed;
  }

  /** Refiles only edited slots. Old neighbors can lose support and new neighbors can gain it. */
  public edit(
    removed: readonly number[],
    inserted: readonly { slot: number; box: TBox }[],
    slots: number,
    compare: TCompareSlots
  ): { changed: number[]; previous: number[] } | undefined {
    this.extendSlots(slots);
    const removedSlots = new Set(removed);
    return this.repair(
      compare,
      (enqueue, budget) => {
        const seed = (slot: number, before: boolean): boolean =>
          this.nearby(
            slot,
            (other) => {
              if (!(before && removedSlots.has(other)) && intersects(this.boxes, slot, other)) enqueue(other);
            },
            budget,
            true
          );
        for (const slot of removed) {
          if (!seed(slot, true) || !this.unfile(slot, budget)) return false;
          this.levels[slot] = -1;
        }
        for (const { slot, box } of inserted) {
          this.writeBox(slot, box);
          this.setRange(slot);
          budget.remaining -= 2 * this.cellCountOf(slot);
          if (budget.remaining < 0) return false;
          this.file(slot);
        }
        for (const { slot } of inserted) {
          enqueue(slot);
          if (!seed(slot, false)) return false;
        }
        return true;
      },
      true,
      true
    );
  }

  private extendSlots(count: number): void {
    if (count <= this.count) return;
    if (count > this.levels.length) {
      const capacity = Math.max(count, this.levels.length * 2);
      const boxes = new Float64Array(capacity * 4);
      boxes.set(this.boxes);
      this.boxes = boxes;
      const levels = new Int32Array(capacity);
      levels.set(this.levels);
      this.levels = levels;
    }
    if (count > this.queued.length) {
      const ranges = new Int32Array(this.levels.length * 4);
      ranges.set(this.ranges);
      this.ranges = ranges;
      this.queued = new Uint8Array(this.levels.length);
    }
    this.levels.fill(-1, this.count, count);
    this.count = count;
  }

  private repair(
    compare: TCompareSlots | undefined,
    seed: (enqueue: (slot: number) => void, budget: TMoveBudget) => boolean,
    precise: boolean,
    structural = false
  ): { changed: number[]; previous: number[] } | undefined {
    this.compare = compare;
    const queue = new MinQueue(compare ?? ((a, b) => a - b));
    const budget = { remaining: Math.max(MIN_MOVE_SCAN_WORK, MOVE_SCAN_FACTOR * (this.count + this.entries)) };
    const changed: number[] = [];
    const previous: number[] = [];
    const enqueue = (slot: number): void => {
      if (this.queued[slot]) return;
      this.queued[slot] = 1;
      queue.push(slot);
    };
    if (!seed(enqueue, budget)) return this.abortMove(changed, previous);
    for (let slot = queue.pop(); slot !== undefined; slot = queue.pop()) {
      this.queued[slot] = 0;
      const level = this.levelFor(slot, budget);
      if (level < 0) return this.abortMove(changed, previous);
      if (level === this.levels[slot]) continue;
      budget.remaining -= this.cellCountOf(slot);
      if (budget.remaining < 0) return this.abortMove(changed, previous);
      const old = this.levels[slot];
      previous.push(old);
      this.levels[slot] = level;
      changed.push(slot);
      this.raiseCells(slot);
      const visit = precise
        ? (other: number): void => {
            if ((this.levels[other] === old + 1 || level >= this.levels[other]) && intersects(this.boxes, slot, other))
              enqueue(other);
          }
        : enqueue;
      if (!this.nearby(slot, visit, budget)) return this.abortMove(changed, previous);
    }
    this.compare = undefined;
    if (structural || changed.length > 0) {
      this.top = -1;
      for (let slot = 0; slot < this.count; slot++) this.top = Math.max(this.top, this.levels[slot]);
    }
    return { changed, previous };
  }

  private before(a: number, b: number): boolean {
    return this.compare ? this.compare(a, b) < 0 : a < b;
  }

  private refileMoved(box: number, enqueue: (other: number) => void, budget: TMoveBudget, single = false): boolean {
    // Old bounds are already overwritten, but the old cells include every possible lost support.
    const lost = single
      ? (other: number): void => {
          if (this.levels[other] === this.levels[box] + 1) enqueue(other);
        }
      : enqueue;
    if ((!single && this.ranges[box * 4] < 0) || !this.nearby(box, lost, budget) || !this.unfile(box, budget))
      return false;
    this.setRange(box);
    if (!single && this.ranges[box * 4] < 0) return false;
    // Filing adds each entry and then raises the bound of its cell.
    budget.remaining -= 2 * this.cellCountOf(box);
    if (budget.remaining < 0) return false;
    this.file(box);
    // The moved level may stay equal while its new overlaps raise later boxes. A changed level propagates again.
    const gained = single
      ? (other: number): void => {
          if (this.levels[box] >= this.levels[other] && intersects(this.boxes, box, other)) enqueue(other);
        }
      : enqueue;
    return this.nearby(box, gained, budget);
  }

  private abortMove(changed: readonly number[], previous: readonly number[]): undefined {
    // The caller compares the exact rebuild with the pre-move levels. Grid entries are rebuilt from scratch.
    for (let i = 0; i < changed.length; i++) this.levels[changed[i]] = previous[i];
    this.queued.fill(0, 0, this.count);
    this.compare = undefined;
    return undefined;
  }

  /** 1 + the highest level of the earlier boxes that intersect `box`, or -1 when a move runs out of scan work. */
  private levelFor(box: number, budget?: TMoveBudget): number {
    const at = box * 4;
    if (this.ranges[at] < 0) return this.levelForWide(box, budget);
    const { boxes, levels } = this;
    let best = -1;
    for (const other of this.wide) {
      if (budget && --budget.remaining < 0) return -1;
      if (levels[other] > best && this.before(other, box) && intersects(boxes, other, box)) best = levels[other];
    }
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        if (budget && --budget.remaining < 0) return -1;
        const c = cy * this.columns + cx;
        const bound = this.cellLevel[c];
        if (bound <= best) continue;
        // Entries are newest first. Once the best reaches the cell's bound, no entry can raise it: a stack of N boxes
        // in one cell costs O(N), not O(N^2).
        for (let entry = this.cellHead[c]; entry >= 0 && best < bound; entry = this.entryNext[entry]) {
          if (budget && --budget.remaining < 0) return -1;
          const other = this.entryBox[entry];
          if (levels[other] > best && this.before(other, box) && intersects(boxes, other, box)) best = levels[other];
        }
      }
    }
    return best + 1;
  }

  /** Wide boxes already scan all earlier entries, including the earlier wide boxes. */
  private levelForWide(box: number, budget: TMoveBudget | undefined): number {
    const { boxes, levels } = this;
    let best = -1;
    for (let other = 0, end = this.compare ? this.count : box; other < end; other++) {
      if (budget && --budget.remaining < 0) return -1;
      if (levels[other] > best && this.before(other, box) && intersects(boxes, other, box)) best = levels[other];
    }
    return best + 1;
  }

  /** Visits spatial candidates, including earlier ones when a structural edit needs its old neighbors. */
  private nearby(box: number, visit: (other: number) => void, budget: TMoveBudget, all = false): boolean {
    const at = box * 4;
    const consider = (other: number): void => {
      if (all ? other !== box : this.before(box, other)) visit(other);
    };
    if (this.ranges[at] < 0) {
      for (let other = all || this.compare ? 0 : box + 1; other < this.count; other++) {
        if (--budget.remaining < 0) return false;
        if (this.levels[other] >= 0) consider(other);
      }
      return true;
    }
    for (const other of this.wide) {
      if (--budget.remaining < 0) return false;
      consider(other);
    }
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        if (--budget.remaining < 0) return false;
        for (let entry = this.cellHead[cy * this.columns + cx]; entry >= 0; entry = this.entryNext[entry]) {
          if (--budget.remaining < 0) return false;
          consider(this.entryBox[entry]);
        }
      }
    }
    return true;
  }

  /** Writes the cell range of the box from its coordinates; a box over too many cells is wide. */
  private setRange(box: number): void {
    const i = box * 4;
    const { boxes, cell, columns, rows } = this;
    const low = (value: number, origin: number, size: number): number => {
      const index = Math.floor((value - origin) / cell);
      return index > 0 ? Math.min(index, size - 1) : 0;
    };
    const high = (value: number, origin: number, size: number): number => {
      const index = Math.floor((value - origin) / cell);
      return index < size - 1 ? Math.max(index, 0) : size - 1;
    };
    const cx0 = low(boxes[i], this.x0, columns);
    const cy0 = low(boxes[i + 1], this.y0, rows);
    const cx1 = high(boxes[i + 2], this.x0, columns);
    const cy1 = high(boxes[i + 3], this.y0, rows);
    const cells = Math.max(0, cx1 - cx0 + 1) * Math.max(0, cy1 - cy0 + 1);
    if (cells > WIDE_CELLS) this.ranges.set([-1, 0, -2, -1], i);
    else this.ranges.set([cx0, cy0, cx1, cy1], i);
  }

  private cellCountOf(box: number): number {
    const at = box * 4;
    const { ranges } = this;
    return Math.max(0, ranges[at + 2] - ranges[at] + 1) * Math.max(0, ranges[at + 3] - ranges[at + 1] + 1);
  }

  /** Enters the box into its cells, or into the wide list, and raises the cells' level bounds to its level. */
  private file(box: number): void {
    const at = box * 4;
    if (this.ranges[at] < 0) {
      this.wide.push(box);
      return;
    }
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) this.addEntry(cy * this.columns + cx, box);
    }
    this.raiseCells(box);
  }

  /** Takes the box out of its cells; a cell's level bound stays an upper bound. */
  private unfile(box: number, budget: TMoveBudget): boolean {
    const at = box * 4;
    if (this.ranges[at] < 0) {
      budget.remaining -= 2 * this.wide.length;
      if (budget.remaining < 0) return false;
      this.wide.splice(this.wide.indexOf(box), 1);
      return true;
    }
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        if (--budget.remaining < 0) return false;
        const c = cy * this.columns + cx;
        let previous = -1;
        for (let entry = this.cellHead[c]; entry >= 0; entry = this.entryNext[entry]) {
          if (--budget.remaining < 0) return false;
          if (this.entryBox[entry] !== box) {
            previous = entry;
            continue;
          }
          if (previous < 0) this.cellHead[c] = this.entryNext[entry];
          else this.entryNext[previous] = this.entryNext[entry];
          this.entryNext[entry] = this.freeEntry;
          this.freeEntry = entry;
          break;
        }
      }
    }
    return true;
  }

  private raiseCells(box: number): void {
    const at = box * 4;
    const level = this.levels[box];
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        const c = cy * this.columns + cx;
        if (this.cellLevel[c] < level) this.cellLevel[c] = level;
      }
    }
  }

  private reset(cells: number, count: number): void {
    if (this.cellLevel.length < cells) {
      this.cellLevel = new Int32Array(cells);
      this.cellHead = new Int32Array(cells);
    }
    this.cellLevel.fill(-1, 0, cells);
    this.cellHead.fill(-1, 0, cells);
    this.entries = 0;
    this.freeEntry = -1;
    if (this.ranges.length < count * 4) {
      this.ranges = new Int32Array(count * 4);
      this.queued = new Uint8Array(count);
    }
  }

  private addEntry(cell: number, box: number): void {
    let entry = this.freeEntry;
    if (entry >= 0) {
      this.freeEntry = this.entryNext[entry];
    } else {
      if (this.entries === this.entryBox.length) {
        const capacity = Math.max(1024, this.entries * 2);
        const next = new Int32Array(capacity);
        next.set(this.entryNext);
        this.entryNext = next;
        const owners = new Int32Array(capacity);
        owners.set(this.entryBox);
        this.entryBox = owners;
      }
      entry = this.entries++;
    }
    this.entryBox[entry] = box;
    this.entryNext[entry] = this.cellHead[cell];
    this.cellHead[cell] = entry;
  }
}

/** What the levels read of an element: its origin and the store's bounds, relative to the origin. */
export type TLevelElement = { x: number; y: number; bounds: TTileRect };
type TLevelBand = {
  readonly key: number;
  readonly grid: OverlapGrid;
  slots: (string | undefined)[];
  free: number[];
  size: number;
  first: number;
  orderBase: number;
  sparse: boolean;
};
type TPlacement = { band: TLevelBand; slot: number };
type TBandEdit = {
  removed: number[];
  inserted: { slot: number; box: TBox }[];
  oldSize: number;
};

/**
 * An owner's local level is one more than the highest level of an earlier intersecting owner in its painter band.
 * Band bases are the prefix counts of actual owners. Within a band, physical grid slots survive add, remove and raise:
 * only the changed boxes and their dependent neighbors need a new overlap level. A pan changes nothing here.
 */
export class TranslucentLevels {
  private readonly baked = new Map<string, { bounds: TTileRect | undefined; complete: boolean; serial: number }>();
  private serial = 0;
  private indexOf = new Map<string, TPlacement>();
  private full = false;
  private readonly structural = new Set<string>();
  private readonly moves = new Set<string>();
  private changes = 0;
  private changedIds: readonly string[] | undefined;
  private partitioned = false;
  private orderedBands = true;
  private bands: TLevelBand[] = [];
  private readonly bandByKey = new Map<number, TLevelBand>();

  /** Changes whenever a cached painter level changes. */
  public get revision(): number {
    return this.changes;
  }

  /** Changes to orderLevelOf in the latest revision; undefined when the previous order was discarded. */
  public get changedLevelIds(): readonly string[] | undefined {
    return this.changedIds;
  }

  /** The number of distinct levels; unused gaps between painter bands do not count. */
  public get count(): number {
    let count = 0;
    for (const band of this.bands) count += band.grid.levelCount;
    return count;
  }

  public get pending(): boolean {
    return this.full || this.structural.size > 0 || this.moves.size > 0;
  }

  /** Compact levels leave room for the element tie-breaker in dense physical sorts. */
  public levelOf(id: string): number {
    const at = this.indexOf.get(id);
    return at ? at.band.first + at.band.grid.values[at.slot] : 0;
  }

  /** Group slot and local overlap level stay stable when a lower painter group gains or loses an owner. */
  public orderLevelOf(id: string): number {
    const at = this.indexOf.get(id);
    return at ? at.band.orderBase + at.band.grid.values[at.slot] : 0;
  }

  /** Adds an element or updates its relative bounds. Complete bounds replace the store box. */
  public set(id: string, bounds: TTileRect | undefined, complete = false): void {
    const before = this.baked.get(id);
    if (!before) this.structural.add(id);
    else {
      if (before.complete === complete && sameBounds(before.bounds, bounds)) return;
      this.moves.add(id);
    }
    this.baked.set(id, { bounds, complete, serial: before?.serial ?? this.serial++ });
  }

  public delete(id: string): void {
    if (this.baked.delete(id)) this.structural.add(id);
  }

  public moved(id: string): void {
    if (this.baked.has(id)) this.moves.add(id);
  }

  public reordered(id: string): void {
    if (this.baked.has(id)) this.structural.add(id);
  }

  public clear(): void {
    this.baked.clear();
    this.serial = 0;
    this.full = true;
    this.changedIds = undefined;
    this.changes++;
  }

  /**
   * In the renderer, band keys are increasing in painter order. Reorders must report the affected owners, including
   * those that change bands. The sorted dense rebuild also supports cold layouts and nonstandard band partitions.
   */
  public update(
    keyOf: (id: string) => number,
    elementOf: (id: string) => TLevelElement | undefined,
    bandOf?: (id: string) => number
  ): boolean {
    const structural = this.structural.size > 0;
    if (
      this.full ||
      this.partitioned !== Boolean(bandOf) ||
      (structural &&
        (this.indexOf.size === 0 ||
          !this.orderedBands ||
          this.structural.size + this.moves.size > MAX_LOCAL_EDITS ||
          [...this.structural].some(
            (id) => this.baked.has(id) && bandOf !== undefined && !Number.isFinite(bandOf(id))
          )))
    )
      return this.rebuild(keyOf, elementOf, bandOf);
    if (structural) return this.patch(keyOf, elementOf, bandOf);
    return this.move(keyOf, elementOf);
  }

  private compareSlots(band: TLevelBand, keyOf: (id: string) => number): TCompareSlots {
    const keys = new Map<number, number>();
    const key = (slot: number): number => {
      let current = keys.get(slot);
      if (current === undefined) {
        current = keyOf(band.slots[slot] as string);
        keys.set(slot, current);
      }
      return current;
    };
    return (a, b) => key(a) - key(b) || this.serialOf(band.slots[a] as string) - this.serialOf(band.slots[b] as string);
  }

  private serialOf(id: string): number {
    return this.baked.get(id)?.serial ?? 0;
  }

  private move(keyOf: (id: string) => number, elementOf: (id: string) => TLevelElement | undefined): boolean {
    const moved = new Map<TLevelBand, number[]>();
    for (const id of this.moves) {
      const at = this.indexOf.get(id);
      if (!at) continue;
      const { band, slot } = at;
      if (!band.grid.writeBox(slot, this.readBox(id, elementOf))) continue;
      let slots = moved.get(band);
      if (!slots) moved.set(band, (slots = []));
      slots.push(slot);
    }
    this.moves.clear();
    const changedIds: string[] = [];
    for (const [band, slots] of moved) {
      const { grid } = band;
      const changed = grid.move(slots, band.sparse ? this.compareSlots(band, keyOf) : undefined);
      if (changed === undefined) {
        const before = new Map<string, number | undefined>();
        this.rebuildBand(band, before, keyOf, elementOf);
        for (const [id, level] of before) if (level !== this.orderLevelOf(id)) changedIds.push(id);
      } else {
        for (const slot of changed) changedIds.push(band.slots[slot] as string);
      }
    }
    return this.publish(changedIds);
  }

  private patch(
    keyOf: (id: string) => number,
    elementOf: (id: string) => TLevelElement | undefined,
    bandOf?: (id: string) => number
  ): boolean {
    const touched = new Set([...this.structural, ...this.moves]);
    const edits = new Map<TLevelBand, TBandEdit>();
    const before = new Map<string, number | undefined>();
    const editOf = (band: TLevelBand): TBandEdit => {
      let edit = edits.get(band);
      if (!edit) edits.set(band, (edit = { removed: [], inserted: [], oldSize: band.size }));
      return edit;
    };

    // All former slots are freed before new membership is laid out, including same-band changes of paint order.
    for (const id of touched) {
      const at = this.indexOf.get(id);
      before.set(id, at ? this.orderLevelOf(id) : undefined);
      if (!at) continue;
      const { band, slot } = at;
      editOf(band).removed.push(slot);
      this.indexOf.delete(id);
      band.slots[slot] = undefined;
      band.free.push(slot);
      band.size--;
    }
    for (const id of touched) {
      if (!this.baked.has(id)) continue;
      const key = bandOf?.(id) ?? 0;
      let band = this.bandByKey.get(key);
      if (!band) {
        band = this.createBand(key);
        this.bandByKey.set(key, band);
      }
      const slot = band.free.pop() ?? band.slots.length;
      editOf(band).inserted.push({ slot, box: this.readBox(id, elementOf) });
      band.slots[slot] = id;
      band.size++;
      this.indexOf.set(id, { band, slot });
    }

    for (const [band, edit] of edits) {
      if (band.size === 0) {
        this.bandByKey.delete(band.key);
        continue;
      }
      // A mostly empty grid is compacted by the same exact fallback to bound retained slots after deletions.
      const delta =
        edit.oldSize > 0 && band.free.length < band.size
          ? band.grid.edit(edit.removed, edit.inserted, band.slots.length, this.compareSlots(band, keyOf))
          : undefined;
      if (!delta) this.rebuildBand(band, before, keyOf, elementOf);
      else {
        band.sparse = true;
        delta.changed.forEach((slot, index) => {
          const id = band.slots[slot] as string;
          if (!before.has(id)) before.set(id, band.orderBase + delta.previous[index]);
        });
      }
    }
    this.bands = [...this.bandByKey.values()].sort((a, b) => a.key - b.key);
    this.assignBandBases(before);
    this.structural.clear();
    this.moves.clear();
    this.full = false;
    return this.publish(
      [...before]
        .filter(([id, level]) => (level === undefined ? this.indexOf.has(id) : level !== this.orderLevelOf(id)))
        .map(([id]) => id)
    );
  }

  private bandSlots(): number[] | undefined {
    if (!this.orderedBands || this.indexOf.size > DEPTH_INDICES || this.bands.length > 2 ** SCENE_DEPTH.BAND_BITS)
      return undefined;
    // With 23 bits for a local level and up to 24 for its primitive step, six bits remain exactly representable.
    const limit = 2 ** (52 - 2 * SCENE_DEPTH.INDEX_BITS);
    const slots = this.bands.map(({ orderBase }) => {
      const slot = orderBase / DEPTH_INDICES;
      return Number.isInteger(slot) && slot < limit ? slot : -1;
    });
    // Unplaced owners share level zero with the lowest band's first level.
    if (slots.length) slots[0] = 0;
    for (let i = 1; i < slots.length; ) {
      const left = slots[i - 1];
      let end = i;
      while (end < slots.length && slots[end] <= left) end++;
      if (end === i) {
        i++;
        continue;
      }
      // Place only the new groups between surviving labels. Relabel on the rare exhausted gap.
      const step = Math.floor(((slots[end] ?? limit) - left) / (end - i + 1));
      if (step === 0) return slots.map((_, rank) => Math.floor((rank * limit) / slots.length));
      let slot = left;
      while (i < end) {
        slot += step;
        slots[i++] = slot;
      }
    }
    return slots;
  }

  private assignBandBases(before?: Map<string, number | undefined>): void {
    const slots = this.bandSlots();
    let first = 0;
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const base = slots ? slots[i] * DEPTH_INDICES : first;
      if (before && band.orderBase !== base) this.rememberLevels(band, before);
      band.orderBase = base;
      band.first = first;
      first += band.size;
    }
  }

  private publish(changedIds: string[]): boolean {
    if (changedIds.length === 0) return false;
    this.changedIds = changedIds;
    this.changes++;
    return true;
  }

  private createBand(key: number, grid = new OverlapGrid()): TLevelBand {
    return { key, grid, size: 0, free: [], slots: [], first: 0, orderBase: -1, sparse: false };
  }

  private rememberLevels(band: TLevelBand, before: Map<string, number | undefined>): void {
    const { grid, orderBase } = band;
    band.slots.forEach((id, slot) => {
      if (id !== undefined && !before.has(id)) before.set(id, orderBase + grid.values[slot]);
    });
  }

  private rebuildBand(
    band: TLevelBand,
    before: Map<string, number | undefined>,
    keyOf: (id: string) => number,
    elementOf: (id: string) => TLevelElement | undefined
  ): void {
    this.rememberLevels(band, before);
    const ids = band.slots.filter((id): id is string => id !== undefined);
    ids.sort((a, b) => keyOf(a) - keyOf(b) || this.serialOf(a) - this.serialOf(b));
    this.computeBand(band, ids, elementOf);
  }

  private computeBand(band: TLevelBand, ids: string[], elementOf: (id: string) => TLevelElement | undefined): void {
    band.slots = ids;
    band.size = ids.length;
    band.free = [];
    band.sparse = false;
    const boxes = new Float64Array(band.size * 4);
    ids.forEach((id, slot) => {
      this.indexOf.set(id, { band, slot });
      boxes.set(this.readBox(id, elementOf), slot * 4);
    });
    band.grid.compute(boxes, band.size, new Int32Array(band.size));
  }

  /** Orders the translucent elements by depth key and computes every level. */
  private rebuild(
    keyOf: (id: string) => number,
    elementOf: (id: string) => TLevelElement | undefined,
    bandOf?: (id: string) => number
  ): boolean {
    const previousIndex = this.indexOf;
    const previousBands = this.bands;
    const previous = new Map(previousBands.map((band) => [band, band.grid.values]));
    const keyed = [...this.baked.keys()].map((id) => ({ id, order: keyOf(id), band: bandOf?.(id) ?? 0 }));
    keyed.sort((a, b) => a.order - b.order);
    this.indexOf = new Map();
    this.bands = [];
    this.orderedBands = true;
    for (let first = 0; first < keyed.length; ) {
      const key = keyed[first].band;
      let end = first + 1;
      while (end < keyed.length && keyed[end].band === key) end++;
      const last = this.bands.at(-1);
      this.orderedBands &&= Number.isFinite(key) && (!last || last.key < key);
      const band = this.createBand(key, previousBands[this.bands.length]?.grid);
      band.orderBase = this.bandByKey.get(key)?.orderBase ?? -1;
      this.computeBand(
        band,
        keyed.slice(first, end).map(({ id }) => id),
        elementOf
      );
      this.bands.push(band);
      first = end;
    }
    this.bandByKey.clear();
    for (const band of this.bands) this.bandByKey.set(band.key, band);
    this.assignBandBases();
    this.partitioned = Boolean(bandOf);
    this.full = false;
    this.structural.clear();
    this.moves.clear();
    if (previousIndex.size === 0) {
      if (keyed.length === 0) return false;
      this.changedIds = undefined;
      this.changes++;
      return true;
    }
    const oldLevel = ({ band, slot }: TPlacement): number => band.orderBase + (previous.get(band)?.[slot] ?? 0);
    const changedIds: string[] = [];
    for (const [id] of this.indexOf) {
      const old = previousIndex.get(id);
      if (!old || oldLevel(old) !== this.orderLevelOf(id)) changedIds.push(id);
    }
    for (const [id, old] of previousIndex) {
      if (oldLevel(old) !== 0 && !this.indexOf.has(id)) changedIds.push(id);
    }
    return this.publish(changedIds);
  }

  private readBox(id: string, elementOf: (id: string) => TLevelElement | undefined): TBox {
    const element = elementOf(id);
    if (!element) return [Infinity, Infinity, -Infinity, -Infinity];
    const { x, y, bounds } = element;
    const baked = this.baked.get(id);
    const paint = baked?.bounds ?? bounds;
    if (baked?.complete) {
      // Shader control points, origin addition and projection round to float32, including opposing large coordinates.
      const magnitude = Math.max(
        Math.abs(x),
        Math.abs(y),
        Math.abs(paint.minX),
        Math.abs(paint.minY),
        Math.abs(paint.maxX),
        Math.abs(paint.maxY)
      );
      const pad = Number.isFinite(magnitude) ? (magnitude + 1) * 2 ** -18 : 0;
      return [x + paint.minX - pad, y + paint.minY - pad, x + paint.maxX + pad, y + paint.maxY + pad];
    }
    return [
      x + Math.min(bounds.minX, paint.minX),
      y + Math.min(bounds.minY, paint.minY),
      x + Math.max(bounds.maxX, paint.maxX),
      y + Math.max(bounds.maxY, paint.maxY),
    ];
  }
}
