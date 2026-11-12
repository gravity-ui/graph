import { GLYPH_FLOATS, encodeText } from "./encodeText";
import { GlyphAtlas } from "./glyphs";
import { USE_BASE_ALPHA } from "./tables";

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

describe("encodeText", () => {
  it("writes one glyph per non-space character", () => {
    const { opaque, translucent } = encodeText(
      [{ kind: "text", text: "a b", family: "f", size: 12, lineHeight: 14, color: "#00f", x: 3, y: 4, width: 100 }],
      7,
      () => 2,
      atlas()
    );
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(2 * GLYPH_FLOATS);
    expect(Array.from(opaque.slice(0, 3))).toEqual([7, 0, 2]);
    expect(Array.from(opaque.slice(12, 16))).toEqual([0, 0, 1, 1]);
    expect(Array.from(opaque.slice(16, 20))).toEqual([0, 12, 0, 1e9]);
    expect(Array.from(opaque.slice(20, 23))).toEqual([3, 4, 12]);
    for (let i = 0; i < 2; i++) {
      const at = i * GLYPH_FLOATS;
      for (const uv of opaque.slice(at + 8, at + 12)) {
        expect(uv).toBeGreaterThanOrEqual(0);
        expect(uv).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts translucent text into translucent", () => {
    const { opaque, translucent } = encodeText(
      [
        {
          kind: "text",
          text: "a",
          family: "f",
          size: 12,
          lineHeight: 14,
          color: "rgba(0,0,0,0.5)",
          x: 0,
          y: 0,
          width: 9,
        },
      ],
      0,
      () => 0,
      atlas()
    );
    expect(opaque).toHaveLength(0);
    expect(translucent).toHaveLength(GLYPH_FLOATS);
  });

  it("encodes an unset colour as the base paint, in the opaque pass", () => {
    const { opaque, translucent } = encodeText(
      [{ kind: "text", text: "a", family: "f", size: 12, lineHeight: 14, x: 0, y: 0, width: 9, part: "title" }],
      0,
      () => 1,
      atlas()
    );
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(GLYPH_FLOATS);
    expect(Array.from(opaque.slice(12, 16))).toEqual([0, 0, 0, USE_BASE_ALPHA]);
  });
});
