import TinySDF from "@mapbox/tiny-sdf";
import type { TinySDFOptions } from "@mapbox/tiny-sdf";

import type { TGeneratedGlyph } from "../GlyphAtlas";
import { createTinySdfGenerator } from "../tinySdfGlyphs";

const mockGlyph: TGeneratedGlyph = {
  data: new Uint8ClampedArray(4),
  width: 2,
  height: 2,
  glyphLeft: 0,
  glyphTop: 0,
  glyphWidth: 2,
  glyphHeight: 2,
  glyphAdvance: 2,
};

const mockDraw = jest.fn((_char: string): TGeneratedGlyph => mockGlyph);

jest.mock("@mapbox/tiny-sdf", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ draw: mockDraw })),
}));

const TinySDFMock = TinySDF as unknown as jest.Mock<{ draw: (char: string) => TGeneratedGlyph }, [TinySDFOptions]>;

describe("createTinySdfGenerator", () => {
  beforeEach(() => TinySDFMock.mockClear());

  it("draws each font's glyphs at 48 px with a 6 px margin and a 16 px reach, the edge at 0.75", () => {
    const generate = createTinySdfGenerator();
    expect(generate("a", "f", "bold")).toBe(mockGlyph);
    generate("b", "f", "bold");
    generate("a", "f", "normal");
    generate("a", "g", "normal");
    expect(mockDraw.mock.calls).toEqual([["a"], ["b"], ["a"], ["a"]]);
    expect(TinySDFMock.mock.calls.map(([options]) => options)).toEqual([
      { fontSize: 48, buffer: 6, radius: 16, cutoff: 0.25, fontFamily: "f", fontWeight: "bold" },
      { fontSize: 48, buffer: 6, radius: 16, cutoff: 0.25, fontFamily: "f", fontWeight: "normal" },
      { fontSize: 48, buffer: 6, radius: 16, cutoff: 0.25, fontFamily: "g", fontWeight: "normal" },
    ]);
  });
});
