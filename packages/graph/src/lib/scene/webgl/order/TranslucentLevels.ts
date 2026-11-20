import type { TTileRect } from "../../../culling/TileIndex";

import { OverlapGrid } from "./OverlapGrid";
import type { TBox, TCompareSlots } from "./OverlapGrid";
import { DEPTH_INDICES, SCENE_DEPTH } from "./depth";

/** Larger membership edits rebuild directly instead of seeding many overlapping local repairs. */
const MAX_LOCAL_EDITS = 64;

function sameBounds(a: TTileRect | undefined, b: TTileRect | undefined): boolean {
  if (!a || !b) return a === b;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
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

  /** Contains both old and new painter levels when only geometry changed. */
  public changedLevelRange?: readonly [number, number];

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
    this.changedLevelRange = undefined;
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
    const previousBox: TBox | undefined = this.moves.size === 1 ? [0, 0, 0, 0] : undefined;
    for (const id of this.moves) {
      const at = this.indexOf.get(id);
      if (!at) continue;
      const { band, slot } = at;
      if (!band.grid.writeBox(slot, this.readBox(id, elementOf), previousBox)) continue;
      let slots = moved.get(band);
      if (!slots) moved.set(band, (slots = []));
      slots.push(slot);
    }
    this.moves.clear();
    const changedIds: string[] = [];
    let first = Infinity,
      last = -Infinity;
    for (const [band, slots] of moved) {
      const { grid } = band;
      first = Math.min(first, band.orderBase);
      last = Math.max(last, band.orderBase + band.size - 1);
      let changed = grid.move(slots, band.sparse ? this.compareSlots(band, keyOf) : undefined, previousBox);
      if (!changed && !band.sparse) changed = grid.recompute();
      if (changed === undefined) {
        const before = new Map<string, number | undefined>();
        this.rebuildBand(band, before, keyOf, elementOf);
        for (const [id, level] of before) if (level !== this.orderLevelOf(id)) changedIds.push(id);
      } else {
        for (const slot of changed) changedIds.push(band.slots[slot] as string);
      }
    }
    return this.publish(changedIds, [first, last]);
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

  private publish(changedIds: string[], range?: readonly [number, number]): boolean {
    if (changedIds.length === 0) return false;
    this.changedIds = changedIds;
    this.changedLevelRange = range;
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
