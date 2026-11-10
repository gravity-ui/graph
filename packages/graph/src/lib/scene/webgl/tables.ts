import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import type { TSceneStyle } from "../types";

export const TABLE_WIDTH = 1024;
export const PART_SLOTS = 8;

const NO_OVERRIDE_ALPHA = -1;
/** The alpha of a slot whose part is hidden by `visible: false`: below it the shader culls the primitive. */
export const HIDDEN_ALPHA = -2;

/** One texel per element: (originX, originY, elementKey or -1 when hidden, styleId). */
export class ElementTable {
  public data = new Float32Array(TABLE_WIDTH * 4);

  private slots = new Map<string, number>();
  private freeSlots: number[] = [];
  private used = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;

  public get rows(): number {
    return Math.ceil(this.used / TABLE_WIDTH);
  }

  public indexOf(id: string): number {
    const known = this.slots.get(id);
    if (known !== undefined) return known;
    const index = this.freeSlots.pop() ?? this.used++;
    this.slots.set(id, index);
    this.ensureCapacity(index);
    return index;
  }

  public write(id: string, x: number, y: number, key: number, hidden: boolean, styleId: number): void {
    const index = this.indexOf(id);
    this.put(index, x, y, hidden ? -1 : key, styleId);
  }

  public free(id: string): void {
    const index = this.slots.get(id);
    if (index === undefined) return;
    this.slots.delete(id);
    this.put(index, 0, 0, -1, 0);
    this.freeSlots.push(index);
  }

  /** The rows [from, to) changed since the last call, or null. */
  public takeDirtyRows(): [number, number] | null {
    if (this.dirtyMax < 0) return null;
    const range: [number, number] = [this.dirtyMin, this.dirtyMax + 1];
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    return range;
  }

  private put(index: number, x: number, y: number, key: number, styleId: number): void {
    const at = index * 4;
    this.data[at] = x;
    this.data[at + 1] = y;
    this.data[at + 2] = key;
    this.data[at + 3] = styleId;
    const row = Math.floor(index / TABLE_WIDTH);
    this.dirtyMin = Math.min(this.dirtyMin, row);
    this.dirtyMax = Math.max(this.dirtyMax, row);
  }

  private ensureCapacity(index: number): void {
    const needed = (Math.floor(index / TABLE_WIDTH) + 1) * TABLE_WIDTH * 4;
    if (needed <= this.data.length) return;
    const grown = new Float32Array(needed);
    grown.set(this.data);
    this.data = grown;
  }
}

/** One row per style id, one texel per part slot (r, g, b, a); a = -1 means no override. */
export class StyleTable {
  public data = new Float32Array(0);

  private slots = new Map<string, number>([["none", 0]]);
  private rowCount = 0;
  private dirty = false;

  public get rows(): number {
    return this.rowCount;
  }

  /** Slot 0 is "none" and is never overridden; slots 1..7 are registered on first use. */
  public slotOf(part: string | undefined): number {
    if (part === undefined) return 0;
    const known = this.slots.get(part);
    if (known !== undefined) return known;
    if (this.slots.size >= PART_SLOTS) {
      throw new Error(`Scene styles support at most ${PART_SLOTS - 1} distinct parts`);
    }
    const slot = this.slots.size;
    this.slots.set(part, slot);
    return slot;
  }

  public setStyles(styles: readonly TSceneStyle[]): void {
    const data = new Float32Array(styles.length * PART_SLOTS * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = NO_OVERRIDE_ALPHA;
    styles.forEach((style, row) => {
      for (const [part, paint] of Object.entries(style)) {
        const at = (row * PART_SLOTS + this.slotOf(part)) * 4;
        if (paint.color !== undefined) data.set(colorFloats(paint.color), at);
        // visible: false hides the whole primitive that has this part: the shaders cull it.
        if (paint.visible === false) data[at + 3] = HIDDEN_ALPHA;
      }
    });
    this.data = data;
    this.rowCount = styles.length;
    this.dirty = true;
  }

  public takeDirty(): boolean {
    const was = this.dirty;
    this.dirty = false;
    return was;
  }
}
