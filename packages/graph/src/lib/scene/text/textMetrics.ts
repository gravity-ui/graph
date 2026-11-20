import type { TScenePrimitive } from "../types";

import { TEXT_METRICS_PX, isLayoutValid, layoutText } from "./textLayout";
import type { ISceneTextMetrics, TTextLayout } from "./textLayout";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/** The memory one generation of measured widths holds before it becomes the previous one, in bytes: 4 MB. */
const WIDTH_CACHE_BYTES = 2 ** 22;

/** What a measured width costs besides its key: the Map entry, the number and the key string's header. */
const ENTRY_BYTES = 64;

/** The width of a character when no 2D context measures (no DOM), as a share of the font size. */
const FALLBACK_CHAR_WIDTH = 0.6;

/** Where the alphabetic baseline lies below a line's top when the context reports no bounding boxes. */
const FALLBACK_TOP = 0.8;

/** The string whose glyph box gives the distance between the "top" and the alphabetic baselines. */
const TOP_PROBE = "H";

/** Widths of one generation: per font and size (`fontKey`), per text. */
type TWidths = Map<string, Map<string, number>>;

/** The small size a group's sample is measured at, in CSS px, against `TEXT_METRICS_PX`. */
const LINEAR_PROBE_PX = 12;

/** How far a sample's width at the small size, scaled, may lie from its width at `TEXT_METRICS_PX`: 0.1 %. */
const LINEAR_TOLERANCE = 0.001;

/**
 * Character groups whose linearity is probed separately per font (`CanvasTextMetrics.linear`): a family can draw one
 * group from its own glyphs and another from a fallback font (emoji, CJK) that scales differently. Characters of other
 * scripts form one group per 256 code points (`OTHER_GROUPS` on), probed with the characters seen.
 */
const GROUP_LATIN = 0;
const GROUP_PUNCTUATION = 1;
const GROUP_GREEK = 2;
const GROUP_CYRILLIC = 3;
const GROUP_CJK = 4;
const GROUP_SYMBOLS = 5;
const GROUP_EMOJI = 6;
const OTHER_GROUPS = 16;

/** The sample each named group is probed with: its characters, with spaces. */
const GROUP_SAMPLES: readonly string[] = [
  "Load the daily partitions of the warehouse 0123456789",
  "– — ‘ ’ “ ” „ … • ‰ ‹ › € ₽ № ™ ℃ ⅓ ⅔ ⁰ ⁴",
  "Φόρτωση των ημερήσιων κατατμήσεων της αποθήκης ΑΒΓΔ",
  "Загрузка ежедневных разделов хранилища ЁЖЩЮЯ ёжщюя",
  "加载仓库的每日分区数据 データを読み込む 데이터 로드",
  "← → ↑ ↓ ⇒ ∑ ∞ ≈ ≠ ≤ ≥ ─ │ ┼ █ ░ ■ □ ▲ ▼ ● ○ ◆",
  "😀 🚀 🔥 👍 🎉 📦 ✅ ⭐ ⚡ ❌ ☕ ⌛",
];

/**
 * The shortest sample of an `OTHER_GROUPS` group: its characters repeated, so the widths are long enough to compare.
 */
const OTHER_SAMPLE_LENGTH = 48;

/** The groups of code point ranges past Latin, `[from, to)`, the first match wins. */
const GROUP_RANGES: readonly (readonly [number, number, number])[] = [
  [0x370, 0x400, GROUP_GREEK],
  [0x400, 0x530, GROUP_CYRILLIC],
  [0x1c80, 0x1c90, GROUP_CYRILLIC],
  [0x1e00, 0x1f00, GROUP_LATIN],
  [0x1f00, 0x2000, GROUP_GREEK],
  [0x2000, 0x2190, GROUP_PUNCTUATION],
  [0x2190, 0x2300, GROUP_SYMBOLS],
  [0x2300, 0x2400, GROUP_EMOJI],
  [0x25fd, 0x25ff, GROUP_EMOJI],
  [0x2400, 0x2600, GROUP_SYMBOLS],
  [0x2600, 0x27c0, GROUP_EMOJI],
  [0x2b00, 0x2c00, GROUP_EMOJI],
  [0x2de0, 0x2e00, GROUP_CYRILLIC],
  [0xa640, 0xa6a0, GROUP_CYRILLIC],
  [0x2e80, 0xa000, GROUP_CJK],
  [0xac00, 0xd7b0, GROUP_CJK],
  [0xf900, 0xfb00, GROUP_CJK],
  [0xff00, 0xfff0, GROUP_CJK],
  [0xfe00, 0xfe10, GROUP_EMOJI],
  [0x1f000, 0x1fc00, GROUP_EMOJI],
  [0x20000, 0x40000, GROUP_CJK],
];

/**
 * The linearity group of a code point. Latin (with Latin-1, the extensions, IPA and combining marks), punctuation
 * (general punctuation, super- and subscripts, currency, letterlike symbols, number forms), Greek, Cyrillic, CJK (with
 * kana and Hangul), symbols (arrows, mathematical operators, box drawing, geometric shapes) and emoji (the
 * miscellaneous symbols, dingbats and technical blocks, where emoji presentation is common, the emoji planes and the
 * variation selectors); any other code point in its block of 256.
 */
function groupOf(code: number): number {
  if (code < 0x370) return GROUP_LATIN;
  for (const [from, to, group] of GROUP_RANGES) {
    if (code >= from && code < to) return group;
  }
  return OTHER_GROUPS + Math.floor(code / 256);
}

/** The probed groups of one font: Latin at hand, the others by group. */
type TFontGroups = { latin: boolean | undefined; groups: Map<number, boolean> };

/** The sample of an `OTHER_GROUPS` group: the characters of `text` in it, repeated to `OTHER_SAMPLE_LENGTH`. */
function otherSample(text: string, group: number): string {
  let chars = "";
  for (const char of text) {
    if (groupOf(char.codePointAt(0) ?? 0) === group) chars += char;
  }
  if (chars === "") return text;
  let sample = chars;
  while (sample.length < OTHER_SAMPLE_LENGTH) sample += chars;
  return sample;
}

/**
 * Text widths and vertical metrics measured with a 2D canvas context, the one metrics authority of scene text:
 * Canvas2D, WebGL and exports lay text out from it, so their line breaks agree.
 * - A text whose widths scale linearly with its size (`linear`) is measured once at `TEXT_METRICS_PX`, and layouts
 *   scale its widths. Linearity is probed per font and character group, lazily: a font with optical sizing (macOS
 *   `system-ui`, variable fonts with an `opsz` axis), or a group the font draws from a fallback that scales differently
 *   (emoji), changes its proportions with the size, so a text with such characters is measured at each resolved size
 *   (`widthAt`), as v1 measured every text.
 * - Widths are kept per font and size in two generations under a byte budget, like the glyph layout cache: a hit in the
 *   previous generation moves the entry to the current one, and a full current generation becomes the previous one.
 *   The widths of the last font asked for stay at hand, so a layout's lookups build no key.
 * - `clear()` (late web fonts) drops everything, the linearity probes too, and changes `generation`.
 */
export class CanvasTextMetrics implements ISceneTextMetrics {
  public generation = 0;

  private current: TWidths = new Map();
  private previous: TWidths = new Map();
  private bytes = 0;
  private readonly tops = new Map<string, number>();
  private readonly linearity = new Map<string, TFontGroups>();
  private context: CanvasRenderingContext2D | null | undefined;
  private font = "";
  /** The last font and size asked for and its widths in the current generation. */
  private lastFamily = "";
  private lastWeight = "";
  private lastSize = 0;
  private lastKey = "";
  private lastWidths: Map<string, number> | undefined;
  /** The last font `top()` and `linear()` were asked for, and their answers. */
  private topFamily = "";
  private topWeight = "";
  private topValue: number | undefined;
  private linearFamily = "";
  private linearWeight = "";
  private linearGroups: TFontGroups | undefined;

  constructor(private readonly budget = WIDTH_CACHE_BYTES) {}

  public width(text: string, family: string, weight: string): number {
    return this.measured(text, family, weight, TEXT_METRICS_PX);
  }

  public widthAt(text: string, family: string, weight: string, size: number): number {
    return this.measured(text, family, weight, size);
  }

  public top(family: string, weight: string): number {
    if (this.topValue !== undefined && family === this.topFamily && weight === this.topWeight) return this.topValue;
    const key = `${weight}\u0000${family}`;
    let top = this.tops.get(key);
    if (top === undefined) {
      top = this.measureTop(family, weight);
      this.tops.set(key, top);
    }
    this.topFamily = family;
    this.topWeight = weight;
    this.topValue = top;
    return top;
  }

  /**
   * Whether the widths of `text` in the font scale linearly with its size: every character group of it (`groupOf`) is
   * linear in the font. A group is probed the first time a text has a character of it: its sample measured at
   * `LINEAR_PROBE_PX` and scaled lies within `LINEAR_TOLERANCE` of its width at `TEXT_METRICS_PX`. Without a context,
   * or with one whose widths do not change with the size at all (no font engine, as in tests), every text is linear.
   */
  public linear(text: string, family: string, weight: string): boolean {
    const font = this.groupsOf(family, weight);
    let latin = font.latin;
    for (let index = 0; index < text.length; index++) {
      let code = text.charCodeAt(index);
      if (code < 0x370) {
        if (latin === undefined) {
          latin = this.probeGroup(GROUP_LATIN, text, family, weight);
          font.latin = latin;
        }
        if (!latin) return false;
        continue;
      }
      if (code >= 0xd800 && code < 0xdc00) {
        code = text.codePointAt(index) ?? code;
        index++;
      }
      const group = groupOf(code);
      let linear = font.groups.get(group);
      if (linear === undefined) {
        linear = this.probeGroup(group, text, family, weight);
        font.groups.set(group, linear);
      }
      if (!linear) return false;
    }
    return true;
  }

  /** Forgets every measured value (late web fonts) and changes the generation, so layouts measured before are stale. */
  public clear(): void {
    this.current = new Map();
    this.previous = new Map();
    this.lastWidths = undefined;
    this.bytes = 0;
    this.tops.clear();
    this.topValue = undefined;
    this.linearity.clear();
    this.linearGroups = undefined;
    // The context's font is set again: it may have resolved to a fallback before the web font loaded.
    this.font = "";
    this.generation++;
  }

  /** The widths held, both generations. */
  public get size(): number {
    let size = 0;
    for (const generation of [this.current, this.previous]) {
      for (const widths of generation.values()) size += widths.size;
    }
    return size;
  }

  private measured(text: string, family: string, weight: string, size: number): number {
    if (family !== this.lastFamily || weight !== this.lastWeight || size !== this.lastSize || !this.lastWidths) {
      this.selectFont(family, weight, size);
    }
    const known = (this.lastWidths as Map<string, number>).get(text);
    if (known !== undefined) return known;
    const previous = this.previous.get(this.lastKey);
    const kept = previous?.get(text);
    if (kept !== undefined) {
      previous?.delete(text);
      this.remember(text, kept);
      return kept;
    }
    const ctx = this.contextFor(family, weight, size);
    const width = ctx ? ctx.measureText(text).width : text.length * FALLBACK_CHAR_WIDTH * size;
    this.remember(text, width);
    return width;
  }

  /** Makes a font and size the last asked for: its widths of the current generation, created when it has none. */
  private selectFont(family: string, weight: string, size: number): void {
    this.lastFamily = family;
    this.lastWeight = weight;
    this.lastSize = size;
    this.lastKey = `${weight}\u0000${size}\u0000${family}`;
    let widths = this.current.get(this.lastKey);
    if (!widths) {
      widths = new Map();
      this.current.set(this.lastKey, widths);
    }
    this.lastWidths = widths;
  }

  /** Keeps a width of the last font asked for; a full generation becomes the previous one first. */
  private remember(text: string, width: number): void {
    const cost = (text.length + this.lastKey.length) * 2 + ENTRY_BYTES;
    if (this.bytes + cost > this.budget && this.bytes > 0) {
      this.previous = this.current;
      this.current = new Map();
      this.bytes = 0;
      this.selectFont(this.lastFamily, this.lastWeight, this.lastSize);
    }
    (this.lastWidths as Map<string, number>).set(text, width);
    this.bytes += cost;
  }

  private contextFor(family: string, weight: string, size = TEXT_METRICS_PX): CanvasRenderingContext2D | null {
    if (this.context === undefined) {
      this.context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d") ?? null;
    }
    const ctx = this.context;
    if (!ctx) return null;
    const font = `${weight} ${size}px ${family}`;
    if (font !== this.font) {
      ctx.font = font;
      this.font = font;
    }
    return ctx;
  }

  /** The probed groups of a font, the last one asked for at hand. */
  private groupsOf(family: string, weight: string): TFontGroups {
    if (this.linearGroups && family === this.linearFamily && weight === this.linearWeight) return this.linearGroups;
    const key = `${weight}\u0000${family}`;
    let groups = this.linearity.get(key);
    if (!groups) {
      groups = { latin: undefined, groups: new Map() };
      this.linearity.set(key, groups);
    }
    this.linearFamily = family;
    this.linearWeight = weight;
    this.linearGroups = groups;
    return groups;
  }

  /**
   * Whether a group scales linearly in the font: its sample (`GROUP_SAMPLES`, or for another script the characters of
   * `text` in the group, repeated) at `LINEAR_PROBE_PX`, scaled, against `TEXT_METRICS_PX`.
   */
  private probeGroup(group: number, text: string, family: string, weight: string): boolean {
    const sample = group < OTHER_GROUPS ? GROUP_SAMPLES[group] : otherSample(text, group);
    const small = this.contextFor(family, weight, LINEAR_PROBE_PX)?.measureText(sample).width;
    const large = this.contextFor(family, weight, TEXT_METRICS_PX)?.measureText(sample).width;
    if (small === undefined || large === undefined || small === large) return true;
    return Math.abs((small * TEXT_METRICS_PX) / LINEAR_PROBE_PX - large) <= LINEAR_TOLERANCE * large;
  }

  /**
   * The distance from a line's top to its alphabetic baseline, exactly as Canvas2D places them: the glyph box's ascent
   * measured from the alphabetic baseline minus the same ascent measured from the "top" baseline. Without bounding
   * boxes in the context's metrics: `fontBoundingBoxAscent`, else 0.8 of the font size.
   */
  private measureTop(family: string, weight: string): number {
    const ctx = this.contextFor(family, weight);
    if (!ctx) return FALLBACK_TOP * TEXT_METRICS_PX;
    const previous = ctx.textBaseline;
    ctx.textBaseline = "alphabetic";
    const fromAlphabetic = ctx.measureText(TOP_PROBE);
    ctx.textBaseline = "top";
    const fromTop = ctx.measureText(TOP_PROBE);
    ctx.textBaseline = previous;
    const top = fromAlphabetic.actualBoundingBoxAscent - fromTop.actualBoundingBoxAscent;
    if (Number.isFinite(top)) return top;
    const ascent = fromAlphabetic.fontBoundingBoxAscent;
    return Number.isFinite(ascent) ? ascent : FALLBACK_TOP * TEXT_METRICS_PX;
  }
}

/** The scene's shared text metrics. */
export const sceneTextMetrics = new CanvasTextMetrics();

/** Drops the shared text metrics (late web fonts): every layout measured before is laid out again on its next use. */
export function clearSceneTextMetrics(): void {
  sceneTextMetrics.clear();
}

/** The last layout of each text, by a key object (the primitive as the element holds it). */
const layouts = new WeakMap<object, TTextLayout>();

/**
 * The layout of a text at a resolved size from the shared metrics, cached per `key` (the primitive as the element
 * holds it, before styles): the last layout is kept while the size stays in its range (`TTextLayout.minSize`,
 * `maxSize`) and the metrics are unchanged, so a zoom that changes no line break lays out nothing.
 */
export function sceneTextLayout(key: object, primitive: TTextPrimitive, size: number): TTextLayout {
  const known = layouts.get(key);
  if (known && isLayoutValid(known, size, sceneTextMetrics)) return known;
  const layout = layoutText(primitive, size, sceneTextMetrics);
  layouts.set(key, layout);
  return layout;
}

/**
 * The cached layout of a text at a resolved size (`sceneTextLayout`) when there is one, without laying it out or
 * keeping anything: the WebGL backend keeps no layout of a world text, but takes the one its element's bounds made.
 */
export function peekSceneTextLayout(key: object, size: number): TTextLayout | undefined {
  const known = layouts.get(key);
  return known && isLayoutValid(known, size, sceneTextMetrics) ? known : undefined;
}
