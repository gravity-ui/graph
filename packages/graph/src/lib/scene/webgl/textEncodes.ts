import type { TTextLayout } from "../textLayout";
import type { TSceneCameraAware, TScenePrimitive, TSceneTextPolicy } from "../types";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/**
 * What an element's last text encode wrote: the texts in primitive order, their subs, and how many glyph instances each
 * wrote in its pass (a camera-aware text's capacity, `textGlyphCount`; the instances of a pass lie text after text, in
 * this order), whether each went to the translucent pass (`translucent`, unset when every text went to the opaque
 * one), how many of them its lines placed (`placed`), at element index `index`, with what they were laid out with
 * (`TTextLayouts`). Kept as the encode to compare
 * the next one with when every glyph went to the opaque pass, and for every element with a camera-aware text (a
 * re-layout rewrites a text's glyphs in place and updates its layout and the policy here). `adoptTexts` moves
 * `texts` and `subs` to a later, equal encode.
 */
export type TTextEncode = TTextLayouts & {
  readonly index: number;
  readonly texts: TTextPrimitive[];
  readonly subs: number[];
  glyphs: readonly number[];
  readonly translucent: readonly boolean[] | undefined;
  /**
   * For an element with a camera-aware text: how many glyphs each text's lines placed (the first of its slots; the
   * others hold hidden glyphs). A re-layout in place updates it.
   */
  readonly placed?: number[];
};

/**
 * What an element's texts were laid out with (the layout revision): each camera-aware text's layout, in text order
 * (`undefined` for a world text: its lines change only with the metrics), the policy and the metrics' generation.
 * A re-layout in place updates the layouts and the policy.
 */
export type TTextLayouts = {
  readonly texts: readonly TTextPrimitive[];
  readonly layouts: (TTextLayout | undefined)[];
  policy: TSceneTextPolicy;
  readonly generation: number;
};

/**
 * The first glyph instance of the element's text `text` in the list of its pass: the instances of the earlier texts of
 * the same pass come first (`TTextEncode`).
 */
export function firstGlyphOf(encode: TTextEncode, text: number): number {
  const translucent = encode.translucent?.[text] ?? false;
  let first = 0;
  for (let before = 0; before < text; before++) {
    if ((encode.translucent?.[before] ?? false) === translucent) first += encode.glyphs[before];
  }
  return first;
}

/**
 * Whether two layouts of one text place the same glyphs (`glyphRun`), so a re-layout that gives `after` writes
 * nothing: the same lines and clip, laid out with linear widths (the run then depends on the lines alone) or, for
 * widths measured at their size, at the same size. The size range of a layout is conservative, so a re-layout often
 * gives the same lines.
 */
export function sameGlyphLayout(before: TTextLayout, after: TTextLayout): boolean {
  if (before === after) return true;
  if (before.overflows !== after.overflows || before.lines.length !== after.lines.length) return false;
  if (before.generation !== after.generation || before.linear !== after.linear) return false;
  if (!after.linear && before.size !== after.size) return false;
  for (let line = 0; line < after.lines.length; line++) {
    if (before.lines[line] !== after.lines[line]) return false;
  }
  return true;
}

/**
 * How an element's texts are encoded, against its last text encode:
 * - `"keep"`: the same texts (`sameText`) at the same subs and element index, with layouts still current for the frame
 *   (`layoutsCurrent`); the glyph instances written last time are what an encode would write;
 * - `"resub"`: the same texts at other subs (a primitive before them was added or removed); an encode would write the
 *   same glyph instances, and other glyph subs (`resubGlyphs`), which lie in a list of their own;
 * - `"encode"`: anything else, or no last encode to compare with.
 */
export type TTextPlan = "keep" | "resub" | "encode";

/** The fields of a text primitive besides `kind`. */
export type TTextField = Exclude<keyof TTextPrimitive, "kind">;

/** Every field of a text primitive but `kind`: `sameText` compares each of them. */
export const TEXT_FIELDS = [
  "text",
  "family",
  "weight",
  "size",
  "lineHeight",
  "color",
  "x",
  "y",
  "width",
  "height",
  "align",
  "verticalAlign",
  "cameraAware",
  "wrap",
  "overflow",
  "maxLines",
  "minScale",
  "fadeInUntil",
  "maxScale",
  "part",
  "levelMask",
] as const satisfies readonly TTextField[];

/** A field of the text primitive that `TEXT_FIELDS` misses: the check below then fails to compile. */
type TUncompared = Exclude<TTextField, (typeof TEXT_FIELDS)[number]>;

/** Compiles only while `TEXT_FIELDS` names every field of a text primitive. */
export const TEXT_FIELDS_COMPLETE: [TUncompared] extends [never] ? true : TUncompared = true;

/** Camera-aware modes compared by value: a clamp object by its entries, anything else by identity. */
function sameCameraAware(a: TSceneCameraAware | undefined, b: TSceneCameraAware | undefined): boolean {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return Object.is(a, b);
  return Object.is(a.minWorld, b.minWorld) && Object.is(a.maxWorld, b.maxWorld);
}

/**
 * Whether two text primitives encode to the same glyph floats at one scale and policy: every field of the type
 * (`TEXT_FIELDS`) equal by `Object.is` (so 0 and -0 differ, as their floats do), a `cameraAware` object by its
 * entries. The encoders read nothing else, and an unset field reads as one set to undefined.
 */
export function sameText(a: TTextPrimitive, b: TTextPrimitive): boolean {
  return a === b || (sameLayoutFields(a, b) && sameDrawFields(a, b));
}

/** The fields the layout reads: the text, its font, its box and how it wraps (`layoutText`, `placeText`). */
function sameLayoutFields(a: TTextPrimitive, b: TTextPrimitive): boolean {
  return (
    Object.is(a.text, b.text) &&
    Object.is(a.family, b.family) &&
    Object.is(a.weight, b.weight) &&
    Object.is(a.size, b.size) &&
    sameCameraAware(a.cameraAware, b.cameraAware) &&
    Object.is(a.lineHeight, b.lineHeight) &&
    Object.is(a.x, b.x) &&
    Object.is(a.y, b.y) &&
    Object.is(a.width, b.width) &&
    Object.is(a.height, b.height) &&
    Object.is(a.align, b.align) &&
    Object.is(a.verticalAlign, b.verticalAlign) &&
    Object.is(a.wrap, b.wrap) &&
    Object.is(a.overflow, b.overflow) &&
    Object.is(a.maxLines, b.maxLines)
  );
}

/** The fields only the glyph instances read: the paint, the scale range, the part and the levels. */
function sameDrawFields(a: TTextPrimitive, b: TTextPrimitive): boolean {
  return (
    Object.is(a.color, b.color) &&
    Object.is(a.minScale, b.minScale) &&
    Object.is(a.fadeInUntil, b.fadeInUntil) &&
    Object.is(a.maxScale, b.maxScale) &&
    Object.is(a.part, b.part) &&
    Object.is(a.levelMask, b.levelMask)
  );
}

/** The element's text primitives in primitive order, and their subs: `subBase` plus their index in the element. */
export function textsOf(
  primitives: readonly TScenePrimitive[],
  subBase: number
): { texts: TTextPrimitive[]; subs: number[] } {
  const texts: TTextPrimitive[] = [];
  const subs: number[] = [];
  for (let index = 0; index < primitives.length; index++) {
    const primitive = primitives[index];
    if (primitive.kind !== "text") continue;
    texts.push(primitive);
    subs.push(subBase + index);
  }
  return { texts, subs };
}

/**
 * How the texts of the element at `index`, whose primitives' subs start at `subBase`, are encoded against its last text
 * encode (`TTextPlan`). `layoutsCurrent` says whether the last encode's layouts and policy are those an encode would
 * use now (the backend's text frame); stale ones encode again. Allocates nothing.
 */
export function planTextEncode(
  last: TTextEncode | undefined,
  index: number,
  primitives: readonly TScenePrimitive[],
  subBase: number,
  layoutsCurrent: (last: TTextEncode) => boolean = () => true
): TTextPlan {
  if (!last || last.index !== index) return "encode";
  let text = 0;
  let moved = false;
  for (let at = 0; at < primitives.length; at++) {
    const primitive = primitives[at];
    if (primitive.kind !== "text") continue;
    if (text === last.texts.length || !sameText(last.texts[text], primitive)) return "encode";
    if (last.subs[text] !== subBase + at) moved = true;
    text++;
  }
  if (text !== last.texts.length || !layoutsCurrent(last)) return "encode";
  return moved ? "resub" : "keep";
}

/**
 * After a `"keep"` or a `"resub"`: the last encode takes the new texts (equal to its own, but the objects in use, so it
 * keeps no stale ones alive) and their subs, in place.
 */
export function adoptTexts(last: TTextEncode, primitives: readonly TScenePrimitive[], subBase: number): void {
  let text = 0;
  for (let at = 0; at < primitives.length; at++) {
    const primitive = primitives[at];
    if (primitive.kind !== "text") continue;
    last.texts[text] = primitive;
    last.subs[text] = subBase + at;
    text++;
  }
}

/**
 * Writes each text's sub into the subs of its glyphs (`TEncodedGlyphs.subs`, one float per glyph instance), the glyphs
 * of the texts lying text after text, `glyphs[i]` of text `i`, from the first float of `glyphSubs` on.
 */
export function resubGlyphs(glyphSubs: Float32Array, glyphs: readonly number[], subs: readonly number[]): void {
  let at = 0;
  for (let text = 0; text < glyphs.length; text++) {
    const end = at + glyphs[text];
    glyphSubs.fill(subs[text], at, end);
    at = end;
  }
}
