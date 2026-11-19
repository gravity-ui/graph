import { ALL_LEVELS_MASK } from "../levels";
import { ELLIPSIS, TEXT_METRICS_PX, isCameraAwareText, textAnchor, textClip } from "../textLayout";
import type { ISceneTextMetrics, TTextLayout } from "../textLayout";
import type { TScenePrimitive, TSceneSize, TSceneTextPolicy } from "../types";

import {
  MAX_SUB,
  checkSub,
  createInstanceLists,
  isTranslucentPaint,
  paintFloats,
  scaleBound,
  takeLists,
  writeSize,
} from "./encodeRects";
import type { TEncodedInstances, TSlotOf } from "./encodeRects";
import { ATLAS_FONT_PX, GLYPH_RUN_FLOATS, glyphCapacity, glyphRun, hasSurrogatePair } from "./glyphs";
import type { GlyphAtlas, TGlyphRun } from "./glyphs";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/** A valid fade keeps one resident record shared by the blended and completed opaque draw views. */
function fadeInUntil(primitive: TTextPrimitive): number | undefined {
  const end = primitive.fadeInUntil;
  return end !== undefined && Number.isFinite(end) && end > (primitive.minScale ?? 0) ? end : undefined;
}

/** Text whose glyphs need painter ordering, including a camera-driven fade over an opaque paint. */
export function isTranslucentText(primitive: TTextPrimitive): boolean {
  return fadeInUntil(primitive) !== undefined || isTranslucentPaint(primitive.color);
}

/** Floats per glyph instance; floats 1, 3, 23 and 27 hold the text's clip box (`GLYPH_VERTEX`). */
export const GLYPH_FLOATS = 28;

/** Floats per glyph sub instance: the sub alone. */
export const GLYPH_SUB_FLOATS = 1;

const NO_LIMIT = 1e9;

/**
 * The smallest scale a hidden glyph (`writeTextGlyphs`) shows at: never reached, so its scale range is empty and the
 * vertex shader moves its quad out of the clip volume (`sceneShown`): it draws no pixel and writes no depth.
 */
const HIDDEN_MIN_SCALE = NO_LIMIT;

const GLYPH_LISTS = createInstanceLists(GLYPH_FLOATS);

const SUB_LISTS = createInstanceLists(GLYPH_SUB_FLOATS);

/**
 * Glyph instances split by translucency, and the sub of each glyph in a list of its own per pass, in step with them:
 * `subs.opaque[i]` is the depth sub-order of the opaque glyph instance `i`. The backend keeps the subs in a GPU buffer
 * of their own, so a re-sub of unchanged texts writes and uploads only them. As in `TEncodedInstances`, the opaque
 * glyphs and their subs are views of the encoder's lists, valid until the next `encodeText`; the translucent ones are
 * copies.
 */
export type TEncodedGlyphs = TEncodedInstances & { readonly subs: TEncodedInstances };

/**
 * How texts are laid out for an encode: the policy (the `cameraAwareText` setting) and each text's shared layout at
 * the scale the backend draws next (`textLayout.ts`), with the metrics it was measured with.
 */
export type TTextEncodeInput = {
  readonly policy: TSceneTextPolicy;
  readonly metrics: ISceneTextMetrics;
  layoutOf(primitive: TTextPrimitive): TTextLayout;
};

/**
 * Where an encode put each text's glyph instances, in primitive order: how many (`counts`), whether in the translucent
 * pass (`translucent`), the first of them in the list of that pass (`firsts`, when given) and how many its lines placed
 * (`placed`, when given; the others are hidden).
 */
export type TTextGlyphPlaces = { counts: number[]; translucent: boolean[]; firsts?: number[]; placed?: number[] };

/** The `(mode, value, min, max)` of a text's size, written once per text and copied into each glyph. */
const sizeRow = new Float32Array(4);

/** A text's size as the shader resolves it (`sceneSize`): pixels clamped by world units when camera-aware. */
function shaderSize(primitive: TTextPrimitive, policy: TSceneTextPolicy): TSceneSize {
  if (!isCameraAwareText(primitive, policy)) return primitive.size;
  const mode = primitive.cameraAware;
  return typeof mode === "object" ? { px: primitive.size, ...mode } : { px: primitive.size };
}

/** The clip box of a text whose layout fits its box: none. */
const NO_CLIP = Object.freeze({ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity });

/** A clip bound for a shader: an unbounded side becomes `±NO_LIMIT`. */
function clipBound(value: number): number {
  return Math.max(-NO_LIMIT, Math.min(NO_LIMIT, value));
}

/**
 * The glyph instances a text keeps in its pass: a camera-aware text (by its own mode, whatever the policy) keeps
 * `glyphCapacity` of them whatever its line breaks, the glyphs of its lines first and hidden ones after them, so a
 * break change or the policy rewrites them in place; a world text keeps the glyphs of its lines (its lines change
 * only with the metrics). Never fewer than the run places.
 */
export function textGlyphCount(primitive: TTextPrimitive, run: TGlyphRun): number {
  const placed = run.glyphs.length / GLYPH_RUN_FLOATS;
  return primitive.cameraAware ? Math.max(placed, glyphCapacity(primitive.text)) : placed;
}

/** What one text's glyphs are written with besides its run: its element, its paint slot and the policy. */
export type TTextGlyphTarget = {
  readonly elementIndex: number;
  readonly slot: number;
  readonly policy: TSceneTextPolicy;
  readonly atlas: GlyphAtlas;
};

/**
 * Writes `count` glyph instances of a text into `out` from float `at`: the glyphs of its run (`glyphRun` of its
 * `layout`), then hidden ones up to `count` (the element and the slot, an empty scale range from `HIDDEN_MIN_SCALE`,
 * zeros).
 * A full encode and a re-layout in place write the same floats. Each glyph carries its text's anchor
 * (`glyph_origin`), its quad at `TEXT_METRICS_PX` from that anchor, its size as the shader resolves it and its clip
 * box (the text's box when its layout overflows it, as Canvas2D clips; unbounded otherwise, so glyph ink overhangs as
 * in v1).
 */
export function writeTextGlyphs(
  out: Float32Array,
  at: number,
  count: number,
  primitive: TTextPrimitive,
  layout: TTextLayout,
  run: TGlyphRun,
  target: TTextGlyphTarget
): void {
  const { elementIndex, slot, policy, atlas } = target;
  // The atlas glyphs are drawn at ATLAS_FONT_PX: k scales them to TEXT_METRICS_PX, the size of the runs.
  const k = TEXT_METRICS_PX / ATLAS_FONT_PX;
  const color = paintFloats(primitive.color);
  const { glyphs } = run;
  const anchor = textAnchor(primitive, layout.lines.length);
  const clip = layout.overflows ? textClip(primitive) : NO_CLIP;
  writeSize(sizeRow, 0, shaderSize(primitive, policy));
  const minScale = scaleBound(primitive.minScale, 0);
  const maxScale = scaleBound(primitive.maxScale, NO_LIMIT);
  const fadeEnd = fadeInUntil(primitive) ?? minScale;
  const levelMask = primitive.levelMask ?? ALL_LEVELS_MASK;
  const placed = glyphs.length / GLYPH_RUN_FLOATS;
  if (placed > count) throw new RangeError(`A text places ${placed} glyphs, past the ${count} it keeps`);
  let offset = at;
  for (let glyphAt = 0; glyphAt < glyphs.length; glyphAt += GLYPH_RUN_FLOATS) {
    const glyph = atlas.glyphAt(glyphs[glyphAt + 2]);
    out[offset] = elementIndex;
    out[offset + 1] = clipBound(clip.minX);
    out[offset + 2] = slot;
    out[offset + 3] = clipBound(clip.maxX);
    out[offset + 4] = glyphs[glyphAt];
    out[offset + 5] = glyphs[glyphAt + 1];
    out[offset + 6] = glyph.width * k;
    out[offset + 7] = glyph.height * k;
    out[offset + 8] = glyph.u0;
    out[offset + 9] = glyph.v0;
    out[offset + 10] = glyph.u1;
    out[offset + 11] = glyph.v1;
    out[offset + 12] = color[0];
    out[offset + 13] = color[1];
    out[offset + 14] = color[2];
    out[offset + 15] = color[3];
    out.set(sizeRow, offset + 16);
    // The shader scales the quad about the anchor: world = element + anchor + quad x resolved size / TEXT_METRICS_PX.
    out[offset + 20] = anchor.x;
    out[offset + 21] = anchor.y;
    out[offset + 22] = fadeEnd;
    out[offset + 23] = clipBound(clip.minY);
    out[offset + 24] = minScale;
    out[offset + 25] = maxScale;
    out[offset + 26] = levelMask;
    out[offset + 27] = clipBound(clip.maxY);
    offset += GLYPH_FLOATS;
  }
  // Hidden glyphs: the capacity the lines do not use.
  out.fill(0, offset, at + count * GLYPH_FLOATS);
  for (; offset < at + count * GLYPH_FLOATS; offset += GLYPH_FLOATS) {
    out[offset] = elementIndex;
    out[offset + 2] = slot;
    out[offset + 24] = HIDDEN_MIN_SCALE;
  }
}

/**
 * Text primitives as glyph instances (`writeTextGlyphs`: a camera-aware text keeps a fixed count, `textGlyphCount`),
 * split by translucency, with each glyph's sub in the sub list of its pass. An unset colour is written as
 * `USE_BASE`. `sub` is `subBase` plus the index in the element. Each text's glyphs come from `glyphRun` of its lines
 * from `text.layoutOf`; a camera-aware text also packs every glyph it may show at another size (`GlyphAtlas.prefill`:
 * the characters its lines did not place, and the ellipsis).
 *
 * @param subBase The depth sub-order of the first primitive: a child element's primitives follow its parent's and its
 * earlier siblings'.
 * @param maxSub The largest sub the depth keys leave room for (`checkSub`).
 * @param places Gets where each text's glyph instances went, in primitive order (`TTextGlyphPlaces`).
 */
export function encodeText(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  slotOf: TSlotOf,
  atlas: GlyphAtlas,
  text: TTextEncodeInput,
  subBase = 0,
  maxSub = MAX_SUB,
  places?: TTextGlyphPlaces
): TEncodedGlyphs {
  const { opaque, translucent } = takeLists(GLYPH_LISTS);
  const subs = takeLists(SUB_LISTS);
  for (let sub = 0; sub < primitives.length; sub++) {
    const primitive = primitives[sub];
    if (primitive.kind !== "text") continue;
    const at = subBase + sub;
    checkSub(at, maxSub);
    const isTranslucent = isTranslucentText(primitive);
    const list = isTranslucent ? translucent : opaque;
    const subList = isTranslucent ? subs.translucent : subs.opaque;
    const layout = text.layoutOf(primitive);
    const run = glyphRun(primitive, layout, atlas, text.metrics);
    const count = textGlyphCount(primitive, run);
    // Lines that place fewer glyphs than the text has characters, or end with an ellipsis, leave some unpacked, as
    // does a surrogate pair (drawn whole or as two halves, whatever these lines place): pack them, and the ellipsis.
    if (primitive.cameraAware) {
      const weight = primitive.weight ?? "normal";
      const last = layout.lines[layout.lines.length - 1];
      const cut = last !== undefined && last.endsWith(ELLIPSIS);
      if (cut || run.glyphs.length / GLYPH_RUN_FLOATS < count - 1 || hasSurrogatePair(primitive.text))
        atlas.prefill(primitive.text, primitive.family, weight);
      else atlas.glyph(ELLIPSIS, primitive.family, weight);
    }
    const first = list.claim(count);
    places?.counts.push(count);
    places?.firsts?.push(first / GLYPH_FLOATS);
    places?.translucent.push(isTranslucent);
    places?.placed?.push(run.glyphs.length / GLYPH_RUN_FLOATS);
    const target: TTextGlyphTarget = { elementIndex, slot: slotOf(primitive.part), policy: text.policy, atlas };
    writeTextGlyphs(list.buffer, first, count, primitive, layout, run, target);
    const subAt = subList.claim(count);
    subList.buffer.fill(at, subAt, subAt + count);
  }
  return {
    opaque: opaque.view(),
    translucent: translucent.toArray(),
    subs: { opaque: subs.opaque.view(), translucent: subs.translucent.toArray() },
  };
}
