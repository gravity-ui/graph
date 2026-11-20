import { ELLIPSIS } from "../../text/textLayout";

import { isLineSpace, isSurrogatePair } from "./glyphCharacters";

/**
 * Font size, in pixels, the SDF glyphs are generated at. A 22-unit title at camera scale 1 and DPR 2 is about 44
 * device pixels: at 24 px each glyph was magnified about 2x, which rounded its corners and smeared thin details.
 */
export const ATLAS_FONT_PX = 48;

/** Distance field margin around a glyph, in atlas pixels: an eighth of `ATLAS_FONT_PX`, as 3 px was at 24 px. */
export const SDF_BUFFER = 6;

/** Distance field reach, in atlas pixels: a third of `ATLAS_FONT_PX`, as 8 px was at 24 px. */
export const SDF_RADIUS = 16;

/** tiny-sdf's cutoff: it encodes the edge it finds at 1 - cutoff of the byte range. */
export const SDF_CUTOFF = 0.25;

/**
 * How far the shader moves tiny-sdf's edge in, in atlas pixels. tiny-sdf reads anti-aliased alpha as gamma-encoded,
 * so its edge passes where a pixel is about 22% covered, not 50%: about 0.28 px outside the outline on a straight
 * edge. Canvas 2D text is itself heavier than its outline, by an amount that depends on size and colour: moving the
 * edge in by the full 0.28 px made WebGL text 4–10% lighter than Canvas 2D's, and not moving it left dark bold titles
 * up to 8% heavier. 0.06 px keeps the ink of dark text on light and light text on dark within about 7% of Canvas 2D's
 * at camera scales 0.5–2 (Chromium, macOS, DPR 2).
 */
const SDF_EDGE_OUTSET = 0.06;

/** The distance field value the glyph shader puts the outline at: tiny-sdf's edge, moved in by `SDF_EDGE_OUTSET`. */
export const SDF_EDGE = 1 - SDF_CUTOFF + SDF_EDGE_OUTSET / SDF_RADIUS;

/**
 * Atlas side, in texels (r8: 4 MB). 48 px glyphs take about 4 times the texels of 24 px ones: Latin, digits, ASCII
 * punctuation and Cyrillic take about 400 rows of 2048 per font and weight, while two of them already filled 740 of
 * 1024 rows and three overflowed it. 2048 is also the least `MAX_TEXTURE_SIZE` WebGL2 guarantees.
 */
const DEFAULT_ATLAS_SIZE = 2048;

/** Gap between packed glyphs, in atlas pixels. */
const PADDING = 1;

export type TGeneratedGlyph = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  glyphLeft: number;
  glyphTop: number;
  glyphWidth: number;
  glyphHeight: number;
  glyphAdvance: number;
};

/** tiny-sdf's `draw()` plus the family and weight it draws with. */
export type TGlyphGenerator = (char: string, family: string, weight: string) => TGeneratedGlyph;

/** A packed glyph; lengths in atlas pixels, the quad relative to the pen on the baseline. */
export type TAtlasGlyph = {
  /** The glyph's place in the atlas's packing order (`GlyphAtlas.glyphAt`). */
  index: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  left: number;
  top: number;
  width: number;
  height: number;
  advance: number;
};

/** Single-channel SDF atlas; glyphs are generated on first use and packed on shelves. */
export class GlyphAtlas {
  public readonly data: Uint8Array;

  /** The glyphs per font (`family|weight`), per character. */
  private readonly fonts = new Map<string, Map<string, TAtlasGlyph>>();
  /** The last font asked for and its glyphs: a text's lookups build no key. */
  private lastFamily = "";
  private lastWeight = "";
  private lastGlyphs: Map<string, TAtlasGlyph> | undefined;
  /** The glyphs in packing order: `TAtlasGlyph.index` is the place in it. */
  private readonly packed: TAtlasGlyph[] = [];
  private cursorX = 0;
  private cursorY = 0;
  private rowHeight = 0;
  /** The rows [dirtyTop, dirtyBottom) written since the last `takeDirtyRows`; none while dirtyBottom is 0. */
  private dirtyTop = Infinity;
  private dirtyBottom = 0;

  constructor(
    private readonly generate: TGlyphGenerator,
    public readonly size = DEFAULT_ATLAS_SIZE
  ) {
    this.data = new Uint8Array(size * size);
  }

  public glyph(char: string, family: string, weight: string): TAtlasGlyph {
    if (family !== this.lastFamily || weight !== this.lastWeight || !this.lastGlyphs) {
      const key = `${family}|${weight}`;
      let glyphs = this.fonts.get(key);
      if (!glyphs) {
        glyphs = new Map();
        this.fonts.set(key, glyphs);
      }
      this.lastFamily = family;
      this.lastWeight = weight;
      this.lastGlyphs = glyphs;
    }
    const known = this.lastGlyphs.get(char);
    if (known) return known;
    const generated = this.generate(char, family, weight);
    const glyph = this.pack(generated);
    this.lastGlyphs.set(char, glyph);
    this.packed.push(glyph);
    return glyph;
  }

  /** The glyph packed `index`-th (`TAtlasGlyph.index`). */
  public glyphAt(index: number): TAtlasGlyph {
    return this.packed[index];
  }

  /**
   * Packs the glyph of every character `text` can draw in the font, and the ellipsis: each code point, and both
   * halves of a surrogate pair too (a pair can draw as two lone halves, `glyphCapacity`). A camera-aware text whose
   * line breaks change then shows no glyph the atlas lacks, so a break change never uploads the atlas. It keeps
   * nothing but the glyphs: each character costs one lookup in the font's glyphs.
   */
  public prefill(text: string, family: string, weight: string): void {
    for (let index = 0; index < text.length; index++) {
      if (isLineSpace(text.charCodeAt(index))) continue;
      if (isSurrogatePair(text, index)) {
        this.glyph(text.slice(index, index + 2), family, weight);
        this.glyph(text.charAt(index), family, weight);
        this.glyph(text.charAt(index + 1), family, weight);
        index++;
      } else {
        this.glyph(text.charAt(index), family, weight);
      }
    }
    this.glyph(ELLIPSIS, family, weight);
  }

  /**
   * The rows [from, to) of `data` written since the last call, or null: an upload of them alone costs the shelves new
   * glyphs went to, not the whole atlas.
   */
  public takeDirtyRows(): [number, number] | null {
    if (this.dirtyBottom === 0) return null;
    const range: [number, number] = [this.dirtyTop, this.dirtyBottom];
    this.dirtyTop = Infinity;
    this.dirtyBottom = 0;
    return range;
  }

  private pack(generated: TGeneratedGlyph): TAtlasGlyph {
    const { width, height, data } = generated;
    const { size } = this;
    if (width > size || height > size) throw new RangeError("A glyph is larger than the glyph atlas");
    if (this.cursorX + width > size) {
      this.cursorX = 0;
      this.cursorY += this.rowHeight + PADDING;
      this.rowHeight = 0;
    }
    if (this.cursorY + height > size) throw new RangeError("The glyph atlas is full");
    const x = this.cursorX;
    const y = this.cursorY;
    for (let row = 0; row < height; row++) {
      this.data.set(data.subarray(row * width, (row + 1) * width), (y + row) * size + x);
    }
    this.cursorX += width + PADDING;
    this.rowHeight = Math.max(this.rowHeight, height);
    if (height > 0) {
      this.dirtyTop = Math.min(this.dirtyTop, y);
      this.dirtyBottom = Math.max(this.dirtyBottom, y + height);
    }
    return {
      index: this.packed.length,
      u0: x / size,
      v0: y / size,
      u1: (x + width) / size,
      v1: (y + height) / size,
      left: generated.glyphLeft - SDF_BUFFER,
      top: -generated.glyphTop - SDF_BUFFER,
      width,
      height,
      advance: generated.glyphAdvance,
    };
  }
}
