import type { TConnectionId } from "@gravity-ui/graph";
import RBush from "rbush";

import { TCubic, cubicApproxLength, cubicBounds } from "./geometry";
import { FLAG_ARROW, FLAG_FOCUS, FLAG_HIDDEN, FLAG_OVERLAY, INSTANCE_FLOATS } from "./shaders";

/** What to draw for one connection: its segments (one for a regular connection, more for multipoint). */
export type TConnectionDraw = {
  segments: TCubic[];
  style: number;
  hidden: boolean;
  /** Drawn whole and with the arrow at any zoom (selected/hovered, or an endpoint block is selected). */
  focus: boolean;
  /** Drawn in the overlay pass, on top of the other connections. */
  overlay: boolean;
  arrow: boolean;
};

export type TInstanceEntry = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: TConnectionId;
  index: number;
};

type TRange = { start: number; count: number; overlay: boolean };

/**
 * CPU side of the instance buffer: a packed Float32Array (see INSTANCE_FLOATS), the slot range of every
 * connection, and an R-tree of segment bounds for hit testing. Knows nothing about WebGL.
 */
export class ConnectionInstances {
  public data = new Float32Array(0);

  public count = 0;

  /** Instance range changed since the last `takeDirtyRange()`, or undefined. */
  private dirtyFrom = Infinity;

  private dirtyTo = -Infinity;

  private ranges = new Map<TConnectionId, TRange>();

  private entries: Array<TInstanceEntry | undefined> = [];

  private readonly tree = new RBush<TInstanceEntry>();

  private overlayIds = new Set<TConnectionId>();

  private overlayDirty = true;

  private overlayData = new Float32Array(0);

  private overlayCount = 0;

  /** Rebuilds everything from scratch, keeping the given order. */
  public rebuild(items: Iterable<[TConnectionId, TConnectionDraw]>): void {
    const list = Array.from(items);
    const total = list.reduce((sum, [, draw]) => sum + Math.max(1, draw.segments.length), 0);
    if (this.data.length < total * INSTANCE_FLOATS) {
      this.data = new Float32Array(Math.ceil(total * 1.25) * INSTANCE_FLOATS);
    }
    this.count = total;
    this.ranges = new Map();
    this.entries = new Array(total);
    this.overlayIds = new Set();
    this.tree.clear();

    let start = 0;
    const loaded: TInstanceEntry[] = [];
    for (const [id, draw] of list) {
      const count = Math.max(1, draw.segments.length);
      this.ranges.set(id, { start, count, overlay: draw.overlay });
      this.write(id, start, count, draw, loaded);
      start += count;
    }
    this.tree.load(loaded);
    this.overlayDirty = true;
    this.dirtyFrom = 0;
    this.dirtyTo = total;
  }

  /**
   * Updates one connection in place. Returns false when its segment count changed or it is unknown,
   * in which case the caller has to `rebuild()`.
   */
  public update(id: TConnectionId, draw: TConnectionDraw): boolean {
    const range = this.ranges.get(id);
    if (!range || range.count !== Math.max(1, draw.segments.length)) return false;
    for (let i = range.start; i < range.start + range.count; i++) {
      const entry = this.entries[i];
      if (entry) this.tree.remove(entry);
    }
    const inserted: TInstanceEntry[] = [];
    this.write(id, range.start, range.count, draw, inserted);
    for (const entry of inserted) this.tree.insert(entry);
    if (range.overlay || draw.overlay) this.overlayDirty = true;
    range.overlay = draw.overlay;
    this.dirtyFrom = Math.min(this.dirtyFrom, range.start);
    this.dirtyTo = Math.max(this.dirtyTo, range.start + range.count);
    return true;
  }

  private write(id: TConnectionId, start: number, count: number, draw: TConnectionDraw, out: TInstanceEntry[]): void {
    let dashOffset = 0;
    for (let i = 0; i < count; i++) {
      const index = start + i;
      const base = index * INSTANCE_FLOATS;
      const segment = draw.segments[i];
      const hidden = draw.hidden || !segment;
      const flags =
        (hidden ? FLAG_HIDDEN : 0) +
        (draw.focus ? FLAG_FOCUS : 0) +
        (draw.arrow && count === 1 ? FLAG_ARROW : 0) +
        (draw.overlay ? FLAG_OVERLAY : 0);
      if (segment) {
        const [p0, c1, c2, p3] = segment;
        const length = cubicApproxLength(segment);
        this.data.set([p0.x, p0.y, c1.x, c1.y, c2.x, c2.y, p3.x, p3.y, draw.style, flags, dashOffset, length], base);
        dashOffset += length;
      } else {
        this.data.fill(0, base, base + INSTANCE_FLOATS);
        this.data[base + 9] = flags;
      }
      if (hidden || !segment) {
        this.entries[index] = undefined;
        continue;
      }
      const [minX, minY, maxX, maxY] = cubicBounds(segment);
      const entry = { minX, minY, maxX, maxY, id, index };
      this.entries[index] = entry;
      out.push(entry);
    }
    if (draw.overlay && !draw.hidden) this.overlayIds.add(id);
    else this.overlayIds.delete(id);
  }

  /** Instance range to re-upload, then resets it. */
  public takeDirtyRange(): [from: number, to: number] | undefined {
    if (this.dirtyTo <= this.dirtyFrom) return undefined;
    const range: [number, number] = [this.dirtyFrom, Math.min(this.dirtyTo, this.count)];
    this.dirtyFrom = Infinity;
    this.dirtyTo = -Infinity;
    return range;
  }

  /** Copies of the overlay connections' instances, rebuilt only when something in the overlay changed. */
  public takeOverlay(): { data: Float32Array; count: number } | undefined {
    if (!this.overlayDirty) return undefined;
    this.overlayDirty = false;
    let count = 0;
    for (const id of this.overlayIds) count += this.ranges.get(id)?.count ?? 0;
    if (this.overlayData.length < count * INSTANCE_FLOATS) {
      this.overlayData = new Float32Array(Math.max(count, 16) * INSTANCE_FLOATS);
    }
    let offset = 0;
    for (const id of this.overlayIds) {
      const range = this.ranges.get(id);
      if (!range) continue;
      const from = range.start * INSTANCE_FLOATS;
      const size = range.count * INSTANCE_FLOATS;
      this.overlayData.set(this.data.subarray(from, from + size), offset);
      offset += size;
    }
    this.overlayCount = count;
    return { data: this.overlayData, count: this.overlayCount };
  }

  public search(minX: number, minY: number, maxX: number, maxY: number): TInstanceEntry[] {
    return this.tree.search({ minX, minY, maxX, maxY });
  }

  /** Union of visible segment bounds, or undefined when nothing is visible. */
  public getBounds(): [minX: number, minY: number, maxX: number, maxY: number] | undefined {
    const root = this.tree.toJSON() as { minX: number; minY: number; maxX: number; maxY: number; children: unknown[] };
    if (!root.children.length) return undefined;
    return [root.minX, root.minY, root.maxX, root.maxY];
  }

  public getSegment(index: number): TCubic {
    const base = index * INSTANCE_FLOATS;
    const d = this.data;
    return [
      { x: d[base], y: d[base + 1] },
      { x: d[base + 2], y: d[base + 3] },
      { x: d[base + 4], y: d[base + 5] },
      { x: d[base + 6], y: d[base + 7] },
    ];
  }

  public getStyle(index: number): number {
    return this.data[index * INSTANCE_FLOATS + 8];
  }

  public isFocused(index: number): boolean {
    // focus is bit 1 of the flags float; floor/modulo keeps the lint rule against bitwise operators
    return Math.floor(this.data[index * INSTANCE_FLOATS + 9] / FLAG_FOCUS) % 2 === 1;
  }

  public isOverlay(id: TConnectionId): boolean {
    return this.overlayIds.has(id);
  }

  public has(id: TConnectionId): boolean {
    return this.ranges.has(id);
  }
}
