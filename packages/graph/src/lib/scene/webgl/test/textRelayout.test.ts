import { DEFAULT_TEXT_POLICY, layoutText, resolveTextSize } from "../../textLayout";
import type { ISceneTextMetrics, TTextLayout } from "../../textLayout";
import type { TScenePrimitive, TSceneTextPolicy } from "../../types";
import { GLYPH_FLOATS, encodeText } from "../encodeText";
import type { TTextGlyphPlaces } from "../encodeText";
import { GlyphAtlas, glyphRun } from "../glyphs";
import type { TTextEncode } from "../textEncodes";
import { TextRelayout } from "../textRelayout";
import type { ITextRelayoutHost, TTextRelayoutStats } from "../textRelayout";

type TText = Extract<TScenePrimitive, { kind: "text" }>;

const GLYPH_BYTES = GLYPH_FLOATS * 4;

/** Half the font size per character at TEXT_METRICS_PX, the baseline 0.8 of the size below a line's top. */
const metrics: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };

const OFF: TSceneTextPolicy = { ...DEFAULT_TEXT_POLICY, cameraAware: false };

function atlas(): GlyphAtlas {
  return new GlyphAtlas(
    () => ({
      data: new Uint8ClampedArray(100),
      width: 10,
      height: 10,
      glyphLeft: 0,
      glyphTop: 0,
      glyphWidth: 10,
      glyphHeight: 10,
      glyphAdvance: 10,
    }),
    128
  );
}

function text(patch: Partial<TText> = {}): TText {
  return {
    kind: "text",
    text: "a",
    family: "f",
    size: 12,
    lineHeight: 14,
    color: "#00f",
    x: 0,
    y: 0,
    width: 100,
    ...patch,
  };
}

/** The last encode of an element with `texts` at camera `scale` under `policy`, as the backend keeps it. */
function encodeAt(texts: TText[], scale: number, policy: TSceneTextPolicy = DEFAULT_TEXT_POLICY): TTextEncode {
  const layouts: (TTextLayout | undefined)[] = [];
  const places: TTextGlyphPlaces = { counts: [], translucent: [], placed: [] };
  const input = {
    policy,
    metrics,
    layoutOf: (primitive: TText): TTextLayout => {
      const layout = layoutText(primitive, resolveTextSize(primitive, scale, policy), metrics);
      layouts.push(primitive.cameraAware ? layout : undefined);
      return layout;
    },
  };
  encodeText(texts, 4, () => 2, atlas(), input, 0, undefined, places);
  return {
    index: 4,
    texts,
    subs: texts.map((_, at) => at),
    glyphs: places.counts,
    translucent: undefined,
    placed: places.placed,
    layouts,
    policy,
    generation: metrics.generation,
  };
}

function zeroStats(): TTextRelayoutStats {
  return {
    textRelayouts: 0,
    lastTextRelayouts: 0,
    lastTextRelayoutGlyphs: 0,
    lastTextRelayoutBytes: 0,
    lastTextRelayoutWrittenBytes: 0,
    lastTextRelayoutDrawnBytes: 0,
    lastTextRelayoutsKept: 0,
  };
}

/** What a re-encode saw of the last encode when the host was asked for it. */
type TSeen = { policy: TSceneTextPolicy; layouts: (TTextLayout | undefined)[]; placed: number[] | undefined };

/** A host whose edits answer `edits` in turn (true after them), logging every edit and re-encode. */
function host(encode: TTextEncode, edits: boolean[] = []): ITextRelayoutHost & { log: string[]; seen: TSeen[] } {
  const shared = atlas();
  const log: string[] = [];
  const seen: TSeen[] = [];
  let next = 0;
  return {
    metrics,
    log,
    seen,
    layout: (primitive, size) => layoutText(primitive, size, metrics),
    run: (primitive, layout) => glyphRun(primitive, layout, shared, metrics),
    edit: (_encode, at, first, written) => {
      log.push(`edit ${at} from ${first}, ${written} slots`);
      return edits[next++] ?? true;
    },
    rewrite: () => {
      log.push("rewrite");
      seen.push({ policy: encode.policy, layouts: encode.layouts.slice(), placed: encode.placed?.slice() });
    },
  };
}

const longName = (patch: Partial<TText> = {}): TText =>
  text({ text: "Load the daily partitions", cameraAware: true, width: 120, height: 60, ...patch });

describe("TextRelayout", () => {
  it("rewrites the texts whose glyphs change in place, then commits each layout and counter once", () => {
    // A camera-aware name whose lines change from 1 to 0.25, a world text, and a short camera-aware text whose lines
    // stay: its layout's size range is narrowed to scale 1's size, so 0.25 lays it out again with the same glyphs.
    const short = text({ text: "ab", cameraAware: true, width: 10000 });
    const encode = encodeAt([longName(), text({ text: "fixed" }), short], 1);
    const shortLayout = encode.layouts[2];
    if (!shortLayout) throw new Error("no layout");
    const size = resolveTextSize(short, 1);
    encode.layouts[2] = { ...shortLayout, minSize: size, maxSize: size };
    const placedBefore = encode.placed?.[0] ?? 0;
    const io = host(encode);
    const stats = zeroStats();
    new TextRelayout().relayout(encode, 0.25, DEFAULT_TEXT_POLICY, io, stats);
    const now = layoutText(longName(), resolveTextSize(longName(), 0.25), metrics);
    const placedNow = glyphRun(longName(), now, atlas(), metrics).glyphs.length / 3;
    const written = Math.max(placedBefore, placedNow);
    expect(io.log).toEqual([`edit 0 from 0, ${written} slots`]);
    expect(encode.layouts[0]?.lines).toEqual(now.lines);
    expect(encode.placed?.[0]).toBe(placedNow);
    expect(encode.layouts[2]).not.toBe(shortLayout);
    expect(encode.layouts[2]?.lines).toEqual(["ab"]);
    expect(stats).toEqual({
      textRelayouts: 1,
      lastTextRelayouts: 1,
      lastTextRelayoutGlyphs: encode.glyphs[0],
      lastTextRelayoutBytes: encode.glyphs[0] * GLYPH_BYTES,
      lastTextRelayoutWrittenBytes: written * GLYPH_BYTES,
      lastTextRelayoutDrawnBytes: placedNow * GLYPH_BYTES,
      lastTextRelayoutsKept: 1,
    });
  });

  it("re-encodes against the last encode as it was when an edit is refused (Codex's case)", () => {
    // "abcd", 120 wide, size 10, at 0.7; the policy goes off, and the pass refuses the edit.
    const abcd = text({ text: "abcd", size: 10, lineHeight: 10, cameraAware: true, width: 120 });
    const encode = encodeAt([abcd], 0.7);
    const layouts = encode.layouts.slice();
    const placed = encode.placed?.slice();
    const io = host(encode, [false]);
    const stats = zeroStats();
    new TextRelayout().relayout(encode, 0.7, OFF, io, stats);
    expect(io.log).toEqual([`edit 0 from 0, ${placed?.[0]} slots`, "rewrite"]);
    // The re-encode compares with the previous policy and layouts, so it counts the text it rewrites.
    expect(io.seen).toEqual([{ policy: DEFAULT_TEXT_POLICY, layouts, placed }]);
    expect(stats).toEqual(zeroStats());
    expect(encode.policy).toBe(DEFAULT_TEXT_POLICY);
  });

  it("counts nothing itself when a refused edit follows one that succeeded: the re-encode counts every text", () => {
    const encode = encodeAt([longName(), longName({ part: "label" })], 1);
    const before = { layouts: encode.layouts.slice(), placed: encode.placed?.slice() };
    const io = host(encode, [true, false]);
    const stats = zeroStats();
    new TextRelayout().relayout(encode, 0.25, DEFAULT_TEXT_POLICY, io, stats);
    expect(io.log.map((line) => line.split(" ")[0])).toEqual(["edit", "edit", "rewrite"]);
    expect(io.seen).toEqual([{ policy: DEFAULT_TEXT_POLICY, ...before }]);
    expect(stats).toEqual(zeroStats());
  });

  it("re-encodes before any write when a text would place more glyphs than it keeps, its kept texts uncounted", () => {
    const short = text({ text: "ab", cameraAware: true, width: 10000 });
    const encode = encodeAt([short, longName()], 1);
    const shortLayout = encode.layouts[0];
    if (!shortLayout) throw new Error("no layout");
    const size = resolveTextSize(short, 1);
    encode.layouts[0] = { ...shortLayout, minSize: size, maxSize: size };
    // The name keeps one glyph: any layout of it places more.
    encode.glyphs = [encode.glyphs[0], 1];
    const narrowed = encode.layouts[0];
    const io = host(encode);
    const stats = zeroStats();
    new TextRelayout().relayout(encode, 0.25, DEFAULT_TEXT_POLICY, io, stats);
    expect(io.log).toEqual(["rewrite"]);
    expect(io.seen[0].layouts[0]).toBe(narrowed);
    expect(stats).toEqual(zeroStats());
  });

  it("re-encodes an encode that keeps no placed counts, and does nothing for layouts still valid", () => {
    const encode = encodeAt([longName()], 1);
    const io = host({ ...encode, placed: undefined });
    new TextRelayout().relayout({ ...encode, placed: undefined }, 0.25, DEFAULT_TEXT_POLICY, io, zeroStats());
    expect(io.log).toEqual(["rewrite"]);
    const still = host(encode);
    const stats = zeroStats();
    new TextRelayout().relayout(encode, 1, DEFAULT_TEXT_POLICY, still, stats);
    expect(still.log).toEqual([]);
    expect(stats).toEqual(zeroStats());
  });
});
