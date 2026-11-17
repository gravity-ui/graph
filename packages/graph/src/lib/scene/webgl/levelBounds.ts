import { toConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
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
function strokeReach(stroke: TSceneStroke | undefined, scale: number): number {
  if (stroke?.width === undefined) return 0;
  const width = resolveSceneSize(stroke.width, scale);
  switch (stroke.align ?? "center") {
    case "inside":
      return 0;
    case "outside":
      return width;
    default:
      return width / 2;
  }
}

/**
 * How far a circle's border reaches outside its radius in what either renderer paints, at its largest extent: WebGL
 * places it by its alignment (`strokeReach`); Canvas 2D strokes it centred on the radius whatever the alignment, so it
 * reaches half its width at least.
 */
function paintedCircleReach(stroke: TSceneStroke | undefined, scale: number): number {
  if (stroke?.width === undefined) return 0;
  return Math.max(strokeReach(stroke, scale), resolveSceneSize(stroke.width, scale) / 2);
}

/**
 * How far a rect's border reaches outside its edge in what either renderer paints, at its largest extent. Both place
 * it by its alignment (`strokeReach`), Canvas 2D by insetting the path by half the width for `inside`: once the border
 * is wider than the rect's shorter side the inset path crosses the rect's middle, and the stroke paints past the rect
 * by the excess.
 */
function paintedRectReach(stroke: TSceneStroke | undefined, scale: number, width: number, height: number): number {
  const reach = strokeReach(stroke, scale);
  if (stroke?.width === undefined || stroke.align !== "inside") return reach;
  const excess = resolveSceneSize(stroke.width, scale) - Math.min(Math.abs(width), Math.abs(height));
  return Math.max(reach, excess);
}

/**
 * The miter limit Canvas 2D strokes paths and polygons with: the context's default. `drawPrimitives` sets no `lineJoin`
 * and no `miterLimit`, so their joins are miters, and a join sharper than the limit is bevelled.
 */
const CANVAS_MITER_LIMIT = 10;

/**
 * How far the stroke of a path or polygon of a width reaches from its points in what Canvas 2D paints: a miter join
 * reaches up to `CANVAS_MITER_LIMIT` half-widths from its vertex (the limit is a ratio of the miter length to half the
 * width), farther than the whole width `geometryBounds` pads by, which also covers caps and bevels.
 */
function paintedJoinReach(width: number): number {
  return Math.max(width, (CANVAS_MITER_LIMIT * width) / 2);
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
 *   (`inside`), as WebGL places it; `paintedGeometryBounds` also covers what Canvas 2D paints.
 * - A path takes the hull of its control points, which contains the curve, padded by the whole stroke width: that
 *   covers the caps of its pieces as well as half the width. WebGL overlap geometry includes the effect's
 *   `extraWidth` CSS pixels at the lowest scale where the path is shown.
 * - A polygon takes its points, padded by its stroke width.
 */
export function geometryBounds(primitives: readonly TScenePrimitive[], scale?: number): TTileRect | undefined {
  return boundsOf(primitives, false, scale);
}

/** Geometry hulls do not change with the camera; only their stroke and halo padding does. */
export class CachedGeometryBounds {
  private readonly items: {
    primitive: TScenePrimitive;
    hull?: TTileRect;
    width?: TSceneSize;
    reach: number;
    halo: number;
    haloMinScale: number;
  }[];

  constructor(primitives: readonly TScenePrimitive[]) {
    this.items = primitives.map((primitive) => {
      let bare = primitive;
      let width: TSceneSize | undefined;
      let reach = 0;
      let halo = 0;
      let haloMinScale = 0;
      if (primitive.kind === "path") {
        width = primitive.stroke.width;
        reach = 1;
        halo = primitive.effect ? toConnectionEffect(primitive.effect.effect).extraWidth : 0;
        // Shader scale is f32, even when the effect's CPU activity range is narrower than one float step.
        haloMinScale = Math.fround(primitive.effect?.minScale ?? 0);
        if (width !== undefined) bare = { ...primitive, stroke: { ...primitive.stroke, width: 0 }, effect: undefined };
      } else if (primitive.kind === "rect" || primitive.kind === "circle") {
        width = primitive.border?.width;
        reach = 0.5;
        if (primitive.border?.align === "inside") reach = 0;
        else if (primitive.border?.align === "outside") reach = 1;
        bare = { ...primitive, border: undefined };
      } else if (primitive.kind === "polygon") {
        width = primitive.stroke?.width;
        reach = 1;
        bare = { ...primitive, stroke: undefined };
      }
      return { primitive, hull: geometryBounds([bare]), width, reach, halo, haloMinScale };
    });
  }

  /** `scaleOf` also visits text: the caller can include its laid-out bounds separately. */
  public at(scaleOf: (primitive: TScenePrimitive) => number | undefined): TTileRect | undefined {
    const box: TTileRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const { primitive, hull, width, reach, halo, haloMinScale } of this.items) {
      const scale = scaleOf(primitive);
      if (scale === undefined || !hull) continue;
      const pad =
        (width === undefined ? 0 : resolveSceneSize(width, scale) * reach) + halo / Math.max(scale, haloMinScale);
      joinBox(box, hull.minX, hull.minY, hull.maxX, hull.maxY, pad);
    }
    return box.minX <= box.maxX ? box : undefined;
  }
}

/**
 * `geometryBounds` with each stroke at the larger of its reach in either renderer:
 * - Canvas 2D strokes circles centred on their radius whatever their alignment (`paintedCircleReach`), and an `inside`
 *   rect border wider than the rect paints past it (`paintedRectReach`);
 * - it joins the pieces of paths and the sides of polygons with miters, which reach up to 5 widths from a vertex at
 *   its default miter limit (`paintedJoinReach`).
 *
 * The store culls a styled element by these (`SceneStore.styledBounds`), so a style that widens such a stroke keeps it
 * drawn at the viewport's edge. `geometryBounds`, and so an element's own bounds, keep the alignment's reach and the
 * width's pad.
 */
export function paintedGeometryBounds(primitives: readonly TScenePrimitive[]): TTileRect | undefined {
  return boundsOf(primitives, true);
}

function boundsOf(
  primitives: readonly TScenePrimitive[],
  painted: boolean,
  frameScale?: number
): TTileRect | undefined {
  const box: TTileRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const primitive of primitives) {
    const scale = frameScale ?? lowestShownScale(primitive.minScale);
    switch (primitive.kind) {
      case "rect": {
        const { x, y, width, height, border } = primitive;
        const pad = painted ? paintedRectReach(border, scale, width, height) : strokeReach(border, scale);
        joinBox(box, x, y, x + width, y + height, pad);
        break;
      }
      case "circle": {
        const { cx, cy, r, border } = primitive;
        const pad = painted ? paintedCircleReach(border, scale) : strokeReach(border, scale);
        joinBox(box, cx - r, cy - r, cx + r, cy + r, pad);
        break;
      }
      case "path":
        if (primitive.stroke.width !== undefined) {
          const width = resolveSceneSize(primitive.stroke.width, scale);
          const halo =
            !painted && primitive.effect ? toConnectionEffect(primitive.effect.effect).extraWidth / scale : 0;
          joinPoints(box, primitive.segments, painted ? paintedJoinReach(width) : width + halo);
        }
        break;
      case "polygon": {
        const stroke = primitive.stroke?.width;
        const width = stroke === undefined ? 0 : resolveSceneSize(stroke, scale);
        joinPoints(box, primitive.points, painted ? paintedJoinReach(width) : width);
        break;
      }
      default:
        break;
    }
  }
  return box.minX <= box.maxX ? box : undefined;
}
