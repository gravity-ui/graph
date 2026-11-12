// packages/graph/src/lib/scene/webgl/depth.ts
export const SCENE_DEPTH = { BAND_BITS: 4, RANK_BITS: 14, SUB_BITS: 5 } as const;

const MAX_BANDS = 2 ** SCENE_DEPTH.BAND_BITS;
const MAX_RANK = 2 ** SCENE_DEPTH.RANK_BITS;
const SUBS = 2 ** SCENE_DEPTH.SUB_BITS;
const KEYS = 2 ** (SCENE_DEPTH.BAND_BITS + SCENE_DEPTH.RANK_BITS + SCENE_DEPTH.SUB_BITS);

/** Depth in [0, 1): larger is nearer. Draw with depthFunc GREATER and clearDepth 0. */
export function depthOf(elementKey: number, sub: number): number {
  return (elementKey * SUBS + sub + 1) / (KEYS + 1);
}

type TEntry = { id: string; order: number };

/** Dense (band, rank) keys for scene elements; reports elements whose key changed. */
export class SceneDepth {
  private bands = new Map<number, TEntry[]>();
  private zIndexOf = new Map<string, number>();
  private keys = new Map<string, number>();
  private changed = new Set<string>();
  /** Elements whose own zIndex or order was set since `takeSet`. */
  private readonly own = new Set<string>();
  private dirty = false;

  public set(id: string, zIndex: number, order: number): void {
    const previous = this.zIndexOf.get(id);
    this.assertFits(zIndex, previous);
    if (previous !== undefined) this.removeFrom(previous, id);
    const list = this.bands.get(zIndex) ?? [];
    const at = upperBound(list, order);
    list.splice(at, 0, { id, order });
    this.bands.set(zIndex, list);
    this.zIndexOf.set(id, zIndex);
    this.own.add(id);
    this.dirty = true;
  }

  public delete(id: string): void {
    const zIndex = this.zIndexOf.get(id);
    if (zIndex === undefined) return;
    this.removeFrom(zIndex, id);
    this.zIndexOf.delete(id);
    this.keys.delete(id);
    this.changed.delete(id);
    this.own.delete(id);
    this.dirty = true;
  }

  public keyOf(id: string): number {
    this.renumberIfDirty();
    const key = this.keys.get(id);
    if (key === undefined) throw new Error(`Scene depth has no element ${id}`);
    return key;
  }

  public takeChanged(): string[] {
    this.renumberIfDirty();
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

  /** Throws before anything is modified, so a failing set leaves the element where it was. */
  private assertFits(zIndex: number, previous: number | undefined): void {
    const target = this.bands.get(zIndex);
    if (!target) {
      const freesBand = previous !== undefined && this.bands.get(previous)?.length === 1;
      if (this.bands.size - (freesBand ? 1 : 0) >= MAX_BANDS) {
        throw new RangeError(`Scene depth supports at most ${MAX_BANDS} zIndex bands`);
      }
      return;
    }
    const length = previous === zIndex ? target.length - 1 : target.length;
    if (length >= MAX_RANK) throw new RangeError(`zIndex band ${zIndex} exceeds ${MAX_RANK} elements`);
  }

  private removeFrom(zIndex: number, id: string): void {
    const list = this.bands.get(zIndex);
    if (!list) return;
    const at = list.findIndex((entry) => entry.id === id);
    if (at >= 0) list.splice(at, 1);
    if (list.length === 0) this.bands.delete(zIndex);
  }

  private renumberIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const zIndexes = [...this.bands.keys()].sort((a, b) => a - b);
    zIndexes.forEach((zIndex, band) => {
      this.bands.get(zIndex)?.forEach((entry, rank) => {
        const key = band * MAX_RANK + rank;
        if (this.keys.get(entry.id) !== key) {
          this.keys.set(entry.id, key);
          this.changed.add(entry.id);
        }
      });
    });
  }
}

function upperBound(list: readonly TEntry[], order: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (list[mid].order <= order) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
