import type { TTileRect } from "../../culling/TileIndex";
import { resolveSceneSize } from "../size";
import type { TScenePrimitive, TSceneSize, TSceneStroke } from "../types";

/**
 * The camera's default minimum scale (`CameraService`, `scaleMin`). A size in pixels is largest in world units there,
 * so the levels take every camera-aware size at this scale, or at the primitive's `minScale` when that is higher.
 */
export const MIN_CAMERA_SCALE = 0.01;

/** The lowest camera scale a primitive is shown at: `MIN_CAMERA_SCALE`, or its `minScale` when that is higher. */
export function lowestShownScale(minScale?: number): number {
  return minScale !== undefined && Number.isFinite(minScale) ? Math.max(MIN_CAMERA_SCALE, minScale) : MIN_CAMERA_SCALE;
}

/**
 * The largest world extent of a size over the camera scales at which its primitive is shown. A camera-aware size never
 * shrinks as the camera zooms out, so this is its size at the lowest such scale (`lowestShownScale`, spec §3.2). A
 * camera-aware text's font size is largest there too (`largestTextSize`, `elementBounds`).
 */
export function largestSize(size: TSceneSize, minScale?: number): number {
  return resolveSceneSize(size, lowestShownScale(minScale));
}

/** How far a closed shape's stroke reaches outside its edge, at its largest extent. */
function strokeReach(stroke: TSceneStroke | undefined, minScale: number | undefined): number {
  if (stroke?.width === undefined) return 0;
  const width = largestSize(stroke.width, minScale);
  switch (stroke.align ?? "center") {
    case "inside":
      return 0;
    case "outside":
      return width;
    default:
      return width / 2;
  }
}

function joinBox(box: TTileRect, minX: number, minY: number, maxX: number, maxY: number, pad: number): void {
  box.minX = Math.min(box.minX, Math.min(minX, maxX) - pad);
  box.minY = Math.min(box.minY, Math.min(minY, maxY) - pad);
  box.maxX = Math.max(box.maxX, Math.max(minX, maxX) + pad);
  box.maxY = Math.max(box.maxY, Math.max(minY, maxY) + pad);
}

/** Joins x, y pairs, each padded by `pad`. */
function joinPoints(box: TTileRect, points: Float32Array, pad: number): void {
  for (let i = 0; i + 1 < points.length; i += 2) joinBox(box, points[i], points[i + 1], points[i], points[i + 1], pad);
}

/**
 * The bounds of the rects, circles, paths and polygons, relative to the element's origin, with their strokes at their
 * largest extent over the scales at which each is shown; undefined when there are none. These are the primitives
 * whose geometry a style can widen beyond the store's bounds (a `width` or a circle `scale` baked by
 * `bakeElementStyle`), so pass the baked primitives. Text and icons are left to the store's bounds (`elementBounds`,
 * text by `textBounds`): no style changes their geometry.
 * - A rect or circle border reaches out by its width (`outside`), half of it (`center`, the default) or nothing
 *   (`inside`).
 * - A path takes the hull of its control points, which contains the curve, padded by the whole stroke width: that
 *   covers the caps of its pieces as well as half the width. A path's effect draws `extraWidth` CSS pixels beyond the
 *   stroke; the store's bounds of the element have to cover it.
 * - A polygon takes its points, padded by its stroke width.
 */
export function geometryBounds(primitives: readonly TScenePrimitive[]): TTileRect | undefined {
  const box: TTileRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const primitive of primitives) {
    const { minScale } = primitive;
    switch (primitive.kind) {
      case "rect": {
        const { x, y, width, height } = primitive;
        joinBox(box, x, y, x + width, y + height, strokeReach(primitive.border, minScale));
        break;
      }
      case "circle": {
        const { cx, cy, r } = primitive;
        joinBox(box, cx - r, cy - r, cx + r, cy + r, strokeReach(primitive.border, minScale));
        break;
      }
      case "path":
        if (primitive.stroke.width !== undefined) {
          joinPoints(box, primitive.segments, largestSize(primitive.stroke.width, minScale));
        }
        break;
      case "polygon": {
        const width = primitive.stroke?.width;
        joinPoints(box, primitive.points, width === undefined ? 0 : largestSize(width, minScale));
        break;
      }
      default:
        break;
    }
  }
  return box.minX <= box.maxX ? box : undefined;
}
