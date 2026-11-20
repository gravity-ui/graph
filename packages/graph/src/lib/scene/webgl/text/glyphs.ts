import type { ISceneTextMetrics } from "../../text/textLayout";
import { TEXT_METRICS_PX, isLinearText, pitchRatio, rawWidthOf, verticalShare } from "../../text/textLayout";
import { horizontalShare } from "../../text/textPlacement";
import type { TScenePrimitive } from "../../types";

import { ATLAS_FONT_PX } from "./GlyphAtlas";
import type { GlyphAtlas, TAtlasGlyph } from "./GlyphAtlas";

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
