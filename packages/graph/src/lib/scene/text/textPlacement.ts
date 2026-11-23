import type { TTileRect } from "../../culling/TileIndex";
import type { TSceneTextPolicy } from "../types";
import { rotateBounds } from "../utils/rotateBounds";

import { TEXT_METRICS_PX, boundingLineCount, pitchRatio, verticalShare } from "./textLayout";
import type { ISceneTextMetrics, TTextPrimitive } from "./textLayout";

/** The policy of a graph without the `cameraAwareText` setting: camera-aware texts follow the camera. */
export const DEFAULT_TEXT_POLICY: TSceneTextPolicy = Object.freeze({ cameraAware: true });

/** Whether a text's size is in screen pixels under the policy: its own mode on, and the policy allows it. */
export function isCameraAwareText(primitive: TTextPrimitive, policy?: TSceneTextPolicy): boolean {
  return Boolean(primitive.cameraAware) && policy?.cameraAware !== false;
}

/**
 * The world font size of a text at a camera scale: `size` for a world text (or under a policy that turns camera
 * awareness off), else `size / scale` clamped by its `cameraAware` bounds.
 */
export function resolveTextSize(primitive: TTextPrimitive, scale: number, policy?: TSceneTextPolicy): number {
  const mode = primitive.cameraAware;
  if (!mode || policy?.cameraAware === false) return primitive.size;
  const world = primitive.size / scale;
  if (mode === true) return world;
  return Math.min(Math.max(world, mode.minWorld ?? -Infinity), mode.maxWorld ?? Infinity);
}

/** The share of the box's width an alignment anchors to: 0 left (start), 0.5 centre, 1 right (end). */
export function horizontalShare(align: CanvasTextAlign | undefined): number {
  if (align === "center") return 0.5;
  if (align === "right" || align === "end") return 1;
  return 0;
}

/** Where a laid-out text draws at a resolved size, relative to its element's origin. */
export type TTextPlacement = {
  /** The anchor x: each line aligns to it by `align`. */
  x: number;
  /** The anchor y: the block of lines lies on it by `verticalAlign`. */
  y: number;
  /** The top of the first line. */
  top: number;
  /** The resolved line pitch: line `i`'s top is `top + i * pitch`. */
  pitch: number;
  /** How far each line's alphabetic baseline lies below its top. */
  baseline: number;
};

/**
 * The box's height the block of lines aligns to: `height`, or without one the block of `lines` lines at the authored
 * `lineHeight`, so a heightless text keeps its anchor as its size changes.
 */
function boxHeight(primitive: TTextPrimitive, lines: number): number {
  return primitive.height ?? lines * Math.max(0, primitive.lineHeight);
}

/** The anchor of a text of `lines` lines: on the box's left edge, centre or right edge, and top, centre or bottom. */
export function textAnchor(primitive: TTextPrimitive, lines: number): { x: number; y: number } {
  return {
    x: primitive.x + primitive.width * horizontalShare(primitive.align),
    y: primitive.y + boxHeight(primitive, lines) * verticalShare(primitive.verticalAlign),
  };
}

/** Where a text of `lines` lines draws at the resolved size `size`. */
export function placeText(
  primitive: TTextPrimitive,
  lines: number,
  size: number,
  metrics: ISceneTextMetrics
): TTextPlacement {
  const anchor = textAnchor(primitive, lines);
  const pitch = pitchRatio(primitive) * size;
  return {
    x: anchor.x,
    y: anchor.y,
    top: anchor.y - verticalShare(primitive.verticalAlign) * lines * pitch,
    pitch,
    baseline: (metrics.top(primitive.family, primitive.weight ?? "normal") * size) / TEXT_METRICS_PX,
  };
}

/** The text's clip box relative to its element's origin: its box, unbounded vertically without a height. */
export function textClip(primitive: TTextPrimitive): TTileRect {
  const { x, y, width, height } = primitive;
  return {
    minX: Math.min(x, x + width),
    minY: height === undefined ? -Infinity : Math.min(y, y + height),
    maxX: Math.max(x, x + width),
    maxY: height === undefined ? Infinity : Math.max(y, y + height),
  };
}

/**
 * The largest resolved size of a text over the scales it is shown at, under any policy: its `size`, or its size at
 * `lowestScale` when it is camera-aware (larger when the camera zooms out).
 */
export function largestTextSize(primitive: TTextPrimitive, lowestScale: number): number {
  return Math.max(primitive.size, resolveTextSize(primitive, lowestScale));
}

/**
 * The culling bounds of a text relative to its element's origin (spec §3.2). Its lines never leave its box (a text
 * whose layout overflows is clipped to it; glyph ink may overhang by its side bearings, as in v1), so a text with a
 * height contributes the box. A heightless text is unbounded vertically: it contributes its width and the block of
 * the lines it can have at any size up to its largest (`largestSize`, `boundingLineCount`), placed by its alignment,
 * with half that size above and below for ink past the line boxes; fewer lines at a smaller size lie within it.
 * `drawnLines`, for a text drawn at `largestSize` alone (a world text), is the count of its laid-out lines there,
 * which replaces the bounding wrap.
 */
export function textBounds(
  primitive: TTextPrimitive,
  largestSize: number,
  metrics: ISceneTextMetrics,
  drawnLines?: number
): TTileRect {
  const clip = textClip(primitive);
  const rotation = primitive.rotation;
  if (primitive.height !== undefined) {
    if (!rotation) return clip;
    const anchor = textAnchor(primitive, 1);
    return rotateBounds(clip, anchor.x, anchor.y, rotation);
  }
  const lines = drawnLines ?? boundingLineCount(primitive, largestSize, metrics);
  const pitch = pitchRatio(primitive) * largestSize;
  const anchor = textAnchor(primitive, lines);
  const top = anchor.y - verticalShare(primitive.verticalAlign) * lines * pitch;
  const pad = largestSize / 2;
  const bounds = {
    minX: clip.minX,
    minY: Math.min(primitive.y, top) - pad,
    maxX: clip.maxX,
    maxY: Math.max(primitive.y + boxHeight(primitive, lines), top + lines * pitch) + pad,
  };
  if (!rotation) return bounds;
  const rotated = rotateBounds(bounds, anchor.x, anchor.y, rotation);
  if (!primitive.cameraAware || anchor.y === primitive.y) return rotated;
  // The alignment anchor of camera-aware, heightless text can move when its line count changes.
  const first = rotateBounds(bounds, anchor.x, primitive.y, rotation);
  return {
    minX: Math.min(rotated.minX, first.minX),
    minY: Math.min(rotated.minY, first.minY),
    maxX: Math.max(rotated.maxX, first.maxX),
    maxY: Math.max(rotated.maxY, first.maxY),
  };
}
