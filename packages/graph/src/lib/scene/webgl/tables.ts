import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import { parseColorAlpha } from "../colorAlpha";
import { styleDim, styleOpacity } from "../style";
import type { TScenePartStyle, TSceneStyle } from "../types";

export const TABLE_WIDTH = 1024;
export const PART_SLOTS = 16;
/** The first dim texel of a style row: texels `DIM_TEXEL + slot` hold the dim of each part slot in r. */
export const DIM_TEXEL = 2 * PART_SLOTS;
/** Texels of a style row: the override of every part slot, then its base colour, then its dim. */
export const STYLE_ROW_TEXELS = 3 * PART_SLOTS;

/** The alpha of a texel without a colour: an override that keeps the paint, a base that paints nothing. */
const NO_COLOR_ALPHA = -1;
/** The alpha of a slot whose part is hidden by `visible: false`: below it the shader culls the primitive. */
export const HIDDEN_ALPHA = -2;
/** The instance alpha of a paint that the primitive leaves unset: the shader takes the base colour of its part. */
export const USE_BASE_ALPHA = -3;

let lastOriginRevision = 0;

/** One texel per element: (originX, originY, elementKey or -1 when hidden, styleId). */
export class ElementTable {
  public data = new Float32Array(TABLE_WIDTH * 4);

  private slots = new Map<string, number>();
  private freeSlots: number[] = [];
  private used = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private originChanges = ++lastOriginRevision;

  public get rows(): number {
    return Math.ceil(this.used / TABLE_WIDTH);
  }

  /** Changes with the stored origins or when the table is replaced. */
  public get originRevision(): number {
    return this.originChanges;
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
    x = Math.fround(x);
    y = Math.fround(y);
    if (!Object.is(this.data[at], x) || !Object.is(this.data[at + 1], y)) {
      this.originChanges = ++lastOriginRevision;
    }
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
    // Reserve CPU space geometrically. The texture still uses the logical row count.
    const grown = new Float32Array(Math.max(needed, this.data.length * 2));
    grown.set(this.data);
    this.data = grown;
  }
}

/** Writes an opaque colour at `at`; a translucent one is baked into the primitive by the encoder instead. */
function writeOpaque(data: Float32Array, at: number, paint: Readonly<TScenePartStyle>): void {
  if (paint.color !== undefined && parseColorAlpha(paint.color) >= 1) data.set(colorFloats(paint.color), at);
}

/**
 * One row per style id, `STYLE_ROW_TEXELS` texels (r, g, b, a) per row:
 * - texels 0..15 override the paint of a part slot (a = -1: no override, -2: the part is hidden);
 * - texels 16..31 are the base colour that fills an unset paint of the slot (a = -1: none, the paint draws nothing);
 * - texels 32..47 hold the effective dim of the slot in r (`styleDim`): slot 0 ("none") and every part the row does
 *   not name hold the element's `dim`, so a slot registered after the row was written reads the right value.
 *
 * A part is hidden by its effective visibility: the override's `visible`, else the base's. Translucent colours are not
 * in the table: `bakeElementStyle` puts them into the primitive, which then lands in the translucent pass. Neither is
 * the override colour of a part whose effective opacity (`styleOpacity`) is below 1: the encoder bakes it, faded.
 */
export class StyleTable {
  public data = new Float32Array(0);

  private slots = new Map<string, number>([["none", 0]]);
  private rowCount = 0;
  private dirty = false;

  public get rows(): number {
    return this.rowCount;
  }

  /** Slot 0 is "none" and is never overridden; slots 1..15 are registered on first use. */
  public slotOf(part: string | undefined): number {
    if (part === "none") throw new Error('The part name "none" is reserved for primitives without a part');
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
    const data = new Float32Array(styles.length * STYLE_ROW_TEXELS * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = NO_COLOR_ALPHA;
    styles.forEach((style, row) => {
      const rowAt = row * STYLE_ROW_TEXELS;
      const dimAt = (slot: number): number => (rowAt + DIM_TEXEL + slot) * 4;
      const elementDim = styleDim(style, undefined);
      for (let slot = 0; slot < PART_SLOTS; slot++) data.set([elementDim, 0, 0, 0], dimAt(slot));
      const parts = new Set([...Object.keys(style.parts ?? {}), ...Object.keys(style.base ?? {})]);
      for (const part of parts) {
        const override = style.parts?.[part];
        const base = style.base?.[part];
        const slot = this.slotOf(part);
        const at = (rowAt + slot) * 4;
        // A faded part's colours are baked with its opacity: an override here would paint over them.
        if (override && styleOpacity(style, part) >= 1) writeOpaque(data, at, override);
        if (base) writeOpaque(data, (rowAt + PART_SLOTS + slot) * 4, base);
        // An effectively invisible part hides the whole primitive that has it: the shaders cull it.
        if ((override?.visible ?? base?.visible) === false) data[at + 3] = HIDDEN_ALPHA;
        data[dimAt(slot)] = styleDim(style, part);
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
