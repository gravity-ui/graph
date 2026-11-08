import type { TPathBounds } from "../../../../lib/batch/types";
import { joinCubicBounds } from "../bezierHelpers";

import { SEGMENT_FLOATS, isLineSegment } from "./segments";

/**
 * Bounds of every cubic: tight (curve extrema) or, with `tight = false`, the control-point hull. A straight cubic
 * (`isLineSegment`, drawn with `lineTo`) is bounded by its endpoints in both modes.
 */
export function getSegmentsBounds(segments: Float32Array, tight: boolean): TPathBounds | undefined {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  for (let i = 0; i + SEGMENT_FLOATS <= segments.length; i += SEGMENT_FLOATS) {
    if (isLineSegment(segments, i)) {
      joinPoint(bounds, segments[i], segments[i + 1]);
      joinPoint(bounds, segments[i + 6], segments[i + 7]);
    } else if (tight) {
      joinCubicBounds(
        segments[i],
        segments[i + 1],
        segments[i + 2],
        segments[i + 3],
        segments[i + 4],
        segments[i + 5],
        segments[i + 6],
        segments[i + 7],
        bounds
      );
    } else {
      for (let j = 0; j < SEGMENT_FLOATS; j += 2) {
        joinPoint(bounds, segments[i + j], segments[i + j + 1]);
      }
    }
  }

  return bounds[0] === Infinity ? undefined : bounds;
}

function joinPoint(bounds: [number, number, number, number], x: number, y: number): void {
  if (x < bounds[0]) bounds[0] = x;
  if (y < bounds[1]) bounds[1] = y;
  if (x > bounds[2]) bounds[2] = x;
  if (y > bounds[3]) bounds[3] = y;
}
