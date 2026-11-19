import { TEXT_METRICS_PX } from "../../textLayout";
import type { ISceneTextMetrics } from "../../textLayout";
import {
  ATLAS_FONT_PX,
  GLYPH_RUN_FLOATS,
  GlyphAtlas,
  GlyphLayoutCache,
  SDF_BUFFER,
  SDF_CUTOFF,
  SDF_EDGE,
  SDF_RADIUS,
  glyphRun,
  layoutGlyphs,
} from "../glyphs";
import type { TGeneratedGlyph, TGlyphGenerator, TGlyphRun } from "../glyphs";
import { GLYPH_FRAGMENT } from "../shaders";

const BOX = 10;

function fakeGenerator(): jest.Mock<TGeneratedGlyph, [string, string, string]> {
  return jest.fn<TGeneratedGlyph, [string, string, string]>(() => ({
    data: new Uint8ClampedArray(BOX * BOX).fill(255),
    width: BOX,
    height: BOX,
    glyphLeft: 0,
    glyphTop: 0,
    glyphWidth: BOX,
    glyphHeight: BOX,
    glyphAdvance: BOX,
  }));
}

type TTextArgs = {
  text: string;
  width: number;
  height?: number;
  align?: CanvasTextAlign;
  verticalAlign?: "top" | "middle" | "bottom";
};

type TText = Parameters<typeof layoutGlyphs>[0];

function text(args: TTextArgs): TText {
  return { kind: "text", family: "f", size: ATLAS_FONT_PX, lineHeight: 20, color: "#000", x: 0, y: 0, ...args };
}

/** Half the font size per character at TEXT_METRICS_PX, the baseline 80 px below a line's top. */
const metrics: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };

/** Atlas glyphs (drawn at ATLAS_FONT_PX) at TEXT_METRICS_PX. */
const K = TEXT_METRICS_PX / ATLAS_FONT_PX;

describe("GlyphAtlas", () => {
  it("caches a glyph per family, weight and char", () => {
    const generate = fakeGenerator();
    const atlas = new GlyphAtlas(generate, 64);
    expect(atlas.glyph("a", "f", "normal")).toBe(atlas.glyph("a", "f", "normal"));
    atlas.glyph("a", "f", "bold");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("generates glyphs at 48 px with a distance field of the same reach relative to the glyph as at 24 px", () => {
    expect(ATLAS_FONT_PX).toBe(48);
    expect(SDF_BUFFER).toBe(6);
    expect(SDF_RADIUS).toBe(16);
    // 24 px glyphs had a 3 px margin and an 8 px reach.
    expect(SDF_BUFFER / ATLAS_FONT_PX).toBe(3 / 24);
    expect(SDF_RADIUS / ATLAS_FONT_PX).toBe(8 / 24);
  });

  it("draws the outline 0.06 atlas px inside tiny-sdf's edge, with a one-pixel ramp", () => {
    expect((SDF_EDGE - (1 - SDF_CUTOFF)) * SDF_RADIUS).toBeCloseTo(0.06, 9);
    expect(GLYPH_FRAGMENT).toContain(`clamp(0.5 + (sdf - ${SDF_EDGE.toFixed(6)}) / grad, 0.0, 1.0)`);
  });

  it("holds 2048 x 2048 texels by default", () => {
    const atlas = new GlyphAtlas(fakeGenerator());
    expect(atlas.size).toBe(2048);
    expect(atlas.data).toHaveLength(2048 * 2048);
  });

  it("copies the bitmap, reports the rows it wrote once and wraps shelves", () => {
    const atlas = new GlyphAtlas(fakeGenerator(), 21);
    expect(atlas.takeDirtyRows()).toBeNull();
    const first = atlas.glyph("a", "f", "normal");
    expect(atlas.takeDirtyRows()).toEqual([0, BOX]);
    expect(atlas.takeDirtyRows()).toBeNull();
    atlas.glyph("b", "f", "normal");
    const third = atlas.glyph("c", "f", "normal");
    expect(atlas.data[0]).toBe(255);
    expect(first.v0).toBe(0);
    // two 10 px glyphs and a gap fit a 21 px shelf; the third glyph starts a new shelf.
    expect(third.u0).toBe(0);
    expect(third.v0).toBe((BOX + 1) / 21);
    // Both shelves since the last call, the gap between them too.
    expect(atlas.takeDirtyRows()).toEqual([0, 2 * BOX + 1]);
    // A known glyph writes nothing.
    atlas.glyph("c", "f", "normal");
    expect(atlas.takeDirtyRows()).toBeNull();
    atlas.glyph("d", "f", "normal");
    expect(atlas.takeDirtyRows()).toEqual([BOX + 1, 2 * BOX + 1]);
  });

  it("throws when the atlas is full", () => {
    const atlas = new GlyphAtlas(fakeGenerator(), 21);
    atlas.glyph("a", "f", "normal");
    atlas.glyph("b", "f", "normal");
    atlas.glyph("c", "f", "normal");
    atlas.glyph("d", "f", "normal");
    expect(() => atlas.glyph("e", "f", "normal")).toThrow(RangeError);
  });
});

describe("layoutGlyphs", () => {
  const generate: TGlyphGenerator = fakeGenerator();

  it("places a quad per character of the given lines and none for spaces", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const { lines, glyphs } = layoutGlyphs(text({ text: "aa aa", width: 30 }), ["aa", "aa"], atlas, metrics);
    expect(lines).toBe(2);
    expect(glyphs).toHaveLength(4);
    expect(new Set(glyphs.map((p) => p.y)).size).toBe(2);
    expect(layoutGlyphs(text({ text: "aa aa", width: 100 }), ["aa aa"], atlas, metrics).glyphs).toHaveLength(4);
  });

  it("starts each line where align puts its measured width, and each word at its measured place", () => {
    const atlas = new GlyphAtlas(generate, 256);
    // "ab cd" measures 100 + 50 + 100 at TEXT_METRICS_PX; the fake glyphs' quads start SDF_BUFFER left of the pen, and
    // their advances (BOX x K each) are stretched so that each word spans its measured 100.
    const xs = (align?: CanvasTextAlign): number[] =>
      layoutGlyphs(text({ text: "ab cd", width: 100, align }), ["ab cd"], atlas, metrics).glyphs.map((p) => p.x);
    const advance = 50;
    const left = -SDF_BUFFER * K;
    for (const [align, start] of [
      [undefined, 0],
      ["center", -125],
      ["right", -250],
    ] as const) {
      const at = xs(align);
      expect(at[0]).toBeCloseTo(start + left, 9);
      expect(at[1]).toBeCloseTo(start + advance + left, 9);
      // The second word starts at its measured place, whatever the advances of the first.
      expect(at[2]).toBeCloseTo(start + 150 + left, 9);
    }
  });

  it("spans each word over its measured width: a kerned word does not grow by the atlas's isolated advances", () => {
    // Isolated advances of 10 atlas px (41.67 at TEXT_METRICS_PX): "AVAVAV" would be 250 wide; kerned, it measures 200.
    const kerned: ISceneTextMetrics = { ...metrics, width: (value) => (value === "AVAVAV" ? 200 : value.length * 50) };
    const atlas = new GlyphAtlas(generate, 256);
    const { glyphs } = layoutGlyphs(text({ text: "AVAVAV", width: 300 }), ["AVAVAV"], atlas, kerned);
    const left = -SDF_BUFFER * K;
    glyphs.forEach((glyph, index) => expect(glyph.x).toBeCloseTo(index * (200 / 6) + left, 9));
    // The pen after the last glyph is at the measured width.
    expect(glyphs[5].x - left + 200 / 6).toBeCloseTo(200, 9);
  });

  it("spans a line over the measured width of the complete line: kerning around spaces moves the alignment", () => {
    // Words 50 a character and a space 50, with pair kerning across the space ("o " -12, " T" -8): "To To" sums to 250
    // but the complete line measures 230.
    const kerned: ISceneTextMetrics = {
      ...metrics,
      width: (value) => value.length * 50 - 12 * (value.split("o ").length - 1) - 8 * (value.split(" T").length - 1),
    };
    const atlas = new GlyphAtlas(generate, 256);
    const left = -SDF_BUFFER * K;
    for (const [align, share] of [
      ["left", 0],
      ["center", 0.5],
      ["right", 1],
    ] as const) {
      const { glyphs } = layoutGlyphs(text({ text: "To To", width: 300, align }), ["To To"], atlas, kerned);
      // The line starts where its measured width (230) puts it, as Canvas2D aligns fillText by its own measure.
      const start = -share * 230;
      expect(glyphs[0].x).toBeCloseTo(start + left, 9);
      // Words and the space scale by 230 / 250: the second word starts at 150 x 0.92 and the line ends at 230.
      const fit = 230 / 250;
      expect(glyphs[2].x).toBeCloseTo(start + 150 * fit + left, 9);
      expect(glyphs[3].x - left + 50 * fit - start).toBeCloseTo(230, 9);
    }
  });

  it("puts each line's baseline the measured top below its top, lines a pitch apart from the block's top", () => {
    const atlas = new GlyphAtlas(generate, 256);
    // A pitch of 20 per 24 of size: at TEXT_METRICS_PX lines are 100 x 20 / 24 apart. The fake glyph's top lies on the
    // baseline, and its quad starts SDF_BUFFER above it.
    const pitch = (TEXT_METRICS_PX * 20) / ATLAS_FONT_PX;
    const rows = (verticalAlign?: "top" | "middle" | "bottom"): number[] => [
      ...new Set(
        layoutGlyphs(
          text({ text: "aa aa", width: 30, height: 60, verticalAlign }),
          ["aa", "aa"],
          atlas,
          metrics
        ).glyphs.map((p) => p.y)
      ),
    ];
    for (const [align, share] of [
      [undefined, 0],
      ["middle", 0.5],
      ["bottom", 1],
    ] as const) {
      const ys = rows(align);
      const top = -share * 2 * pitch;
      expect(ys).toHaveLength(2);
      expect(ys[0]).toBeCloseTo(top + 80 - SDF_BUFFER * K, 9);
      expect(ys[1]).toBeCloseTo(top + pitch + 80 - SDF_BUFFER * K, 9);
    }
  });

  it("keeps the glyphs of a zero line height on one baseline", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const { glyphs } = layoutGlyphs({ ...text({ text: "aa", width: 30 }), lineHeight: 0 }, ["aa"], atlas, metrics);
    expect(glyphs).toHaveLength(2);
    expect(glyphs.every((glyph) => Number.isFinite(glyph.y))).toBe(true);
  });
});

describe("glyphRun", () => {
  it("holds layoutGlyphs' glyph corners, atlas glyphs and line count", () => {
    let chars = 0;
    // Glyphs of different sizes, so a wrong atlas glyph would show.
    const atlas = new GlyphAtlas((): TGeneratedGlyph => {
      const size = 6 + chars++;
      return {
        data: new Uint8ClampedArray(size * size),
        width: size,
        height: size,
        glyphLeft: chars,
        glyphTop: 2 * chars,
        glyphWidth: size,
        glyphHeight: size,
        glyphAdvance: size,
      };
    }, 256);
    const primitive = text({ text: "ab cd ef", width: 30, height: 60, align: "center", verticalAlign: "middle" });
    const { lines, glyphs } = layoutGlyphs(primitive, ["ab", "cd ef"], atlas, metrics);
    const run = glyphRun(primitive, { lines: ["ab", "cd ef"], size: 24 }, atlas, metrics);
    expect(run.lines).toBe(lines);
    expect(run.glyphs).toHaveLength(glyphs.length * GLYPH_RUN_FLOATS);
    glyphs.forEach((placement, index) => {
      const at = index * GLYPH_RUN_FLOATS;
      expect([run.glyphs[at], run.glyphs[at + 1]]).toEqual(Array.from(new Float32Array([placement.x, placement.y])));
      const glyph = atlas.glyphAt(run.glyphs[at + 2]);
      // Runs are at TEXT_METRICS_PX: atlas glyphs scale by K.
      expect([glyph.width * K, glyph.height * K, glyph.u0, glyph.v0, glyph.u1, glyph.v1]).toEqual([
        placement.w,
        placement.h,
        placement.u0,
        placement.v0,
        placement.u1,
        placement.v1,
      ]);
    });
  });

  it("places a text's lines once per font, alignment, pitch and lines, and again for another atlas", () => {
    const atlas = new GlyphAtlas(fakeGenerator(), 256);
    const glyph = jest.spyOn(atlas, "glyph");
    const primitive = text({ text: "aa bb", width: 100 });
    const lines = { lines: ["aa bb"], size: 24 };
    const first = glyphRun(primitive, lines, atlas, metrics);
    const calls = glyph.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    // A move, another box and another size at the same pitch per unit of size keep the run: it is relative to the
    // anchor at TEXT_METRICS_PX, and the lines are given.
    for (const same of [
      { x: 50, y: 70 },
      { width: 20, height: 20 },
      { size: ATLAS_FONT_PX / 2, lineHeight: 10 },
    ]) {
      expect(glyphRun({ ...primitive, ...same }, lines, atlas, metrics)).toBe(first);
    }
    expect(glyph.mock.calls.length).toBe(calls);
    // Every other input places the glyphs again.
    const changes: Partial<TText>[] = [
      { family: "g" },
      { weight: "bold" },
      { lineHeight: 10 },
      { align: "right" },
      { verticalAlign: "bottom" },
    ];
    for (const change of changes) {
      expect(glyphRun({ ...primitive, ...change }, lines, atlas, metrics)).not.toBe(first);
    }
    expect(glyphRun(primitive, { lines: ["aa", "bb"], size: 24 }, atlas, metrics)).not.toBe(first);
    // Linear metrics: another size of the same lines keeps the run.
    expect(glyphRun(primitive, { lines: ["aa bb"], size: 7 }, atlas, metrics)).toBe(first);
    // A new atlas, as late web fonts bring with a new backend, starts with no runs.
    const fresh = new GlyphAtlas(fakeGenerator(), 256);
    expect(glyphRun(primitive, lines, fresh, metrics)).not.toBe(first);
    expect(Array.from(glyphRun(primitive, lines, fresh, metrics).glyphs)).toEqual(Array.from(first.glyphs));
  });

  it("keeps at most two generations of its budget and every layout asked for in the last one", () => {
    const layout = (floats: number): TGlyphRun => ({ lines: 1, glyphs: new Float32Array(floats) });
    // An entry of 8 glyph floats and a one-character key is charged 8 + 1 + 64 floats: the budget holds two.
    const cache = new GlyphLayoutCache(2 * (8 + 1 + 64));
    const a = layout(8);
    cache.set("a", a);
    cache.set("b", layout(8));
    expect(cache.size).toBe(2);
    // Over the budget: a and b become the previous generation.
    cache.set("c", layout(8));
    expect(cache.size).toBe(3);
    // A hit in the previous generation moves the entry to the current one.
    expect(cache.get("a")).toBe(a);
    cache.set("d", layout(8));
    // c and a filled the current generation: d starts a new one, and b, unused since, is dropped.
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(a);
    expect(cache.size).toBeLessThanOrEqual(4);
  });

  it("charges empty layouts and long keys, so a stream of distinct texts stays bounded", () => {
    const empty: TGlyphRun = { lines: 0, glyphs: new Float32Array(0) };
    const cache = new GlyphLayoutCache(1000);
    // Texts of spaces only, or boxes shorter than a line, lay out no glyph: each still costs its key and overhead.
    for (let i = 0; i < 10000; i++) cache.set(`text ${i}`, empty);
    // At most two generations of 1000 / (64 + 4) entries each.
    expect(cache.size).toBeLessThanOrEqual(2 * Math.ceil(1000 / 68));
    expect(cache.get("text 9999")).toBe(empty);
    expect(cache.get("text 0")).toBeUndefined();
    // A long key counts too: a 4000-character text with no glyph fills a 2000-float generation alone.
    const long = new GlyphLayoutCache(2000);
    long.set("x".repeat(4000), empty);
    long.set("y".repeat(4000), empty);
    long.set("z", empty);
    expect(long.get("x".repeat(4000))).toBeUndefined();
    expect(long.size).toBe(2);
  });
});
