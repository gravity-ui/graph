import { isLayoutValid, resolveTextSize } from "../textLayout";
import type { ISceneTextMetrics, TTextLayout } from "../textLayout";
import type { TScenePrimitive, TSceneTextPolicy } from "../types";

import type { TSceneBackendStats } from "./backendTypes";
import { GLYPH_FLOATS } from "./encodeText";
import { GLYPH_RUN_FLOATS } from "./glyphs";
import type { TGlyphRun } from "./glyphs";
import { firstGlyphOf, sameGlyphLayout } from "./textEncodes";
import type { TTextEncode } from "./textEncodes";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

const FLOAT_BYTES = 4;

/** The counters of an in-place re-layout among the backend's stats. */
export type TTextRelayoutStats = Pick<
  TSceneBackendStats,
  | "textRelayouts"
  | "lastTextRelayouts"
  | "lastTextRelayoutGlyphs"
  | "lastTextRelayoutBytes"
  | "lastTextRelayoutWrittenBytes"
  | "lastTextRelayoutDrawnBytes"
  | "lastTextRelayoutsKept"
>;

/** What an in-place re-layout of one element's camera-aware texts asks of its owner (the WebGL backend). */
export interface ITextRelayoutHost {
  /** The metrics the layouts are measured with (`isLayoutValid`). */
  readonly metrics: ISceneTextMetrics;
  /** The text's layout at a resolved size (`sceneTextLayout`). */
  layout(text: TTextPrimitive, size: number): TTextLayout;
  /** The glyphs that layout places (`glyphRun`). */
  run(text: TTextPrimitive, layout: TTextLayout): TGlyphRun;
  /**
   * Writes the first `written` glyph slots of text `at` of `encode` for `layout` and `run`, in place in its pass from
   * its glyph `first` on (`InstanceRanges.editSpan`); false, writing nothing, when the pass does not hold them.
   */
  edit(encode: TTextEncode, at: number, first: number, written: number, layout: TTextLayout, run: TGlyphRun): boolean;
  /**
   * Re-encodes the element's glyphs instead (`rewriteGlyphs`), against its last encode as it was before this call:
   * the previous layouts and policy, so the re-encode counts the texts whose glyphs it changed.
   */
  rewrite(): void;
}

/** A camera-aware text whose glyphs change: its new layout and run. */
type TRelaidText = { at: number; layout: TTextLayout; run: TGlyphRun };

/**
 * Lays an element's camera-aware texts out for a frame (`scale`, `policy`) and rewrites, in place, the glyphs of each
 * whose glyphs change (`sameGlyphLayout`; under another policy every one): its glyph count stays (`textGlyphCount`),
 * and only its slots up to the larger of the glyphs its lines placed before and place now are written.
 *
 * The element's path is decided before anything is committed. A text that would place more glyphs than it keeps, or
 * an edit its pass refuses, makes the host re-encode the element instead (`ITextRelayoutHost.rewrite`). The
 * re-encode gets the last encode untouched, so it compares against the previous layouts and policy and does its own
 * counting. Only once every edit succeeded does the re-layout commit the layouts, the placed counts, the policy and
 * its counters, each once. The lists are reused: each call allocates one record per text it rewrites.
 */
export class TextRelayout {
  private readonly changed: TRelaidText[] = [];
  private readonly keptAt: number[] = [];
  private readonly keptLayouts: TTextLayout[] = [];

  public relayout(
    encode: TTextEncode,
    scale: number,
    policy: TSceneTextPolicy,
    host: ITextRelayoutHost,
    stats: TTextRelayoutStats
  ): void {
    const { placed } = encode;
    if (!placed) {
      host.rewrite();
      return;
    }
    const { changed, keptAt, keptLayouts } = this;
    try {
      const policyChanged = encode.policy.cameraAware !== policy.cameraAware;
      // Every new layout and run first, so a text past its glyph count re-encodes before anything is written.
      for (let at = 0; at < encode.texts.length; at++) {
        const text = encode.texts[at];
        if (!text.cameraAware) continue;
        const size = resolveTextSize(text, scale, policy);
        const last = encode.layouts[at];
        if (!policyChanged && last && isLayoutValid(last, size, host.metrics)) continue;
        const layout = host.layout(text, size);
        if (!policyChanged && last && sameGlyphLayout(last, layout)) {
          keptAt.push(at);
          keptLayouts.push(layout);
          continue;
        }
        const run = host.run(text, layout);
        if (run.glyphs.length / GLYPH_RUN_FLOATS > encode.glyphs[at]) {
          host.rewrite();
          return;
        }
        changed.push({ at, layout, run });
      }
      // The writes: a refused one re-encodes the element, over the texts already written.
      for (const { at, layout, run } of changed) {
        const written = Math.max(placed[at], run.glyphs.length / GLYPH_RUN_FLOATS);
        if (written > 0 && !host.edit(encode, at, firstGlyphOf(encode, at), written, layout, run)) {
          host.rewrite();
          return;
        }
      }
      encode.policy = policy;
      for (let i = 0; i < keptAt.length; i++) encode.layouts[keptAt[i]] = keptLayouts[i];
      stats.lastTextRelayoutsKept += keptAt.length;
      for (const { at, layout, run } of changed) {
        const now = run.glyphs.length / GLYPH_RUN_FLOATS;
        const written = Math.max(placed[at], now);
        encode.layouts[at] = layout;
        placed[at] = now;
        stats.textRelayouts++;
        stats.lastTextRelayouts++;
        stats.lastTextRelayoutGlyphs += encode.glyphs[at];
        stats.lastTextRelayoutBytes += encode.glyphs[at] * GLYPH_FLOATS * FLOAT_BYTES;
        stats.lastTextRelayoutWrittenBytes += written * GLYPH_FLOATS * FLOAT_BYTES;
        stats.lastTextRelayoutDrawnBytes += now * GLYPH_FLOATS * FLOAT_BYTES;
      }
    } finally {
      changed.length = 0;
      keptAt.length = 0;
      keptLayouts.length = 0;
    }
  }
}
