import TinySDF from "@mapbox/tiny-sdf";

import type { TGeneratedGlyph, TGlyphGenerator } from "./glyphs";
import { ATLAS_FONT_PX, SDF_BUFFER, SDF_RADIUS } from "./glyphs";

/** tiny-sdf generator per family and weight, for GlyphAtlas. */
export function createTinySdfGenerator(): TGlyphGenerator {
  const fonts = new Map<string, TinySDF>();
  return (char: string, family: string, weight: string): TGeneratedGlyph => {
    const key = `${family}|${weight}`;
    let sdf = fonts.get(key);
    if (!sdf) {
      sdf = new TinySDF({
        fontSize: ATLAS_FONT_PX,
        buffer: SDF_BUFFER,
        radius: SDF_RADIUS,
        cutoff: 0.25,
        fontFamily: family,
        fontWeight: weight,
      });
      fonts.set(key, sdf);
    }
    return sdf.draw(char);
  };
}
