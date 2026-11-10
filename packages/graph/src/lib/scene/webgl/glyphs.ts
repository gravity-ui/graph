import { resolveSceneSize } from "../size";
import type { TScenePrimitive } from "../types";

/** Font size, in pixels, the SDF glyphs are generated at. */
export const ATLAS_FONT_PX = 24;
/** Distance field margin around a glyph, in atlas pixels. */
export const SDF_BUFFER = 3;
/** Distance field reach, in atlas pixels. */
export const SDF_RADIUS = 8;

const DEFAULT_ATLAS_SIZE = 1024;

/** Gap between packed glyphs, in atlas pixels. */
const PADDING = 1;

/** Where the baseline lies in a line, as a share of the base size below the line's middle. Provisional. */
const BASELINE_SHIFT = 0.35;

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

export type TGlyphPlacement = {
  char: string;
  /** Quad of the glyph at the base size, relative to the text origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

/** Single-channel SDF atlas; glyphs are generated on first use and packed on shelves. */
export class GlyphAtlas {
  public readonly data: Uint8Array;

  private glyphs = new Map<string, TAtlasGlyph>();
  private cursorX = 0;
  private cursorY = 0;
  private rowHeight = 0;
  private dirty = false;

  constructor(
    private readonly generate: TGlyphGenerator,
    public readonly size = DEFAULT_ATLAS_SIZE
  ) {
    this.data = new Uint8Array(size * size);
  }

  public glyph(char: string, family: string, weight: string): TAtlasGlyph {
    const key = `${family}|${weight}|${char}`;
    const known = this.glyphs.get(key);
    if (known) return known;
    const generated = this.generate(char, family, weight);
    const glyph = this.pack(generated);
    this.glyphs.set(key, glyph);
    return glyph;
  }

  /** Whether `data` changed since the last call. */
  public takeDirty(): boolean {
    const dirty = this.dirty;
    this.dirty = false;
    return dirty;
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
    this.dirty = true;
    return {
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

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

type TLine = { chars: string[]; advances: number[]; width: number };

/** Greedy word wrap at the base size; a word wider than the box stays on its own line. */
function wrap(primitive: TTextPrimitive, atlas: GlyphAtlas, k: number): TLine[] {
  const weight = primitive.weight ?? "normal";
  const advanceOf = (char: string): number => atlas.glyph(char, primitive.family, weight).advance * k;
  const space = advanceOf(" ");
  const lines: TLine[] = [];
  for (const paragraph of primitive.text.split("\n")) {
    const line: TLine = { chars: [], advances: [], width: 0 };
    lines.push(line);
    let current = line;
    paragraph.split(" ").forEach((word, index) => {
      const chars = [...word];
      const advances = chars.map(advanceOf);
      const wordWidth = advances.reduce((sum, advance) => sum + advance, 0);
      if (index > 0 && current.chars.length > 0) {
        if (current.width + space + wordWidth > primitive.width) {
          current = { chars: [], advances: [], width: 0 };
          lines.push(current);
        } else {
          current.chars.push(" ");
          current.advances.push(space);
          current.width += space;
        }
      }
      current.chars.push(...chars);
      current.advances.push(...advances);
      current.width += wordWidth;
    });
  }
  return lines;
}

/**
 * Glyph quads of a text at its base size (size resolved at scale 1), relative to the text origin. Wraps once at the base
 * size and never on zoom (provisional). Spaces take room but yield no quad.
 */
export function layoutText(primitive: TTextPrimitive, atlas: GlyphAtlas): TGlyphPlacement[] {
  const baseSize = resolveSceneSize(primitive.size, 1);
  const k = baseSize / ATLAS_FONT_PX;
  const weight = primitive.weight ?? "normal";
  const maxLines = Math.floor((primitive.height ?? Infinity) / primitive.lineHeight);
  const placements: TGlyphPlacement[] = [];
  wrap(primitive, atlas, k)
    .slice(0, maxLines)
    .forEach((line, row) => {
      let pen = 0;
      if (primitive.align === "center") pen = (primitive.width - line.width) / 2;
      else if (primitive.align === "right" || primitive.align === "end") pen = primitive.width - line.width;
      const baseline = row * primitive.lineHeight + primitive.lineHeight / 2 + BASELINE_SHIFT * baseSize;
      line.chars.forEach((char, index) => {
        if (char !== " ") {
          const glyph = atlas.glyph(char, primitive.family, weight);
          placements.push({
            char,
            x: pen + glyph.left * k,
            y: baseline + glyph.top * k,
            w: glyph.width * k,
            h: glyph.height * k,
            u0: glyph.u0,
            v0: glyph.v0,
            u1: glyph.u1,
            v1: glyph.v1,
          });
        }
        pen += line.advances[index];
      });
    });
  return placements;
}
