import { DEFAULT_TEXT_POLICY, layoutText, resolveTextSize } from "../../textLayout";
import type { ISceneTextMetrics, TTextLayout } from "../../textLayout";
import type { TScenePrimitive } from "../../types";
import { GLYPH_FLOATS, encodeText } from "../encodeText";
import type { TTextEncodeInput, TTextGlyphPlaces } from "../encodeText";
import { GlyphAtlas } from "../glyphs";
import {
  TEXT_FIELDS,
  TEXT_FIELDS_COMPLETE,
  adoptTexts,
  firstGlyphOf,
  planTextEncode,
  resubGlyphs,
  sameGlyphLayout,
  sameText,
  textsOf,
} from "../textEncodes";
import type { TTextEncode } from "../textEncodes";

type TText = Extract<TScenePrimitive, { kind: "text" }>;

function atlas(): GlyphAtlas {
  return new GlyphAtlas(
    (char) => ({
      data: new Uint8ClampedArray(100),
      width: 10,
      height: 10,
      glyphLeft: char.charCodeAt(0) % 3,
      glyphTop: 0,
      glyphWidth: 10,
      glyphHeight: 10,
      glyphAdvance: 8 + (char.charCodeAt(0) % 5),
    }),
    256
  );
}

const slotOf = (part: string | undefined): number => (part === "title" ? 3 : 0);

/** Half the font size per character at TEXT_METRICS_PX, the baseline 0.8 of it below a line's top. */
const metrics: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };

/** Texts laid out at a camera scale with the default policy; `layouts` gets each layout. */
function input(scale = 1, layouts: TTextLayout[] = []): TTextEncodeInput {
  return {
    policy: DEFAULT_TEXT_POLICY,
    metrics,
    layoutOf: (primitive) => {
      const layout = layoutText(primitive, resolveTextSize(primitive, scale, DEFAULT_TEXT_POLICY), metrics);
      layouts.push(layout);
      return layout;
    },
  };
}

function text(value: string, extra: Partial<TText> = {}): TText {
  return {
    kind: "text",
    text: value,
    family: "f",
    size: 12,
    cameraAware: { maxWorld: 20 },
    lineHeight: 14,
    color: "#123456",
    x: 4,
    y: 6,
    width: 60,
    height: 30,
    align: "center",
    part: "title",
    ...extra,
  };
}

function rect(width: number): TScenePrimitive {
  return { kind: "rect", x: 0, y: 0, width, height: 10, fill: "#eee", border: { color: "#ccc", width: { px: 1 } } };
}

/** A deep copy of plain objects and arrays, keys set to undefined included. */
function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)]));
  }
  return value;
}

/** A fresh, equal copy of each primitive: what a level method returns on every run. */
function copies(primitives: readonly TScenePrimitive[]): TScenePrimitive[] {
  return primitives.map((primitive) => copy(primitive) as TScenePrimitive);
}

/** The last text encode of `primitives` as the backend keeps it, and the opaque glyphs and glyph subs it wrote. */
function encodeOnce(
  primitives: readonly TScenePrimitive[],
  index: number,
  subBase: number,
  glyphAtlas: GlyphAtlas
): { last: TTextEncode; opaque: Float32Array; glyphSubs: Float32Array } {
  const places: TTextGlyphPlaces = { counts: [], firsts: [], translucent: [] };
  const layouts: TTextLayout[] = [];
  const encoded = encodeText(primitives, index, slotOf, glyphAtlas, input(1, layouts), subBase, undefined, places);
  expect(encoded.translucent).toHaveLength(0);
  const { texts, subs } = textsOf(primitives, subBase);
  const last: TTextEncode = {
    index,
    texts,
    subs,
    glyphs: places.counts,
    translucent: undefined,
    layouts,
    policy: DEFAULT_TEXT_POLICY,
    generation: 0,
  };
  // Copies: the opaque glyphs and subs are views that the next encode overwrites.
  return { last, opaque: encoded.opaque.slice(), glyphSubs: encoded.subs.opaque.slice() };
}

/** The bits of a float list: equal floats bit for bit, not only by value (0 and -0 apart). */
function bitsOf(floats: ArrayLike<number>): Uint32Array {
  return new Uint32Array(Float32Array.from(floats).buffer);
}

describe("textEncodes", () => {
  it("re-encodes an explicitly changed fade range and keeps equal immutable text descriptions", () => {
    const plain = text("a");
    const { last } = encodeOnce([plain], 0, 0, atlas());
    const fading = { ...plain, fadeInUntil: 0.3 };
    expect(sameText(plain, fading)).toBe(false);
    expect(sameText(fading, { ...fading })).toBe(true);
    expect(sameText(fading, { ...fading, fadeInUntil: 0.4 })).toBe(false);
    expect(planTextEncode(last, 0, [fading], 0)).toBe("encode");
  });

  it("lists an element's texts in primitive order with their subs", () => {
    const a = text("a");
    const b = text("b");
    expect(textsOf([rect(1), a, rect(2), b], 5)).toEqual({ texts: [a, b], subs: [6, 8] });
    expect(textsOf([rect(1)], 0)).toEqual({ texts: [], subs: [] });
  });

  it("compares texts by every field of the type, a camera-aware mode by its clamps, -0 apart from 0", () => {
    const full = text("a", {
      weight: "bold",
      verticalAlign: "middle",
      minScale: 0.1,
      fadeInUntil: 0.3,
      maxScale: 2,
      levelMask: 3,
      cameraAware: { minWorld: 4, maxWorld: 30 },
      wrap: true,
      overflow: "clip",
      maxLines: 3,
    });
    expect(sameText(full, copy(full) as TText)).toBe(true);
    const changed: Record<string, unknown> = {
      text: "b",
      family: "g",
      weight: "normal",
      size: 13,
      lineHeight: 15,
      color: "#000000",
      x: 5,
      y: 7,
      width: 61,
      height: 31,
      align: "left",
      verticalAlign: "bottom",
      cameraAware: { minWorld: 4, maxWorld: 31 },
      wrap: false,
      overflow: "ellipsis",
      maxLines: 2,
      minScale: 0.2,
      fadeInUntil: 0.4,
      maxScale: 3,
      part: "other",
      levelMask: 1,
    };
    for (const field of TEXT_FIELDS) {
      expect(Object.keys(changed)).toContain(field);
      expect(sameText(full, { ...full, [field]: changed[field] })).toBe(false);
      expect(sameText(full, { ...full, [field]: undefined })).toBe(false);
    }
    expect(Object.keys(changed)).toHaveLength(TEXT_FIELDS.length);
    expect(TEXT_FIELDS_COMPLETE).toBe(true);
    expect(sameText(text("a", { cameraAware: true }), text("a", { cameraAware: {} }))).toBe(false);
    expect(sameText(text("a", { cameraAware: false }), text("a", { cameraAware: undefined }))).toBe(false);
    expect(sameText(text("a", { cameraAware: { minWorld: 1 } }), text("a", { cameraAware: { minWorld: 1 } }))).toBe(
      true
    );
    expect(sameText(text("a", { x: 0 }), text("a", { x: -0 }))).toBe(false);
    // An unset field reads as one set to undefined, in the encoders too.
    expect(sameText(text("a"), text("a", { weight: undefined }))).toBe(true);
  });

  it("plans keep for the same texts at the same subs, resub for other subs, encode for anything else", () => {
    const primitives = [rect(1), text("name"), text("sub", { part: undefined, size: 9 })];
    const { last } = encodeOnce(primitives, 4, 0, atlas());
    const plan = (next: readonly TScenePrimitive[], index = 4, subBase = 0): string =>
      planTextEncode(last, index, next, subBase);
    expect(plan(copies(primitives))).toBe("keep");
    // Another rect does not touch the texts.
    expect(plan([rect(2), ...copies(primitives).slice(1)])).toBe("keep");
    expect(plan([rect(1), rect(2), ...copies(primitives).slice(1)])).toBe("resub");
    expect(plan(copies(primitives).slice(1))).toBe("resub");
    expect(plan(copies(primitives), 4, 3)).toBe("resub");
    expect(plan(copies(primitives), 5)).toBe("encode");
    expect(plan([rect(1), text("name!"), primitives[2]])).toBe("encode");
    expect(plan([rect(1), text("name", { color: "#654321" }), primitives[2]])).toBe("encode");
    expect(plan([rect(1), text("name", { y: 7 }), primitives[2]])).toBe("encode");
    expect(plan([rect(1), primitives[1]])).toBe("encode");
    expect(plan([...copies(primitives), text("more")])).toBe("encode");
    expect(plan([rect(1), primitives[2], primitives[1]])).toBe("encode");
    expect(planTextEncode(undefined, 4, [], 0)).toBe("encode");
    const none = encodeOnce([rect(1)], 2, 0, atlas()).last;
    expect(planTextEncode(none, 2, [rect(5)], 0)).toBe("keep");
    expect(planTextEncode(none, 2, [text("a")], 0)).toBe("encode");
    // Layouts that are no longer current (another scale's line breaks, or another policy) encode again.
    expect(planTextEncode(last, 4, copies(primitives), 0, () => false)).toBe("encode");
  });

  it("adopts the texts in use and their subs in place", () => {
    const primitives = [rect(1), text("name"), text("sub")];
    const { last } = encodeOnce(primitives, 4, 0, atlas());
    const { texts, subs } = last;
    const next = [rect(1), rect(2), ...copies(primitives).slice(1)];
    adoptTexts(last, next, 3);
    expect(last.texts).toBe(texts);
    expect(last.subs).toBe(subs);
    expect(last.texts[0]).toBe(next[2]);
    expect(last.texts[1]).toBe(next[3]);
    expect(last.subs).toEqual([5, 6]);
  });

  it("keeps and resubs to exactly the floats of a full encode: glyphs untouched, only their subs re-written", () => {
    const glyphAtlas = atlas();
    const before = [rect(1), text("Block name"), text(""), text("a b c", { part: undefined, size: 9, align: "left" })];
    const cases: { next: TScenePrimitive[]; subBase: number }[] = [
      { next: copies(before), subBase: 0 },
      { next: [rect(1), rect(2), ...copies(before).slice(1)], subBase: 0 },
      { next: copies(before).slice(1), subBase: 0 },
      { next: [...copies(before.slice(0, 2)), rect(3), ...copies(before.slice(2))], subBase: 0 },
      { next: copies(before), subBase: 7 },
    ];
    const plans: string[] = [];
    for (const { next, subBase } of cases) {
      const { last, opaque, glyphSubs } = encodeOnce(before, 9, 0, glyphAtlas);
      const plan = planTextEncode(last, 9, next, subBase);
      plans.push(plan);
      expect(plan === "keep" || plan === "resub").toBe(true);
      adoptTexts(last, next, subBase);
      const reusedSubs = glyphSubs.slice();
      if (plan === "resub") resubGlyphs(reusedSubs, last.glyphs, last.subs);
      const fresh = encodeText(next, 9, slotOf, glyphAtlas, input(), subBase);
      expect(fresh.translucent).toHaveLength(0);
      // The glyph instances a keep or a resub leaves as they are; their subs as a resub writes them.
      expect(bitsOf(opaque)).toEqual(bitsOf(fresh.opaque));
      expect(bitsOf(reusedSubs)).toEqual(bitsOf(fresh.subs.opaque));
      if (plan === "resub") expect(bitsOf(glyphSubs)).not.toEqual(bitsOf(fresh.subs.opaque));
    }
    expect(plans).toEqual(["keep", "resub", "resub", "resub", "resub"]);
  });

  it("counts the glyph instances of each text, in either pass, and where they lie in its pass", () => {
    const places: TTextGlyphPlaces = { counts: [], firsts: [], translucent: [] };
    const translucentText = { color: "rgba(0, 0, 0, 0.5)" };
    const { opaque, translucent } = encodeText(
      [text("ab"), rect(1), text(" "), text("c d e", translucentText), text("fg"), text("h", translucentText)],
      0,
      slotOf,
      atlas(),
      input(),
      0,
      undefined,
      places
    );
    // Camera-aware texts keep a glyph per character that can draw one, and one for the ellipsis.
    expect(places).toEqual({
      counts: [3, 1, 4, 3, 2],
      firsts: [0, 3, 0, 4, 4],
      translucent: [false, false, true, false, true],
    });
    expect(opaque).toHaveLength(7 * GLYPH_FLOATS);
    expect(translucent).toHaveLength(6 * GLYPH_FLOATS);
    // firstGlyphOf finds the same places from the counts and passes an encode keeps.
    const { texts, subs } = textsOf([text("ab"), text(" "), text("c d e"), text("fg"), text("h")], 0);
    const encode: TTextEncode = {
      index: 0,
      texts,
      subs,
      glyphs: places.counts,
      translucent: places.translucent,
      layouts: [],
      policy: DEFAULT_TEXT_POLICY,
      generation: 0,
    };
    expect(places.counts.map((_, at) => firstGlyphOf(encode, at))).toEqual(places.firsts);
    expect(firstGlyphOf({ ...encode, translucent: undefined }, 3)).toBe(8);
  });

  it("tells layouts that place the same glyphs: lines and clip, and the size for widths measured at it", () => {
    const layout = (patch: Partial<TTextLayout> = {}): TTextLayout => ({
      size: 12,
      lines: ["Load the", "daily"],
      widths: [400, 250],
      maxWidth: 400,
      overflows: false,
      minSize: 10,
      maxSize: 13,
      generation: 0,
      linear: true,
      ...patch,
    });
    const base = layout();
    // Linear widths: another size and range with the same lines and clip place the same glyphs.
    expect(sameGlyphLayout(base, layout({ size: 14, minSize: 13.5, maxSize: 15, widths: [401, 250] }))).toBe(true);
    expect(sameGlyphLayout(base, layout({ lines: ["Load the daily"] }))).toBe(false);
    expect(sameGlyphLayout(base, layout({ lines: ["Load the", "dail…"] }))).toBe(false);
    expect(sameGlyphLayout(base, layout({ overflows: true }))).toBe(false);
    expect(sameGlyphLayout(base, layout({ generation: 1 }))).toBe(false);
    // Widths measured at the size (a font that does not scale linearly): only the same size places the same glyphs.
    const measured = layout({ linear: false, minSize: 12, maxSize: 12 });
    expect(sameGlyphLayout(measured, layout({ linear: false, minSize: 12, maxSize: 12 }))).toBe(true);
    expect(sameGlyphLayout(measured, layout({ linear: false, size: 12.5, minSize: 12.5, maxSize: 12.5 }))).toBe(false);
    expect(sameGlyphLayout(measured, base)).toBe(false);
  });

  it("writes each text's sub into the subs of its glyphs and nothing else", () => {
    const glyphSubs = new Float32Array(6).fill(100);
    resubGlyphs(glyphSubs, [2, 0, 3], [7, 8, 9]);
    expect(Array.from(glyphSubs)).toEqual([7, 7, 9, 9, 9, 100]);
  });
});
