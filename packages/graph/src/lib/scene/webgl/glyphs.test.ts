import { ATLAS_FONT_PX, GlyphAtlas, layoutText } from "./glyphs";
import type { TGeneratedGlyph, TGlyphGenerator } from "./glyphs";

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

type TTextArgs = { text: string; width: number; height?: number; align?: CanvasTextAlign };

function text(args: TTextArgs): Parameters<typeof layoutText>[0] {
  return { kind: "text", family: "f", size: ATLAS_FONT_PX, lineHeight: 20, color: "#000", x: 0, y: 0, ...args };
}

describe("GlyphAtlas", () => {
  it("caches a glyph per family, weight and char", () => {
    const generate = fakeGenerator();
    const atlas = new GlyphAtlas(generate, 64);
    expect(atlas.glyph("a", "f", "normal")).toBe(atlas.glyph("a", "f", "normal"));
    atlas.glyph("a", "f", "bold");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("copies the bitmap, reports it dirty once and wraps shelves", () => {
    const atlas = new GlyphAtlas(fakeGenerator(), 21);
    const first = atlas.glyph("a", "f", "normal");
    expect(atlas.takeDirty()).toBe(true);
    expect(atlas.takeDirty()).toBe(false);
    atlas.glyph("b", "f", "normal");
    const third = atlas.glyph("c", "f", "normal");
    expect(atlas.data[0]).toBe(255);
    expect(first.v0).toBe(0);
    // two 10 px glyphs and a gap fit a 21 px shelf; the third glyph starts a new shelf.
    expect(third.u0).toBe(0);
    expect(third.v0).toBe((BOX + 1) / 21);
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

describe("layoutText", () => {
  const generate: TGlyphGenerator = fakeGenerator();

  it("wraps at word boundaries", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const placements = layoutText(text({ text: "aa aa", width: 30 }), atlas);
    expect(placements).toHaveLength(4);
    expect(new Set(placements.map((p) => p.y)).size).toBe(2);
  });

  it("keeps a fitting text on one line and skips spaces", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const placements = layoutText(text({ text: "aa aa", width: 100 }), atlas);
    expect(placements).toHaveLength(4);
    expect(new Set(placements.map((p) => p.y)).size).toBe(1);
  });

  it("stops at height / lineHeight lines", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const placements = layoutText(text({ text: "aa aa aa", width: 30, height: 40 }), atlas);
    expect(new Set(placements.map((p) => p.y)).size).toBe(2);
    expect(placements).toHaveLength(4);
  });

  it("shifts lines by the alignment", () => {
    const atlas = new GlyphAtlas(generate, 256);
    const left = layoutText(text({ text: "a", width: 100 }), atlas)[0];
    const center = layoutText(text({ text: "a", width: 100, align: "center" }), atlas)[0];
    const right = layoutText(text({ text: "a", width: 100, align: "right" }), atlas)[0];
    expect(center.x - left.x).toBe(45);
    expect(right.x - left.x).toBe(90);
  });
});
