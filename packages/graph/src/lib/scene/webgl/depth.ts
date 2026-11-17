// packages/graph/src/lib/scene/webgl/depth.ts
import type { TSceneChange } from "../types";

/**
 * The depth layout. Owner elements (roots) take dense keys over at most 2^BAND_BITS zIndex bands, sharing the depth
 * budget regardless of their band. Every key has 2^subBits sub-orders for the primitives of its root and of its child
 * elements; `subBits` is at least MIN_SUB_BITS and follows the root with the most primitives (`SceneDepth.subBits`).
 * keys x 2^subBits must stay within 2^INDEX_BITS depth indices, the headroom under a 24-bit depth buffer.
 */
export const SCENE_DEPTH = { BAND_BITS: 4, MIN_SUB_BITS: 5, INDEX_BITS: 23 } as const;

const MAX_BANDS = 2 ** SCENE_DEPTH.BAND_BITS;

/** The depth indices (key x 2^subBits + sub) the depth buffer tells apart. */
export const DEPTH_INDICES = 2 ** SCENE_DEPTH.INDEX_BITS;

/** The sub-order width a root needs for `count` primitives, its child elements' included: at least MIN_SUB_BITS. */
export function subBitsFor(count: number): number {
  let bits: number = SCENE_DEPTH.MIN_SUB_BITS;
  while (2 ** bits < count) bits++;
  return bits;
}

/** The widest sub-order width that `keys` depth keys leave room for: keys x 2^bits <= DEPTH_INDICES. */
export function maxSubBitsFor(keys: number): number {
  let bits: number = SCENE_DEPTH.INDEX_BITS;
  while (bits > 0 && keys * 2 ** bits > DEPTH_INDICES) bits--;
  return bits;
}

/** Depth in [0, 1): larger is nearer. Draw with depthFunc GREATER and clearDepth 0. */
export function depthOf(elementKey: number, sub: number, subBits: number = SCENE_DEPTH.MIN_SUB_BITS): number {
  return (elementKey * 2 ** subBits + sub + 1) / (DEPTH_INDICES + 1);
}

/**
 * Whether a change moves its element in the depth: an update of its zIndex (a style's raise included) or order, or an
 * update without fields (every field).
 */
export function movesInDepth(change: TSceneChange): boolean {
  const { fields } = change;
  return change.type === "update" && (!fields || fields.has("zIndex") || fields.has("order"));
}

type TEntry = { readonly id: string; readonly order: number };

/**
 * Dense keys for scene elements over all zIndex bands, by band and then by order; reports elements whose key changed.
 * `set` and `delete` only record the change; the changed bands are rebuilt and renumbered once, by the next
 * `renumber`, `keyOf` or `takeChanged`, so N changes between two frames cost one pass (review C1). Rebuilding a band
 * drops stale entries, sorts the new ones and merges them: O(n + k log k). A band is renumbered when it changed or when
 * a lower band changed its size, which moves its first key.
 *
 * It also keeps the sub-order width (`subBits`): the number of sub-orders each root needs (`setSubCount`, its
 * primitives with its child elements') sets the width once per renumber, raised or lowered to the widest root. A width
 * change moves no key: instances keep their absolute subs and the shader multiplies the key by `2^subBits`.
 */
export class SceneDepth {
  /** Entries per zIndex, sorted by order as of the last renumber. */
  private readonly bands = new Map<number, TEntry[]>();
  /** The current entry and zIndex of every element. */
  private readonly entryOf = new Map<string, TEntry>();
  private readonly zIndexOf = new Map<string, number>();
  /** Elements per zIndex now, for the capacity checks. */
  private readonly counts = new Map<number, number>();
  /** Entries set since the last renumber, by zIndex. */
  private readonly added = new Map<number, TEntry[]>();
  private readonly dirtyBands = new Set<number>();
  /** The first key of every band at the last renumber. */
  private offsets = new Map<number, number>();
  private readonly keys = new Map<string, number>();
  private readonly changed = new Set<string>();
  /** Elements whose own zIndex or order was set since `takeSet`. */
  private readonly own = new Set<string>();
  /** The sub-orders each root needs: its primitives with its child elements'. */
  private readonly subCounts = new Map<string, number>();
  /** Roots per needed width (`subBitsFor`), indexed by the width: the widest one sets `subBits`. */
  private readonly widths: number[] = [];
  /** A root's needed width changed since the last renumber. */
  private widthDirty = false;
  private width: number = SCENE_DEPTH.MIN_SUB_BITS;
  /** `maxSub` for `maxSubKeys` owners. */
  private maxSubKeys = -1;
  private maxSubValue = 0;

  /** The sub-order width of the last renumber: each key has 2^subBits sub-orders. */
  public get subBits(): number {
    return this.width;
  }

  /**
   * The largest sub a primitive can take with the owners set now: the widest width their keys leave room for. The
   * encoders check it; the renumber checks the width the roots really need.
   */
  public get maxSub(): number {
    // Every encode reads it: computed once per owner count.
    const keys = this.entryOf.size;
    if (keys !== this.maxSubKeys) {
      this.maxSubKeys = keys;
      this.maxSubValue = 2 ** maxSubBitsFor(keys) - 1;
    }
    return this.maxSubValue;
  }

  /** Records the sub-orders a root needs (its primitives with its child elements'); the next renumber sets the width. */
  public setSubCount(id: string, count: number): void {
    const before = this.subCounts.get(id);
    if (before === count) return;
    if (before !== undefined) this.countWidth(subBitsFor(before), -1);
    this.subCounts.set(id, count);
    this.countWidth(subBitsFor(count), 1);
  }

  public set(id: string, zIndex: number, order: number): void {
    const previous = this.zIndexOf.get(id);
    this.assertFits(zIndex, previous);
    if (previous !== undefined) {
      this.uncount(previous);
      this.dirtyBands.add(previous);
    }
    const entry: TEntry = { id, order };
    this.entryOf.set(id, entry);
    this.zIndexOf.set(id, zIndex);
    this.counts.set(zIndex, (this.counts.get(zIndex) ?? 0) + 1);
    const list = this.added.get(zIndex);
    if (list) list.push(entry);
    else this.added.set(zIndex, [entry]);
    this.dirtyBands.add(zIndex);
    this.own.add(id);
  }

  public delete(id: string): void {
    // A released element has no place but may still have a key.
    this.release(id);
    this.keys.delete(id);
    this.changed.delete(id);
    this.own.delete(id);
    const count = this.subCounts.get(id);
    if (count !== undefined) {
      this.subCounts.delete(id);
      this.countWidth(subBitsFor(count), -1);
    }
  }

  /**
   * Gives up the element's place in its band until its next `set`, keeping its key, so the key comparison of the next
   * renumber still sees whether it moved. A frame releases every element it moves, and deletes, before it sets any
   * (see `movesInDepth`): each state it passes through is then part of its start or of its end state, so it fits the
   * band limit whenever applying its changes one by one did (review C1).
   */
  public release(id: string): void {
    const zIndex = this.zIndexOf.get(id);
    if (zIndex === undefined) return;
    this.uncount(zIndex);
    this.entryOf.delete(id);
    this.zIndexOf.delete(id);
    this.dirtyBands.add(zIndex);
  }

  public keyOf(id: string): number {
    this.renumber();
    const key = this.keys.get(id);
    if (key === undefined) throw new Error(`Scene depth has no element ${id}`);
    return key;
  }

  /** The key of the last renumber, without renumbering; 0 for an element that has none yet. */
  public peekKey(id: string): number {
    return this.keys.get(id) ?? 0;
  }

  public takeChanged(): string[] {
    this.renumber();
    const ids = [...this.changed];
    this.changed.clear();
    return ids;
  }

  /**
   * The elements whose own zIndex or order was set since the last call. Unlike `takeChanged`, it leaves out the
   * elements whose key only moved because the dense ranks of their band were renumbered: their order relative to each
   * other did not change.
   */
  public takeSet(): string[] {
    const ids = [...this.own];
    this.own.clear();
    return ids;
  }

  /**
   * Sets the width, then rebuilds the changed bands and renumbers the keys of every band that changed or whose first
   * key moved; nothing to do without changes since the last call. Throws a RangeError when the owners times the width
   * exceed the depth indices, before any key changes.
   */
  public renumber(): void {
    if (this.dirtyBands.size === 0 && !this.widthDirty) return;
    if (this.widthDirty) {
      this.width = this.computeWidth();
      this.widthDirty = false;
    }
    this.assertCapacity();
    if (this.dirtyBands.size === 0) return;
    for (const zIndex of this.dirtyBands) this.rebuildBand(zIndex);
    const zIndexes = [...this.bands.keys()].sort((a, b) => a - b);
    const offsets = new Map<number, number>();
    let offset = 0;
    for (const zIndex of zIndexes) {
      const entries = this.bands.get(zIndex) ?? [];
      offsets.set(zIndex, offset);
      if (this.dirtyBands.has(zIndex) || this.offsets.get(zIndex) !== offset) this.renumberBand(entries, offset);
      offset += entries.length;
    }
    this.offsets = offsets;
    this.dirtyBands.clear();
  }

  private renumberBand(entries: readonly TEntry[], offset: number): void {
    entries.forEach((entry, rank) => {
      const key = offset + rank;
      if (this.keys.get(entry.id) !== key) {
        this.keys.set(entry.id, key);
        this.changed.add(entry.id);
      }
    });
  }

  private countWidth(bits: number, delta: number): void {
    this.widths[bits] = (this.widths[bits] ?? 0) + delta;
    this.widthDirty = true;
  }

  /** The widest width a root needs, at least MIN_SUB_BITS. */
  private computeWidth(): number {
    for (let bits = this.widths.length - 1; bits > SCENE_DEPTH.MIN_SUB_BITS; bits--) {
      if ((this.widths[bits] ?? 0) > 0) return bits;
    }
    return SCENE_DEPTH.MIN_SUB_BITS;
  }

  private assertCapacity(): void {
    const keys = this.entryOf.size;
    if (keys * 2 ** this.width <= DEPTH_INDICES) return;
    let widest = "";
    let most = 0;
    for (const [id, count] of this.subCounts) {
      if (count > most) {
        widest = id;
        most = count;
      }
    }
    throw new RangeError(
      `Scene depth: ${keys} owner elements x 2^${this.width} sub-orders exceed the ${DEPTH_INDICES} depth indices; ` +
        `${widest} has ${most} primitives with its child elements`
    );
  }

  private isCurrent(entry: TEntry, zIndex: number): boolean {
    return this.entryOf.get(entry.id) === entry && this.zIndexOf.get(entry.id) === zIndex;
  }

  private rebuildBand(zIndex: number): void {
    const kept = (this.bands.get(zIndex) ?? []).filter((entry) => this.isCurrent(entry, zIndex));
    const fresh = (this.added.get(zIndex) ?? []).filter((entry) => this.isCurrent(entry, zIndex));
    this.added.delete(zIndex);
    fresh.sort((a, b) => a.order - b.order);
    // Merge; at an equal order the entry set earlier stays first, as an insertion at the upper bound did.
    const merged: TEntry[] = [];
    let i = 0;
    let j = 0;
    while (i < kept.length || j < fresh.length) {
      if (j >= fresh.length || (i < kept.length && kept[i].order <= fresh[j].order)) merged.push(kept[i++]);
      else merged.push(fresh[j++]);
    }
    if (merged.length > 0) this.bands.set(zIndex, merged);
    else this.bands.delete(zIndex);
  }

  /** Throws before anything is modified, so a failing set leaves the element where it was. */
  private assertFits(zIndex: number, previous: number | undefined): void {
    if (this.counts.has(zIndex)) return;
    const freesBand = previous !== undefined && this.counts.get(previous) === 1;
    if (this.counts.size - (freesBand ? 1 : 0) >= MAX_BANDS) {
      throw new RangeError(`Scene depth supports at most ${MAX_BANDS} zIndex bands`);
    }
  }

  private uncount(zIndex: number): void {
    const count = (this.counts.get(zIndex) ?? 0) - 1;
    if (count > 0) this.counts.set(zIndex, count);
    else this.counts.delete(zIndex);
  }
}
