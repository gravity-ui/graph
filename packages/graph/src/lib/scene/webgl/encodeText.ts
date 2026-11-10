import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import { resolveSceneSize } from "../size";
import type { TScenePrimitive } from "../types";

import { InstanceList, checkSub, scaleBound, writeSize } from "./encodeRects";
import type { TEncodedInstances, TSlotOf } from "./encodeRects";
import { layoutText } from "./glyphs";
import type { GlyphAtlas } from "./glyphs";

/** Floats per glyph instance. */
export const GLYPH_FLOATS = 28;

const NO_LIMIT = 1e9;

/** Text primitives as glyph instances (one per non-space character), split by translucency. */
export function encodeText(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  slotOf: TSlotOf,
  atlas: GlyphAtlas
): TEncodedInstances {
  const opaque = new InstanceList(GLYPH_FLOATS);
  const translucent = new InstanceList(GLYPH_FLOATS);
  primitives.forEach((primitive, sub) => {
    if (primitive.kind !== "text") return;
    checkSub(sub);
    const color = colorFloats(primitive.color);
    const list = color[3] < 1 ? translucent : opaque;
    const slot = slotOf(primitive.part);
    const baseSize = resolveSceneSize(primitive.size, 1);
    for (const glyph of layoutText(primitive, atlas)) {
      const out = list.next();
      out[0] = elementIndex;
      out[1] = sub;
      out[2] = slot;
      out.set([glyph.x, glyph.y, glyph.w, glyph.h, glyph.u0, glyph.v0, glyph.u1, glyph.v1], 4);
      out.set(color, 12);
      writeSize(out, 16, primitive.size);
      out[20] = primitive.x;
      out[21] = primitive.y;
      out[22] = baseSize;
      out[24] = scaleBound(primitive.minScale, 0);
      out[25] = scaleBound(primitive.maxScale, NO_LIMIT);
    }
  });
  return { opaque: opaque.toArray(), translucent: translucent.toArray() };
}
