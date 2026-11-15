import type { TTileRect } from "../culling/TileIndex";

import type { TScenePrimitive, TSceneTextPolicy } from "./types";

/**
 * The layout of scene text that both renderers and exports share (pure: the metrics are passed in). A text is laid out
 * at its resolved world font size (`resolveTextSize`) with the v1 rules of `wrapLines` and `layoutText`
 * (`utils/functions/text.ts`, `utils/renderers/text.ts`): words split on whitespace, a word wider than the box split by
 * characters, a line kept while it fits the box's height at the resolved line pitch, then `maxLines` and the
 * ellipsis. Each line's top lies where v1 Canvas2D drew it with `textBaseline = "top"`: the block of lines starts at
 * the box's top (`verticalAlign: "top"`), its centre or its bottom.
 *
 * Widths come from one metrics authority (`ISceneTextMetrics`), measured once per font at `TEXT_METRICS_PX` and scaled
 * linearly, or at the resolved size for a text whose widths do not scale linearly in its font (optical sizing, a
 * fallback font for some of its characters, `ISceneTextMetrics.linear`); each measured width is rounded as v1 rounded
 * it (`Math.floor(width + 1)`), so line breaks match v1. A layout records the range of sizes that give the same lines
 * and the same clip (`minSize`, `maxSize`, `overflows`): renderers re-lay a text out only when its size leaves that
 * range, and in between the glyphs scale continuously.
 */

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/** The font size, in CSS pixels, the shared metrics measure at; widths at another size scale linearly. */
export const TEXT_METRICS_PX = 100;

/** The ellipsis `overflow: "ellipsis"` ends the last kept line with. */
export const ELLIPSIS = "…";

/** Widths and vertical metrics of text, measured once per font at `TEXT_METRICS_PX` (`textMetrics.ts`). */
export interface ISceneTextMetrics {
  /** The width of `text` in the family and weight at `TEXT_METRICS_PX`, unrounded. */
  width(text: string, family: string, weight: string): number;
  /**
   * Whether the widths of `text` in the font scale linearly with its size (no optical sizing, no fallback font that
   * scales differently for any of its characters): then its widths at `TEXT_METRICS_PX` scale to any size. Unset:
   * every text is linear.
   */
  linear?(text: string, family: string, weight: string): boolean;
  /** The width of `text` at `size` CSS px, unrounded: the widths of a text that is not linear. */
  widthAt?(text: string, family: string, weight: string, size: number): number;
  /**
   * How far the alphabetic baseline lies below a line's top (Canvas2D `textBaseline = "top"`) in the family and weight
   * at `TEXT_METRICS_PX`.
   */
  top(family: string, weight: string): number;
  /** Changes whenever the measured values are dropped (late web fonts): layouts measured before are stale. */
  readonly generation: number;
}

/** The policy of a graph without the `cameraAwareText` setting: camera-aware texts follow the camera. */
export const DEFAULT_TEXT_POLICY: TSceneTextPolicy = Object.freeze({ cameraAware: true });

/** v1 measured at most this many words and word pieces per text (`wrapLines`). */
const MAX_ITERATIONS = 1000;

/**
 * A bounding wrap (`boundingLineCount`) runs without v1's limit, as a wrap at a smaller size can take fewer iterations
 * per line; it ends after about two iterations per word and character, and past this many it gives up.
 */
const BOUNDING_ITERATIONS = 16 * MAX_ITERATIONS;

/** Bounds of the size range are moved this share towards the layout's size, against float rounding. */
const RANGE_EPSILON = 1e-9;

/** Whether a text's size is in screen pixels under the policy: its own mode on, and the policy allows it. */
export function isCameraAwareText(primitive: TTextPrimitive, policy?: TSceneTextPolicy): boolean {
  return Boolean(primitive.cameraAware) && policy?.cameraAware !== false;
}

/**
 * The world font size of a text at a camera scale: `size` for a world text (or under a policy that turns camera
 * awareness off), else `size / scale` clamped by its `cameraAware` bounds.
 */
export function resolveTextSize(primitive: TTextPrimitive, scale: number, policy?: TSceneTextPolicy): number {
  const mode = primitive.cameraAware;
  if (!mode || policy?.cameraAware === false) return primitive.size;
  const world = primitive.size / scale;
  if (mode === true) return world;
  return Math.min(Math.max(world, mode.minWorld ?? -Infinity), mode.maxWorld ?? Infinity);
}

/** The share of the box's width an alignment anchors to: 0 left (start), 0.5 centre, 1 right (end). */
export function horizontalShare(align: CanvasTextAlign | undefined): number {
  if (align === "center") return 0.5;
  if (align === "right" || align === "end") return 1;
  return 0;
}

/** The share of the box's height a vertical alignment anchors to: 0 top (the default), 0.5 middle, 1 bottom. */
export function verticalShare(verticalAlign: TTextPrimitive["verticalAlign"]): number {
  if (verticalAlign === "middle") return 0.5;
  if (verticalAlign === "bottom") return 1;
  return 0;
}

/** The line pitch per world unit of font size: `lineHeight / size`, 0 when either is not positive. */
export function pitchRatio(primitive: TTextPrimitive): number {
  return primitive.lineHeight > 0 && primitive.size > 0 ? primitive.lineHeight / primitive.size : 0;
}

/** Whether the metrics scale the widths of `text` in the font linearly (`ISceneTextMetrics.linear`). */
export function isLinearText(metrics: ISceneTextMetrics, text: string, family: string, weight: string): boolean {
  return !metrics.widthAt || (metrics.linear?.(text, family, weight) ?? true);
}

/**
 * The raw width of texts in the primitive's font at `TEXT_METRICS_PX` units, for a layout at the resolved `size`: the
 * metrics' width of linear texts (`isLinearText`), else their width at `size` brought to `TEXT_METRICS_PX` units.
 */
export function rawWidthOf(
  metrics: ISceneTextMetrics,
  family: string,
  weight: string,
  size: number,
  linear: boolean
): (text: string) => number {
  if (linear || !metrics.widthAt) return (text) => metrics.width(text, family, weight);
  const toReference = TEXT_METRICS_PX / size;
  const widthAt = metrics.widthAt as NonNullable<ISceneTextMetrics["widthAt"]>;
  return (text) => widthAt.call(metrics, text, family, weight, size) * toReference;
}

/** The text's lines at one resolved size, and the sizes that give the same lines. */
export type TTextLayout = {
  /** The resolved world font size the text was laid out at. */
  readonly size: number;
  /** The lines in drawing order: words joined by single spaces, the last one maybe ending with "…". */
  readonly lines: readonly string[];
  /** Each line's width at `TEXT_METRICS_PX`, unrounded: its words and the spaces between them. */
  readonly widths: readonly number[];
  /** The widest line at `TEXT_METRICS_PX`. */
  readonly maxWidth: number;
  /**
   * Whether the text can put ink outside its box at any size of its range (`[minSize, maxSize]`), so both renderers
   * clip it to the box: a line wider than the box, or, in a box with a height, a line's em box (one font size from its
   * top) past the box's top or bottom (a line pitch under the font size). A text whose lines fit is drawn without a
   * clip, as v1 drew every text: its glyphs may overhang the box by their side bearings, accents and descenders.
   */
  readonly overflows: boolean;
  /**
   * The resolved sizes, `size` included, that lay the text out in the same lines with the same `overflows`:
   * `[minSize, maxSize]`.
   */
  readonly minSize: number;
  readonly maxSize: number;
  /** `ISceneTextMetrics.generation` of the metrics it was measured with. */
  readonly generation: number;
  /** Whether its widths scale from `TEXT_METRICS_PX` (`isLinearText`); else they were measured at `size`. */
  readonly linear: boolean;
};

/** Whether a layout still gives the text's lines at a resolved size with these metrics. */
export function isLayoutValid(layout: TTextLayout, size: number, metrics: ISceneTextMetrics): boolean {
  return layout.generation === metrics.generation && size >= layout.minSize && size <= layout.maxSize;
}

/**
 * The size range a layout is valid for, narrowed by each width or height decision it made. A decision compares a sum
 * of rounded widths `S(u) = sum(floor(r_i * u / TEXT_METRICS_PX + 1))`, which never decreases with the size `u`:
 * - "fits" (`S(u0) <= W`) holds for every `u <= u0`, and for every `u` with `R * u / TEXT_METRICS_PX + n <= W`;
 * - "does not fit" (`S(u0) > W`) holds for every `u >= u0`, and for every `u` with `R * u / TEXT_METRICS_PX >= W`.
 */
class SizeRange {
  public min = 0;
  public max = Infinity;

  constructor(private readonly size: number) {}

  /** A sum of `terms` rounded widths whose raw widths add up to `raw` fitted in `limit`. */
  public fits(raw: number, terms: number, limit: number): void {
    if (raw > 0) this.below((limit - terms) * (TEXT_METRICS_PX / raw));
  }

  /** A sum of rounded widths whose raw widths add up to `raw` did not fit in `limit`. */
  public overflows(raw: number, limit: number): void {
    if (raw > 0) this.above(limit * (TEXT_METRICS_PX / raw));
  }

  /** The decision holds for every size up to `bound`, and up to the layout's size. */
  public below(bound: number): void {
    this.max = Math.min(this.max, Math.max(this.size, bound * (1 - RANGE_EPSILON)));
  }

  /** The decision holds for every size from `bound` on, and from the layout's size on. */
  public above(bound: number): void {
    this.min = Math.max(this.min, Math.min(this.size, bound * (1 + RANGE_EPSILON)));
  }

  /** The decision may change at any other size. */
  public pin(): void {
    this.min = this.size;
    this.max = this.size;
  }
}

/** A rounded width and the raw width it rounds (in `TEXT_METRICS_PX` units), at the layout's size. */
type TMeasured = { width: number; raw: number };

/**
 * The lines a wrap keeps, with each line's raw width at `TEXT_METRICS_PX` (its words and the spaces between them);
 * `unbounded` when a bounding wrap (`boundingLineCount`) stopped at its iteration limit.
 */
type TLines = { texts: string[]; widths: number[]; unbounded?: boolean };

/** How a text is measured at a resolved size: rounded widths, and whether they scale to other sizes. */
type TMeasurer = { measure: (text: string) => TMeasured; linear: boolean };

/**
 * The measurer of a text at a resolved size. Its widths scale from `TEXT_METRICS_PX` when every string the layout
 * measures is linear in the font (`isLinearText`): the text's characters, the space wrapping puts before each word,
 * the ellipsis. Otherwise every width is measured at the size, as v1 measured them.
 */
function measurerOf(primitive: TTextPrimitive, size: number, metrics: ISceneTextMetrics): TMeasurer {
  const family = primitive.family;
  const weight = primitive.weight ?? "normal";
  const k = size / TEXT_METRICS_PX;
  const linear =
    isLinearText(metrics, primitive.text || "", family, weight) &&
    (primitive.wrap === false || isLinearText(metrics, " ", family, weight)) &&
    (primitive.overflow !== "ellipsis" || isLinearText(metrics, ELLIPSIS, family, weight));
  const rawOf = rawWidthOf(metrics, family, weight, size, linear);
  const measure = (text: string): TMeasured => {
    const raw = rawOf(text);
    return { width: Math.floor(raw * k + 1), raw };
  };
  return { measure, linear };
}

/** The words of a text (split on whitespace), none for an empty or blank text. */
function wordsOf(primitive: TTextPrimitive): string[] {
  const words = primitive.text ? primitive.text.trim().split(/\s+/) : [];
  return words.length > 0 && words[0] !== "" ? words : [];
}

/**
 * Lays a text out at a resolved world font size. Lines come out as v1 `measureMultilineText` gives them for the font
 * at that size, with two differences in boxes narrower than a few characters or texts that do not wrap:
 * - an empty word piece that does not fit is dropped (v1 looped on it until the box's height ran out);
 * - the height also limits `wrap: false` text, which v1 kept whole.
 * A text without words has no line at any size.
 */
export function layoutText(primitive: TTextPrimitive, size: number, metrics: ISceneTextMetrics): TTextLayout {
  const range = new SizeRange(size);
  const { measure, linear } = measurerOf(primitive, size, metrics);
  const lines: TLines = { texts: [], widths: [] };
  let remains = false;
  const words = wordsOf(primitive);
  const hasWords = words.length > 0;
  if (!(size > 0) || !Number.isFinite(size)) {
    range.pin();
  } else if (hasWords && primitive.wrap === false) {
    layoutUnwrapped(primitive, size, measure, range, lines);
  } else if (hasWords) {
    remains = wrapWords(primitive, words, size, measure, range, lines, false);
  }
  // Without words no decision depends on the size: the range stays [0, Infinity).
  if (primitive.wrap !== false && primitive.overflow === "ellipsis" && lines.texts.length > 0) {
    const last = lines.texts.length - 1;
    const fitted = ellipsize(lines.texts[last], remains, primitive.width, measure, range);
    if (fitted === undefined) {
      lines.texts.pop();
      lines.widths.pop();
    } else {
      lines.texts[last] = fitted.text;
      lines.widths[last] = fitted.raw;
    }
  }
  let maxWidth = 0;
  for (const width of lines.widths) maxWidth = Math.max(maxWidth, width);
  const overflows = overflowsAt(primitive, lines.texts.length, maxWidth, size, range);
  // The widths of a text that is not linear hold at this size only; a text without words measured nothing.
  if (!linear && hasWords) range.pin();
  return {
    size,
    lines: lines.texts,
    widths: lines.widths,
    maxWidth,
    overflows,
    minSize: range.min,
    maxSize: range.max,
    generation: metrics.generation,
    linear,
  };
}

/**
 * Whether `lines` lines, the widest `maxWidth` wide at `TEXT_METRICS_PX`, can put ink outside the box at `size`
 * (`TTextLayout.overflows`), narrowing the range to the sizes with the same answer. Each test is linear in the size
 * for fixed lines, so it has one threshold:
 * - a line wider than the box: `maxWidth * u / TEXT_METRICS_PX > width`;
 * - the block's top above the box (a block centred or at the bottom that is taller than the box):
 *   `share * (height - lines * ratio * u) < 0`;
 * - the last line's em box below the box: `share * height - share * lines * ratio * u + (lines - 1) * ratio * u + u >
 *   height`.
 */
function overflowsAt(
  primitive: TTextPrimitive,
  lines: number,
  maxWidth: number,
  size: number,
  range: SizeRange
): boolean {
  if (lines === 0) return false;
  let overflows = false;
  /** The test `u > bound` at the layout's size, its answer kept over the range. */
  const past = (bound: number): void => {
    if (size > bound) {
      overflows = true;
      range.above(bound);
    } else {
      range.below(bound);
    }
  };
  if (maxWidth > 0) past((primitive.width * TEXT_METRICS_PX) / maxWidth);
  else if (primitive.width < 0) overflows = true;
  const height = primitive.height;
  if (height === undefined) return overflows;
  const share = verticalShare(primitive.verticalAlign);
  const ratio = pitchRatio(primitive);
  if (share > 0 && ratio > 0) past(height / (lines * ratio));
  const slope = 1 + (lines - 1) * ratio - share * lines * ratio;
  const limit = height * (1 - share);
  if (slope > 0) past(limit / slope);
  else if (limit < 0) overflows = true;
  return overflows;
}

/**
 * One line that does not wrap (`wrap: false`), into `lines`: the text with its whitespace as written (each whitespace
 * character drawn as a space, as Canvas2D draws it), kept while the box's height holds a line. With `overflow:
 * "ellipsis"` a text wider than the box is cut as the ETL story's `fitText` cut it: each candidate, the text cut one
 * character at a time from its end with "…" after it, is measured whole with one rounding, and the first that fits
 * is drawn with its trailing spaces trimmed; nothing when not even "…" fits.
 */
function layoutUnwrapped(
  primitive: TTextPrimitive,
  size: number,
  measure: (text: string) => TMeasured,
  range: SizeRange,
  lines: TLines
): void {
  if (!lineRoom(primitive, size, range)(0, 0)) return;
  const line = primitive.text.replace(/[\t\n\f\r]/g, " ");
  const maxWidth = primitive.width;
  const whole = measure(line);
  const push = (text: string, raw: number): void => {
    lines.texts.push(text);
    lines.widths.push(raw);
  };
  if (primitive.overflow !== "ellipsis") {
    push(line, whole.raw);
    return;
  }
  if (whole.width <= maxWidth) {
    range.fits(whole.raw, 1, maxWidth);
    push(line, whole.raw);
    return;
  }
  range.overflows(whole.raw, maxWidth);
  for (let end = line.length; end >= 0; end--) {
    const candidate = measure(`${line.slice(0, end)}${ELLIPSIS}`);
    if (candidate.width <= maxWidth) {
      range.fits(candidate.raw, 1, maxWidth);
      const text = `${line.slice(0, end).trimEnd()}${ELLIPSIS}`;
      push(text, measure(text).raw);
      return;
    }
    range.overflows(candidate.raw, maxWidth);
  }
}

/**
 * Whether one more line fits: `(slots + 1)` lines at the resolved pitch within the box's height, and fewer than the
 * line limit (`maxLines`, one line for a pitch that is not positive), narrowing the range at the height's threshold.
 */
function lineRoom(primitive: TTextPrimitive, size: number, range: SizeRange): (slots: number, kept: number) => boolean {
  const maxHeight = primitive.height ?? Infinity;
  const maxLines = Math.max(0, primitive.maxLines ?? Infinity);
  const ratio = pitchRatio(primitive);
  const pitch = ratio * size;
  // A line height that is not positive keeps one line.
  const lineLimit = ratio > 0 ? maxLines : Math.min(1, maxLines);
  return (slots, kept) => {
    if (kept >= lineLimit) return false;
    if (maxHeight === Infinity || ratio <= 0) return true;
    const fits = (slots + 1) * pitch <= maxHeight;
    // (slots + 1) * ratio * u <= maxHeight while u <= maxHeight / ((slots + 1) * ratio).
    const bound = maxHeight / ((slots + 1) * ratio);
    if (fits) range.below(bound);
    else range.above(bound);
    return fits;
  };
}

/**
 * v1 `wrapLines` at one size, into `lines`: words as a stack, each line starting with a space that is trimmed later, a
 * word that alone does not fit cut one character at a time from its end, and a line kept while the lines so far plus it
 * fit the box's height; a line whose v1 width (without the leading space it counts) is not positive is dropped, as v1
 * filtered it, though it took its height. Stops at `maxLines` lines too. Returns whether words remain that no line
 * holds (empty pieces are not content). A line's raw width counts its words and the spaces between them, not the
 * leading space nor an empty piece. A `bounding` wrap (`boundingLineCount`) keeps the lines v1's filter drops and has
 * no v1 iteration limit: past `BOUNDING_ITERATIONS` it stops with `lines.unbounded`.
 */
function wrapWords(
  primitive: TTextPrimitive,
  words: string[],
  size: number,
  measure: (text: string) => TMeasured,
  range: SizeRange,
  lines: TLines,
  bounding: boolean
): boolean {
  const maxWidth = primitive.width;
  const space = measure(" ");
  // Lines that took height, empty ones included (v1 pushed them and filtered them out afterwards).
  let slots = 0;
  const lineFits = lineRoom(primitive, size, range);
  const room = (): boolean => lineFits(slots, lines.texts.length);
  // The line being built: its text (with v1's leading space), its v1 width (rounded terms), the raw widths and the
  // count of the terms behind it, and the raw width of its words alone.
  let text = "";
  let width = 0;
  let raw = 0;
  let terms = 0;
  let wordsRaw = 0;
  let hasWords = false;
  const lineBreak = (): void => {
    const trimmed = text.trim();
    // v1's width of a line counts a leading space: a piece no wider than a space comes out empty and is dropped.
    if (trimmed.length > 0 && (bounding || width - space.width > 0)) {
      lines.texts.push(trimmed);
      lines.widths.push(wordsRaw);
    }
    slots++;
    text = "";
    width = 0;
    raw = 0;
    terms = 0;
    wordsRaw = 0;
    hasWords = false;
  };
  const stack = words.slice().reverse();
  let iterations = 0;
  const limit = bounding ? BOUNDING_ITERATIONS : MAX_ITERATIONS;
  while (stack.length > 0 && room()) {
    if (iterations++ >= limit) {
      range.pin();
      lines.unbounded = bounding;
      break;
    }
    const word = stack.pop() as string;
    let next = measure(word);
    const nextWidth = width + space.width + next.width;
    const nextRaw = raw + space.raw + next.raw;
    if (nextWidth <= maxWidth) {
      range.fits(nextRaw, terms + 2, maxWidth);
      if (word !== "") {
        wordsRaw += (hasWords ? space.raw : 0) + next.raw;
        hasWords = true;
      }
      text = `${text} ${word}`;
      width = nextWidth;
      raw = nextRaw;
      terms += 2;
      continue;
    }
    range.overflows(nextRaw, maxWidth);
    if (width > 0) {
      stack.push(word);
      lineBreak();
      continue;
    }
    if (word === "") {
      // v1 put an empty piece on a line of its own and pushed it again, until the height ran out.
      continue;
    }
    // The word alone does not fit: cut one character at a time from its end until the piece fits, or one is left.
    let piece = word;
    let rest = "";
    for (let breakAt = word.length - 1; breakAt > 0 && next.width > maxWidth; breakAt--) {
      range.overflows(next.raw, maxWidth);
      piece = word.slice(0, breakAt);
      rest = word.slice(breakAt);
      next = measure(piece);
    }
    if (next.width <= maxWidth) range.fits(next.raw, 1, maxWidth);
    else range.overflows(next.raw, maxWidth);
    keptPiece(next, space, size, range);
    text = piece;
    width = next.width;
    raw = next.raw;
    terms = 1;
    wordsRaw = next.raw;
    lineBreak();
    stack.push(rest);
  }
  // Empty pieces left on the stack (after a forced break) are no content.
  const more = stack.some((word) => word !== "");
  if (width > 0) {
    if (room()) {
      lineBreak();
      return more;
    }
    return hasWords || more;
  }
  return more;
}

/**
 * A line of one piece (after a forced break) is kept when its rounded width is wider than a space's (v1's filter):
 * `floor(a * u + 1) - floor(b * u + 1) > 0` for the piece's and the space's widths `a` and `b` per unit of size. That
 * holds for every `u >= 1 / (a - b)` and is not monotone below it, so the range keeps above that bound when the
 * layout's size lies there, and is pinned to the layout's size otherwise.
 */
function keptPiece(piece: TMeasured, space: TMeasured, size: number, range: SizeRange): void {
  const bound = TEXT_METRICS_PX / (piece.raw - space.raw);
  if (piece.raw > space.raw && size >= bound) range.above(bound);
  else range.pin();
}

/**
 * The last kept line with "…", as the ETL story's `fitText`: the line, then the line cut one character at a time from
 * its end (trailing spaces trimmed), until it fits the box's width with the ellipsis's own width reserved. Without
 * content past the line and with the line fitting, it is kept as it is; undefined when not even "…" fits. Returns the
 * line with its raw width.
 */
function ellipsize(
  line: string,
  remains: boolean,
  maxWidth: number,
  measure: (text: string) => TMeasured,
  range: SizeRange
): { text: string; raw: number } | undefined {
  const space = measure(" ");
  const widthOf = (text: string): TMeasured & { terms: number } => {
    const words = text.split(" ");
    let width = (words.length - 1) * space.width;
    let raw = (words.length - 1) * space.raw;
    for (const word of words) {
      const measured = measure(word);
      width += measured.width;
      raw += measured.raw;
    }
    return { width, raw, terms: 2 * words.length - 1 };
  };
  if (!remains) {
    const whole = widthOf(line);
    if (whole.width <= maxWidth) {
      range.fits(whole.raw, whole.terms, maxWidth);
      return { text: line, raw: whole.raw };
    }
    range.overflows(whole.raw, maxWidth);
  }
  const ellipsis = measure(ELLIPSIS);
  for (let end = remains ? line.length : line.length - 1; end >= 0; end--) {
    const prefix = line.slice(0, end).trimEnd();
    const measured = prefix === "" ? { width: 0, raw: 0, terms: 0 } : widthOf(prefix);
    const width = measured.width + ellipsis.width;
    const raw = measured.raw + ellipsis.raw;
    if (width <= maxWidth) {
      range.fits(raw, measured.terms + 1, maxWidth);
      return { text: `${prefix}${ELLIPSIS}`, raw };
    }
    range.overflows(raw, maxWidth);
  }
  return undefined;
}

/** Where a laid-out text draws at a resolved size, relative to its element's origin. */
export type TTextPlacement = {
  /** The anchor x: each line aligns to it by `align`. */
  x: number;
  /** The anchor y: the block of lines lies on it by `verticalAlign`. */
  y: number;
  /** The top of the first line. */
  top: number;
  /** The resolved line pitch: line `i`'s top is `top + i * pitch`. */
  pitch: number;
  /** How far each line's alphabetic baseline lies below its top. */
  baseline: number;
};

/**
 * The box's height the block of lines aligns to: `height`, or without one the block of `lines` lines at the authored
 * `lineHeight`, so a heightless text keeps its anchor as its size changes.
 */
function boxHeight(primitive: TTextPrimitive, lines: number): number {
  return primitive.height ?? lines * Math.max(0, primitive.lineHeight);
}

/** The anchor of a text of `lines` lines: on the box's left edge, centre or right edge, and top, centre or bottom. */
export function textAnchor(primitive: TTextPrimitive, lines: number): { x: number; y: number } {
  return {
    x: primitive.x + primitive.width * horizontalShare(primitive.align),
    y: primitive.y + boxHeight(primitive, lines) * verticalShare(primitive.verticalAlign),
  };
}

/** Where a text of `lines` lines draws at the resolved size `size`. */
export function placeText(
  primitive: TTextPrimitive,
  lines: number,
  size: number,
  metrics: ISceneTextMetrics
): TTextPlacement {
  const anchor = textAnchor(primitive, lines);
  const pitch = pitchRatio(primitive) * size;
  return {
    x: anchor.x,
    y: anchor.y,
    top: anchor.y - verticalShare(primitive.verticalAlign) * lines * pitch,
    pitch,
    baseline: (metrics.top(primitive.family, primitive.weight ?? "normal") * size) / TEXT_METRICS_PX,
  };
}

/** The text's clip box relative to its element's origin: its box, unbounded vertically without a height. */
export function textClip(primitive: TTextPrimitive): TTileRect {
  const { x, y, width, height } = primitive;
  return {
    minX: Math.min(x, x + width),
    minY: height === undefined ? -Infinity : Math.min(y, y + height),
    maxX: Math.max(x, x + width),
    maxY: height === undefined ? Infinity : Math.max(y, y + height),
  };
}

/**
 * The largest resolved size of a text over the scales it is shown at, under any policy: its `size`, or its size at
 * `lowestScale` when it is camera-aware (larger when the camera zooms out).
 */
export function largestTextSize(primitive: TTextPrimitive, lowestScale: number): number {
  return Math.max(primitive.size, resolveTextSize(primitive, lowestScale));
}

/**
 * At least as many lines as a heightless text draws at any resolved size up to `size` (`textBounds`): its wrap at
 * `size` without v1's narrow-piece filter (`wrapWords` with `bounding`), capped by `maxLines`. Each decision of the
 * wrap compares a sum of widths rounded up from `width * u` that never decreases with the size `u` (for a font with
 * optical sizing too: a string never gets narrower as its size grows), so whatever fits at `size` fits at every smaller
 * size, and the greedy wrap, which puts as much on each line as fits, ends each line at a smaller size no earlier: it
 * never has more lines there. The filter only drops lines, the ellipsis only ends the last one. v1's iteration limit
 * caps the lines drawn at `MAX_ITERATIONS + 1`, the count when the bounding wrap gives up. The argument holds for
 * fixed strings; a font whose contextual ligatures make a longer split piece narrower than a shorter one can break it
 * (documented under "Renderer differences" in docs/system/scene.md).
 */
export function boundingLineCount(primitive: TTextPrimitive, size: number, metrics: ISceneTextMetrics): number {
  const words = wordsOf(primitive);
  if (words.length === 0 || !(size > 0) || !Number.isFinite(size)) return 0;
  const range = new SizeRange(size);
  if (primitive.wrap === false) return lineRoom(primitive, size, range)(0, 0) ? 1 : 0;
  const lines: TLines = { texts: [], widths: [] };
  wrapWords(primitive, words, size, measurerOf(primitive, size, metrics).measure, range, lines, true);
  const maxLines = Math.max(0, primitive.maxLines ?? Infinity);
  return lines.unbounded ? Math.min(maxLines, MAX_ITERATIONS + 1) : lines.texts.length;
}

/**
 * The culling bounds of a text relative to its element's origin (spec §3.2). Its lines never leave its box (a text
 * whose layout overflows is clipped to it; glyph ink may overhang by its side bearings, as in v1), so a text with a
 * height contributes the box. A heightless text is unbounded vertically: it contributes its width and the block of
 * the lines it can have at any size up to its largest (`largestSize`, `boundingLineCount`), placed by its alignment,
 * with half that size above and below for ink past the line boxes; fewer lines at a smaller size lie within it.
 * `drawnLines`, for a text drawn at `largestSize` alone (a world text), is the count of its laid-out lines there,
 * which replaces the bounding wrap.
 */
export function textBounds(
  primitive: TTextPrimitive,
  largestSize: number,
  metrics: ISceneTextMetrics,
  drawnLines?: number
): TTileRect {
  const clip = textClip(primitive);
  if (primitive.height !== undefined) return clip;
  const lines = drawnLines ?? boundingLineCount(primitive, largestSize, metrics);
  const pitch = pitchRatio(primitive) * largestSize;
  const anchor = textAnchor(primitive, lines);
  const top = anchor.y - verticalShare(primitive.verticalAlign) * lines * pitch;
  const pad = largestSize / 2;
  return {
    minX: clip.minX,
    minY: Math.min(primitive.y, top) - pad,
    maxX: clip.maxX,
    maxY: Math.max(primitive.y + boxHeight(primitive, lines), top + lines * pitch) + pad,
  };
}
