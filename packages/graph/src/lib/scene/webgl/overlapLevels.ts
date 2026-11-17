import type { TTileRect } from "../../culling/TileIndex";

/** The grid has at most this many cells: a larger world gets larger cells. */
const MAX_CELLS = 2 ** 18;

/** An element that covers more cells than this skips the grid: it is tested against every element instead. */
const WIDE_CELLS = 4096;

/** Elements sampled for the typical element size. */
const SIZE_SAMPLES = 64;

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

  public push(value: number): void {
    const { items } = this;
    items.push(value);
    let at = items.length - 1;
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (items[parent] <= value) break;
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
        const child = right < items.length && items[right] < items[left] ? right : left;
        if (items[child] >= last) break;
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
   * Re-levels after the boxes `moved` changed in place in the array given to `compute`. Re-evaluates the moved boxes
   * and the later boxes in their old and new cells, then, in scene order, the later boxes around every box whose level
   * changed. Returns the boxes whose level changed, or undefined when a full `compute` is needed: a box that was or
   * becomes wide.
   */
  public move(moved: readonly number[]): number[] | undefined {
    const queue = new MinQueue();
    const enqueue = (box: number): void => {
      if (this.queued[box]) return;
      this.queued[box] = 1;
      queue.push(box);
    };
    for (const box of moved) {
      if (this.ranges[box * 4] < 0) return this.abort(queue);
      this.later(box, enqueue);
      this.unfile(box);
      this.setRange(box);
      if (this.ranges[box * 4] < 0) return this.abort(queue);
      this.file(box);
      this.later(box, enqueue);
      enqueue(box);
    }
    const changed: number[] = [];
    for (let box = queue.pop(); box !== undefined; box = queue.pop()) {
      this.queued[box] = 0;
      const level = this.levelFor(box);
      if (level === this.levels[box]) continue;
      this.levels[box] = level;
      changed.push(box);
      this.raiseCells(box);
      this.later(box, enqueue);
    }
    if (changed.length > 0) {
      this.top = -1;
      for (let box = 0; box < this.count; box++) this.top = Math.max(this.top, this.levels[box]);
    }
    return changed;
  }

  private abort(queue: MinQueue): undefined {
    for (let box = queue.pop(); box !== undefined; box = queue.pop()) this.queued[box] = 0;
    return undefined;
  }

  /** 1 + the highest level of the earlier boxes that intersect `box`. */
  private levelFor(box: number): number {
    const { boxes, levels } = this;
    let best = -1;
    for (const other of this.wide) {
      if (other < box && levels[other] > best && intersects(boxes, other, box)) best = levels[other];
    }
    const at = box * 4;
    if (this.ranges[at] < 0) {
      for (let other = 0; other < box; other++) {
        if (levels[other] > best && intersects(boxes, other, box)) best = levels[other];
      }
      return best + 1;
    }
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        const c = cy * this.columns + cx;
        const bound = this.cellLevel[c];
        if (bound <= best) continue;
        // Entries are newest first. Once the best reaches the cell's bound, no entry can raise it: a stack of N boxes
        // in one cell costs O(N), not O(N^2).
        for (let entry = this.cellHead[c]; entry >= 0 && best < bound; entry = this.entryNext[entry]) {
          const other = this.entryBox[entry];
          if (other < box && levels[other] > best && intersects(boxes, other, box)) best = levels[other];
        }
      }
    }
    return best + 1;
  }

  /** Visits the later boxes that can intersect `box`: in its cells, the wide ones, or all for a wide box. */
  private later(box: number, visit: (other: number) => void): void {
    const at = box * 4;
    if (this.ranges[at] < 0) {
      for (let other = box + 1; other < this.count; other++) visit(other);
      return;
    }
    for (const other of this.wide) if (other > box) visit(other);
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        for (let entry = this.cellHead[cy * this.columns + cx]; entry >= 0; entry = this.entryNext[entry]) {
          if (this.entryBox[entry] > box) visit(this.entryBox[entry]);
        }
      }
    }
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
  private unfile(box: number): void {
    const at = box * 4;
    for (let cy = this.ranges[at + 1]; cy <= this.ranges[at + 3]; cy++) {
      for (let cx = this.ranges[at]; cx <= this.ranges[at + 2]; cx++) {
        const c = cy * this.columns + cx;
        let previous = -1;
        for (let entry = this.cellHead[c]; entry >= 0; entry = this.entryNext[entry]) {
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

/**
 * The overlap levels of the translucent elements of a scene. Scene order matters only between translucent primitives
 * that overlap, so the translucent elements are walked in scene order (the raised zIndex bucket, then the order: the
 * depth key) and each gets level 1 + the highest level of the earlier ones whose bounds intersect its own, or 0. The
 * elements of one level never overlap, so they can be drawn together.
 *
 * The backend supplies either an element's complete overlap bounds (for effects at the current scale and level), or
 * a bound that widens the element's store bounds.
 *
 * `update()` recomputes the levels only after a change that can move them. A change of the translucent set or of a
 * translucent element's depth key rebuilds them all; a translucent element that moves or changes its bounds re-levels
 * itself and the later elements around it (`OverlapGrid.move`). A pan changes nothing here.
 */
export class TranslucentLevels {
  /** The translucent elements and the bounds of their baked primitives. */
  private readonly baked = new Map<string, { bounds: TTileRect | undefined; complete: boolean }>();
  /** The translucent elements in scene order at the last rebuild, and their index in it. */
  private ordered: string[] = [];
  private indexOf = new Map<string, number>();
  /** The translucent set or a depth key changed: the next update rebuilds everything. */
  private full = false;
  /** Elements whose box changed since the last update. */
  private readonly moves = new Set<string>();
  private changes = 0;
  private readonly grid = new OverlapGrid();
  private boxes = new Float64Array(0);
  private out = new Int32Array(0);

  /** Changes whenever a level changes. */
  public get revision(): number {
    return this.changes;
  }

  /** The number of levels after the last update. */
  public get count(): number {
    return this.grid.levelCount;
  }

  /** Whether a change waits for `update()`. */
  public get pending(): boolean {
    return this.full || this.moves.size > 0;
  }

  /** The element's level after the last update; 0 for an element it does not know. */
  public levelOf(id: string): number {
    const index = this.indexOf.get(id);
    return index === undefined ? 0 : this.out[index];
  }

  /** Adds an element or updates its relative bounds. Complete bounds replace the store box. */
  public set(id: string, bounds: TTileRect | undefined, complete = false): void {
    const before = this.baked.get(id);
    if (!before) this.full = true;
    else {
      if (before.complete === complete && sameBounds(before.bounds, bounds)) return;
      this.moves.add(id);
    }
    this.baked.set(id, { bounds, complete });
  }

  /** The element has no translucent primitive any more, or left the scene. */
  public delete(id: string): void {
    if (this.baked.delete(id)) this.full = true;
  }

  /** The element's origin or store bounds changed. */
  public moved(id: string): void {
    if (this.baked.has(id)) this.moves.add(id);
  }

  /** The element's depth key changed. */
  public reordered(id: string): void {
    if (this.baked.has(id)) this.full = true;
  }

  public clear(): void {
    this.baked.clear();
    this.full = true;
    this.changes++;
  }

  /**
   * Recomputes the levels a change can move; returns whether a level changed. `keyOf` gives an element's depth key,
   * `elementOf` its origin and store bounds.
   */
  public update(keyOf: (id: string) => number, elementOf: (id: string) => TLevelElement | undefined): boolean {
    if (this.full) return this.rebuild(keyOf, elementOf);
    if (this.moves.size === 0) return false;
    const before = this.changes;
    const moved: number[] = [];
    for (const id of this.moves) {
      const index = this.indexOf.get(id);
      if (index === undefined) continue;
      this.writeBox(index, elementOf);
      moved.push(index);
    }
    this.moves.clear();
    const changed = this.grid.move(moved);
    if (changed === undefined) {
      const previous = this.out.slice(0, this.ordered.length);
      this.grid.compute(this.boxes, this.ordered.length, this.out);
      if (previous.some((level, index) => level !== this.out[index])) this.changes++;
    } else if (changed.length > 0) {
      this.changes++;
    }
    return this.changes !== before;
  }

  /** Orders the translucent elements by depth key and computes every level. */
  private rebuild(keyOf: (id: string) => number, elementOf: (id: string) => TLevelElement | undefined): boolean {
    const previousIndex = this.indexOf;
    const previous = this.out;
    const keyed = [...this.baked.keys()].map((id) => ({ id, key: keyOf(id) }));
    keyed.sort((a, b) => a.key - b.key);
    this.ordered = keyed.map((entry) => entry.id);
    this.indexOf = new Map(this.ordered.map((id, index) => [id, index]));
    const count = this.ordered.length;
    if (this.boxes.length < count * 4) this.boxes = new Float64Array(count * 8);
    this.out = new Int32Array(count);
    for (let index = 0; index < count; index++) this.writeBox(index, elementOf);
    this.grid.compute(this.boxes, count, this.out);
    this.full = false;
    this.moves.clear();
    const changed = this.ordered.some((id, index) => {
      const before = previousIndex.get(id);
      return before === undefined || previous[before] !== this.out[index];
    });
    if (changed) this.changes++;
    return changed;
  }

  /** The complete overlap box, or the store's box widened by the baked primitives, at the element's origin. */
  private writeBox(index: number, elementOf: (id: string) => TLevelElement | undefined): void {
    const id = this.ordered[index];
    const element = elementOf(id);
    const i = index * 4;
    if (!element) {
      // Not in the scene: an empty box, which intersects nothing.
      this.boxes.set([Infinity, Infinity, -Infinity, -Infinity], i);
      return;
    }
    const { x, y, bounds } = element;
    const baked = this.baked.get(id);
    const paint = baked?.bounds ?? bounds;
    const base = baked?.complete ? paint : bounds;
    this.boxes[i] = x + Math.min(base.minX, paint.minX);
    this.boxes[i + 1] = y + Math.min(base.minY, paint.minY);
    this.boxes[i + 2] = x + Math.max(base.maxX, paint.maxX);
    this.boxes[i + 3] = y + Math.max(base.maxY, paint.maxY);
  }
}
