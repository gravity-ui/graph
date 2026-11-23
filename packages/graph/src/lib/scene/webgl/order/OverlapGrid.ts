import type { TTileRect } from "../../../culling/TileIndex";

/** The grid has at most this many cells: a larger world gets larger cells. */
const MAX_CELLS = 2 ** 18;

/** An element that covers more cells than this skips the grid: it is tested against every element instead. */
const WIDE_CELLS = 4096;

/** Elements sampled for the typical element size. */
const SIZE_SAMPLES = 64;

/** The incremental pass can scan a few times the records and cell entries of a fresh pass. */
const MOVE_SCAN_FACTOR = 4;

const MIN_MOVE_SCAN_WORK = 2048;

type TMoveBudget = { remaining: number };

export type TBox = [minX: number, minY: number, maxX: number, maxY: number];

export type TCompareSlots = (a: number, b: number) => number;

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

  public writeBox(slot: number, [x0, y0, x1, y1]: TBox, previous?: TBox): boolean {
    const at = slot * 4;
    const { boxes } = this;
    if (boxes[at] === x0 && boxes[at + 1] === y0 && boxes[at + 2] === x1 && boxes[at + 3] === y1) return false;
    if (previous) {
      previous[0] = boxes[at];
      previous[1] = boxes[at + 1];
      previous[2] = boxes[at + 2];
      previous[3] = boxes[at + 3];
    }
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
  public compute(boxes: Float64Array, count: number, out: Int32Array, delta?: number[]): void {
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
      const level = this.levelFor(box);
      if (delta && level !== out[box]) delta.push(box);
      out[box] = level;
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
  public move(moved: readonly number[], compare?: TCompareSlots, previousBox?: TBox): number[] | undefined {
    const single = moved.length === 1;
    if (single && !compare && previousBox) {
      const slot = moved[0];
      const at = slot * 4;
      const { boxes } = this;
      const left = Math.min(boxes[at], previousBox[0]);
      const top = Math.min(boxes[at + 1], previousBox[1]);
      const right = Math.max(boxes[at + 2], previousBox[2]);
      const bottom = Math.max(boxes[at + 3], previousBox[3]);
      const cells = ((right - left) / this.cell + 1) * ((bottom - top) / this.cell + 1);
      // A broad move can queue most later owners many times through their shared cells.
      if (cells * this.count > ((this.count - slot) * this.rows * this.columns) / 16)
        return this.sweepMoved(slot, left, top, right, bottom);
    }
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

  /** In painter order a changed level can only reach a later owner intersecting the growing affected bounds. */
  private sweepMoved(slot: number, left: number, top: number, right: number, bottom: number): number[] | undefined {
    const { boxes, levels } = this;
    const changed: number[] = [];
    const previous: number[] = [];
    const budget = { remaining: 2 * (this.count + this.entries) };
    if (!this.unfile(slot, budget)) return undefined;
    this.setRange(slot);
    this.file(slot);
    for (let owner = slot; owner < this.count; owner++) {
      const at = owner * 4;
      if (
        owner !== slot &&
        (boxes[at] > right || boxes[at + 2] < left || boxes[at + 1] > bottom || boxes[at + 3] < top)
      )
        continue;
      const level = this.levelFor(owner, budget);
      if (level < 0) return this.abortMove(changed, previous);
      if (level === levels[owner]) continue;
      previous.push(levels[owner]);
      levels[owner] = level;
      changed.push(owner);
      this.raiseCells(owner);
      left = Math.min(left, boxes[at]);
      top = Math.min(top, boxes[at + 1]);
      right = Math.max(right, boxes[at + 2]);
      bottom = Math.max(bottom, boxes[at + 3]);
    }
    if (changed.length) this.updateTop();
    return changed;
  }

  private updateTop(): void {
    this.top = -1;
    for (let slot = 0; slot < this.count; slot++) this.top = Math.max(this.top, this.levels[slot]);
  }

  /** Geometry-only fallback for a dense band; its slots are still in painter order. */
  public recompute(): number[] {
    const changed: number[] = [];
    this.compute(this.boxes, this.count, this.levels, changed);
    return changed;
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
    if (structural || changed.length > 0) this.updateTop();
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
