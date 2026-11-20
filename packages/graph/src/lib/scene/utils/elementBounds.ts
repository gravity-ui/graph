import type { TTileRect } from "../../culling/TileIndex";
import { sceneTextLayout, sceneTextMetrics } from "../text/textMetrics";
import { largestTextSize, textBounds } from "../text/textPlacement";
import type { TScenePrimitive } from "../types";
import { geometryBounds, lowestShownScale } from "../webgl/order/levelBounds";

/** The bounds of an element without primitives: its origin. */
export const EMPTY_BOUNDS: TTileRect = Object.freeze({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

function join(box: TTileRect, minX: number, minY: number, maxX: number, maxY: number): void {
  box.minX = Math.min(box.minX, minX);
  box.minY = Math.min(box.minY, minY);
  box.maxX = Math.max(box.maxX, maxX);
  box.maxY = Math.max(box.maxY, maxY);
}

/**
 * The culling bounds of primitives relative to their element's origin, at their largest extent over all camera scales
 * (spec §3.2): the geometry of rects, circles, paths and polygons with their strokes (`geometryBounds`), text and
 * icons. A text's lines never leave its box (a text whose layout overflows is clipped to it; the glyph ink of one that
 * fits may overhang by side bearings, as in v1), so a text with a height contributes its box; a heightless one the
 * lines it can have at any size up to its largest in either mode, measured with the shared metrics (`textBounds`),
 * or, for a world text, which has one size, the lines of its layout there.
 * Hit shapes are separate (spec §9).
 */
export function elementBounds(primitives: readonly TScenePrimitive[]): TTileRect {
  const geometry = geometryBounds(primitives);
  const box: TTileRect = geometry
    ? { ...geometry }
    : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const primitive of primitives) {
    if (primitive.kind === "text") {
      const largest = largestTextSize(primitive, lowestShownScale(primitive.minScale));
      // A heightless world text draws at its size alone (a style cannot make it camera-aware): its bounds are its
      // laid-out lines there, and both renderers take that layout (`sceneTextLayout`) instead of laying it out again.
      const drawn =
        primitive.height === undefined && !primitive.cameraAware
          ? sceneTextLayout(primitive, primitive, primitive.size).lines.length
          : undefined;
      const text = textBounds(primitive, largest, sceneTextMetrics, drawn);
      join(box, text.minX, text.minY, text.maxX, text.maxY);
    } else if (primitive.kind === "icon") {
      join(box, primitive.x, primitive.y, primitive.x + primitive.size, primitive.y + primitive.size);
    }
  }
  return box.minX <= box.maxX ? box : EMPTY_BOUNDS;
}
