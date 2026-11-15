import {
  ELLIPSIS,
  TEXT_METRICS_PX,
  horizontalShare,
  isLinearText,
  pitchRatio,
  rawWidthOf,
  verticalShare,
} from "../textLayout";
import type { ISceneTextMetrics } from "../textLayout";
import type { TScenePrimitive } from "../types";

/**
 * Whether a UTF-16 code unit is one that no line draws a glyph for: a space, or whitespace that a text without
 * wrapping draws as one (`layoutText`). Any other character of a text can draw one.
 */
function isLineSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}

/** Whether the code units at `index` and after it are a surrogate pair. */
function isSurrogatePair(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 0xd800 || code >= 0xdc00 || index + 1 >= text.length) return false;
  const next = text.charCodeAt(index + 1);
  return next >= 0xdc00 && next < 0xe000;
}

/**
 * Whether `text` holds a surrogate pair. Its lines can draw a pair whole at one size and as two lone halves at another
 * (`glyphCapacity`), so lines that place every unit still leave glyphs unpacked: such a text always prefills.
 */
export function hasSurrogatePair(text: string): boolean {
  for (let index = 0; index + 1 < text.length; index++) {
    if (isSurrogatePair(text, index)) return true;
  }
  return false;
}

/**
 * The glyph instances a camera-aware text keeps whatever its line breaks (`encodeText`): one per UTF-16 code unit that
 * can draw a glyph (every one but a space and the whitespace an unwrapped line draws as one), and one for the
 * ellipsis. A surrogate pair takes two: the layout splits a word too wide for its box at UTF-16 offsets, as v1 did, so
 * a pair can draw as two lone halves. Its lines never place more: they hold its characters (some maybe dropped, a pair
 * whole or in halves) and at most one "…".
 */
export function glyphCapacity(text: string): number {
  let count = 1;
  for (let index = 0; index < text.length; index++) {
    if (!isLineSpace(text.charCodeAt(index))) count++;
  }
  return count;
}

/** Font size, in pixels, the SDF glyphs are generated at. */
export const ATLAS_FONT_PX = 24;
/** Distance field margin around a glyph, in atlas pixels. */
export const SDF_BUFFER = 3;
/** Distance field reach, in atlas pixels. */
export const SDF_RADIUS = 8;

const DEFAULT_ATLAS_SIZE = 1024;

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

export type TGlyphPlacement = {
  char: string;
  /** The atlas glyph (`GlyphAtlas.glyphAt`). */
  glyph: number;
  /** Quad of the glyph at `TEXT_METRICS_PX`, relative to the text's anchor (`TGlyphLayout`). */
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
  private dirty = false;

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

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/** The glyphs of a text's lines, relative to its anchor at `TEXT_METRICS_PX`. */
export type TGlyphLayout = {
  /** The lines placed: the anchor (`textAnchor`) depends on their count. */
  lines: number;
  glyphs: TGlyphPlacement[];
};

/**
 * Glyph quads of a text's lines (the shared layout's, `textLayout.ts`) at `TEXT_METRICS_PX`, relative to the text's
 * anchor; the shader scales them about the anchor by the resolved size over `TEXT_METRICS_PX`, so between line breaks
 * the glyphs follow the size continuously. The atlas gives glyph images, bearings and advances only:
 * - each line starts where `align` puts the measured width of the complete line (its words and spaces with the
 *   kerning across each space, `spaceKerning`), as Canvas2D aligns `fillText` by its own measure of the line;
 * - each word starts at its measured place in the line (the widths of the words and spaces before it), scaled with
 *   the words' own widths so that the line spans its measured width, and its glyphs follow by their advances, scaled
 *   so that the word spans its share: the layout fits measured (kerned) words, and the isolated advances of the atlas
 *   would make a word wider;
 * - each line's baseline lies the measured distance below its top (`ISceneTextMetrics.top`), as Canvas2D draws with
 *   `textBaseline = "top"`, and line tops step by the line pitch from the block's top (`placeText`). Spaces take room
 *   but yield no quad. `size` is the resolved size the lines were laid out at: it matters only for lines whose widths
 *   do not scale linearly (`isLinearText`, `rawWidthOf`).
 */
export function layoutGlyphs(
  primitive: TTextPrimitive,
  lines: readonly string[],
  atlas: GlyphAtlas,
  metrics: ISceneTextMetrics,
  size = TEXT_METRICS_PX
): TGlyphLayout {
  const k = TEXT_METRICS_PX / ATLAS_FONT_PX;
  const glyphs: TGlyphPlacement[] = [];
  const linear = linesLinear(metrics, lines, primitive.family, primitive.weight ?? "normal");
  placeGlyphs(primitive, lines, size, linear, atlas, metrics, (char, glyph, x, y) => {
    glyphs.push({
      char,
      glyph: glyph.index,
      x,
      y,
      w: glyph.width * k,
      h: glyph.height * k,
      u0: glyph.u0,
      v0: glyph.v0,
      u1: glyph.u1,
      v1: glyph.v1,
    });
  });
  return { lines: lines.length, glyphs };
}

/**
 * Gets each placed glyph: its character, its atlas glyph and its quad's corner at `TEXT_METRICS_PX` from the anchor.
 */
type TGlyphSink = (char: string, glyph: TAtlasGlyph, x: number, y: number) => void;

/** The placement of `layoutGlyphs`, handed glyph by glyph to `emit`: `glyphRun` writes floats, allocating no object. */
function placeGlyphs(
  primitive: TTextPrimitive,
  lines: readonly string[],
  size: number,
  linear: boolean,
  atlas: GlyphAtlas,
  metrics: ISceneTextMetrics,
  emit: TGlyphSink
): void {
  const { family } = primitive;
  const weight = primitive.weight ?? "normal";
  // The atlas glyphs are drawn at ATLAS_FONT_PX: k scales them to TEXT_METRICS_PX.
  const k = TEXT_METRICS_PX / ATLAS_FONT_PX;
  const widthOf = rawWidthOf(metrics, family, weight, size, linear);
  const space = widthOf(" ");
  // Kerning with a space depends on the size only where the widths do.
  const kerning = linear ? spaceKerningCache(metrics, family, weight) : undefined;
  const pitch = pitchRatio(primitive) * TEXT_METRICS_PX;
  const top = -verticalShare(primitive.verticalAlign) * lines.length * pitch + metrics.top(family, weight);
  const share = horizontalShare(primitive.align);
  for (let row = 0; row < lines.length; row++) {
    const baseline = top + row * pitch;
    const line = lines[row];
    const words = line.split(" ");
    let parts = (words.length - 1) * space;
    for (const word of words) parts += widthOf(word);
    // The complete line measures apart from its words and spaces (kerning around spaces): it spans its own width.
    const lineWidth = parts + spaceKerning(line, widthOf, space, kerning);
    const fit = parts > 0 ? lineWidth / parts : 1;
    let start = -share * lineWidth;
    for (const word of words) {
      const measured = widthOf(word) * fit;
      let advances = 0;
      for (const char of word) advances += atlas.glyph(char, family, weight).advance * k;
      // The word's glyphs span its measured width: kerning the atlas's isolated advances do not know of.
      const stretch = advances > 0 ? measured / advances : 1;
      let pen = start;
      for (const char of word) {
        const glyph = atlas.glyph(char, family, weight);
        emit(char, glyph, pen + glyph.left * k, baseline + glyph.top * k);
        pen += glyph.advance * k * stretch;
      }
      start += measured + space * fit;
    }
  }
}

/**
 * How much the complete line measures more than its words and spaces measured apart (`placeGlyphs`), as Canvas2D
 * measures the line it aligns: the kerning of each space with the characters on both sides of it, the width of each
 * pair ("x " and " y", cached with the words) less its two characters. A font shapes across a space by pair kerning,
 * so this is the complete line's width without measuring each line (a measurement per distinct line cost 35 ms of a
 * 10,000-block mount and 0.8 MB). Characters are taken whole (a surrogate pair is one).
 */
export function spaceKerning(
  line: string,
  widthOf: (text: string) => number,
  space: number,
  cache?: TSpaceKerning
): number {
  let kerning = 0;
  for (let index = line.indexOf(" "); index !== -1; index = line.indexOf(" ", index + 1)) {
    const before = charBefore(line, index);
    if (before !== "" && before !== " ") {
      let value = cache?.before.get(before);
      if (value === undefined) {
        value = widthOf(`${before} `) - widthOf(before) - space;
        cache?.before.set(before, value);
      }
      kerning += value;
    }
    const after = charAfter(line, index);
    if (after !== "" && after !== " ") {
      let value = cache?.after.get(after);
      if (value === undefined) {
        value = widthOf(` ${after}`) - widthOf(after) - space;
        cache?.after.set(after, value);
      }
      kerning += value;
    }
  }
  return kerning;
}

/** The kerning of characters before and after a space in one font (`spaceKerning`), at `TEXT_METRICS_PX`. */
export type TSpaceKerning = { readonly before: Map<string, number>; readonly after: Map<string, number> };

/** Space kerning per metrics and font, for the metrics' generation (late web fonts drop it with the widths). */
const spaceKernings = new WeakMap<ISceneTextMetrics, { generation: number; fonts: Map<string, TSpaceKerning> }>();

/** The last font's space kerning, at hand: a run of the same font builds no key. */
let lastKerning:
  | { metrics: ISceneTextMetrics; generation: number; family: string; weight: string; kerning: TSpaceKerning }
  | undefined;

/** The space kerning of a font with linear widths in the metrics' current generation. */
function spaceKerningCache(metrics: ISceneTextMetrics, family: string, weight: string): TSpaceKerning {
  const last = lastKerning;
  if (
    last &&
    last.metrics === metrics &&
    last.generation === metrics.generation &&
    last.family === family &&
    last.weight === weight
  ) {
    return last.kerning;
  }
  let entry = spaceKernings.get(metrics);
  if (!entry || entry.generation !== metrics.generation) {
    entry = { generation: metrics.generation, fonts: new Map() };
    spaceKernings.set(metrics, entry);
  }
  const key = `${weight}\u0000${family}`;
  let kerning = entry.fonts.get(key);
  if (!kerning) {
    kerning = { before: new Map(), after: new Map() };
    entry.fonts.set(key, kerning);
  }
  lastKerning = { metrics, generation: metrics.generation, family, weight, kerning };
  return kerning;
}

/** The character before `index`, a surrogate pair whole; "" at the start. */
function charBefore(line: string, index: number): string {
  if (index === 0) return "";
  const code = line.charCodeAt(index - 1);
  return code >= 0xdc00 && code < 0xe000 && index >= 2 ? line.slice(index - 2, index) : line.charAt(index - 1);
}

/** The character after `index`, a surrogate pair whole; "" at the end. */
function charAfter(line: string, index: number): string {
  const code = line.charCodeAt(index + 1);
  return code >= 0xd800 && code < 0xdc00 ? line.slice(index + 1, index + 3) : line.charAt(index + 1);
}

/** Whether the widths of every line scale linearly in the font (`isLinearText`). */
function linesLinear(metrics: ISceneTextMetrics, lines: readonly string[], family: string, weight: string): boolean {
  for (const line of lines) {
    if (!isLinearText(metrics, line, family, weight)) return false;
  }
  return true;
}

/**
 * Floats per glyph in `TGlyphRun.glyphs`: the quad's corner x and y at `TEXT_METRICS_PX` from the anchor, and the atlas
 * glyph (`GlyphAtlas.glyphAt`), whose size and texture rect give the rest of the quad.
 */
export const GLYPH_RUN_FLOATS = 3;

/**
 * A text's glyphs at `TEXT_METRICS_PX` relative to its anchor (`layoutGlyphs` without the anchor, which depends on the
 * text's place): `GLYPH_RUN_FLOATS` floats per glyph, and the count of lines the anchor needs (`textAnchor`).
 */
export type TGlyphRun = { readonly lines: number; readonly glyphs: Float32Array };

/** The floats of the glyph run being placed, reused by every placement (`glyphRun` copies what it needs). */
let runScratch = new Float32Array(1024);
let runFloats = 0;

const writeRunGlyph: TGlyphSink = (_char, glyph, x, y) => {
  if (runFloats + GLYPH_RUN_FLOATS > runScratch.length) {
    const grown = new Float32Array(runScratch.length * 2);
    grown.set(runScratch);
    runScratch = grown;
  }
  runScratch[runFloats] = x;
  runScratch[runFloats + 1] = y;
  runScratch[runFloats + 2] = glyph.index;
  runFloats += GLYPH_RUN_FLOATS;
};

/** The memory one generation of a layout cache holds before it becomes the previous one, in floats: 16 MB. */
const LAYOUT_CACHE_FLOATS = 2 ** 22;

/**
 * What an entry costs besides its glyphs and its key, in floats (256 bytes): the Map entry, the `TGlyphRun` object,
 * the typed array with its buffer, and the key string's header. Every entry, an empty layout too, pays it.
 */
const ENTRY_FLOATS = 64;

/** The memory an entry is charged, in floats: its glyphs, its key (2 bytes a character) and `ENTRY_FLOATS`. */
function entryCost(key: string, run: TGlyphRun): number {
  return run.glyphs.length + Math.ceil(key.length / 2) + ENTRY_FLOATS;
}

/**
 * Laid-out texts by layout key, in two generations: a hit in the previous one moves the entry to the current one, and
 * when the current one would pass its budget it becomes the previous one, dropping the texts no encode asked for during
 * a whole generation. Each entry is charged its glyphs, its key and a fixed overhead (`entryCost`), so many short or
 * empty texts fill a generation too, and the cache holds about twice the budget at most while every text in use stays.
 */
export class GlyphLayoutCache {
  private current = new Map<string, TGlyphRun>();
  private previous = new Map<string, TGlyphRun>();
  private floats = 0;

  constructor(private readonly budget = LAYOUT_CACHE_FLOATS) {}

  public get(key: string): TGlyphRun | undefined {
    const known = this.current.get(key);
    if (known) return known;
    const kept = this.previous.get(key);
    if (kept) {
      this.previous.delete(key);
      this.set(key, kept);
    }
    return kept;
  }

  public set(key: string, run: TGlyphRun): void {
    const cost = entryCost(key, run);
    if (this.floats + cost > this.budget && this.current.size > 0) {
      this.previous = this.current;
      this.current = new Map();
      this.floats = 0;
    }
    this.current.set(key, run);
    this.floats += cost;
  }

  public get size(): number {
    return this.current.size + this.previous.size;
  }
}

/** The layout cache of each atlas: runs name the atlas's glyphs. */
const layoutCaches = new WeakMap<GlyphAtlas, GlyphLayoutCache>();

/**
 * Every input of `layoutGlyphs`: the font, the alignment, the pitch per unit of size and the lines (not the text's
 * place or size: the run is relative to the anchor at `TEXT_METRICS_PX`), and the size for lines whose widths do not
 * scale linearly. A text keeps its run when it moves, and a camera-aware text gets one run per set of line breaks, not
 * per scale.
 */
function runKey(primitive: TTextPrimitive, layout: TRunLayout, linear: boolean): string {
  const { family, weight = "normal", align, verticalAlign } = primitive;
  const font = `${family}\u0000${weight}\u0000${linear ? "" : layout.size}`;
  return `${font}\u0000${align}\u0000${verticalAlign}\u0000${pitchRatio(primitive)}\u0000${layout.lines.join("\n")}`;
}

/**
 * What a glyph run is placed from: a layout's lines, the size they were laid out at and whether its widths scale
 * linearly (`TTextLayout`; without `linear` the lines are checked).
 */
export type TRunLayout = { readonly lines: readonly string[]; readonly size: number; readonly linear?: boolean };

/**
 * The glyph run of a text's lines, placed once per font, alignment, pitch and lines and cached per atlas: an element
 * that is encoded again with the same lines places nothing. Late web fonts replace the backend and its atlas, and so
 * the cache.
 */
export function glyphRun(
  primitive: TTextPrimitive,
  layout: TRunLayout,
  atlas: GlyphAtlas,
  metrics: ISceneTextMetrics
): TGlyphRun {
  const { lines, size } = layout;
  let cache = layoutCaches.get(atlas);
  if (!cache) {
    cache = new GlyphLayoutCache();
    layoutCaches.set(atlas, cache);
  }
  const linear = layout.linear ?? linesLinear(metrics, lines, primitive.family, primitive.weight ?? "normal");
  const key = runKey(primitive, layout, linear);
  const known = cache.get(key);
  if (known) return known;
  runFloats = 0;
  placeGlyphs(primitive, lines, size, linear, atlas, metrics, writeRunGlyph);
  const run: TGlyphRun = { lines: lines.length, glyphs: runScratch.slice(0, runFloats) };
  cache.set(key, run);
  return run;
}
