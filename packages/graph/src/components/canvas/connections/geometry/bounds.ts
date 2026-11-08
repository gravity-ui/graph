import type { TPathBounds } from "../../../../lib/batch/types";
import { getCubicBounds } from "../bezierHelpers";

import { SEGMENT_FLOATS } from "./segments";

/** Bounds of every cubic: tight (curve extrema) or, with `tight = false`, the control-point hull. */
export function getSegmentsBounds(segments: Float32Array, tight: boolean): TPathBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + SEGMENT_FLOATS <= segments.length; i += SEGMENT_FLOATS) {
    if (tight) {
      const rect = getCubicBounds(
        { x: segments[i], y: segments[i + 1] },
        { x: segments[i + 2], y: segments[i + 3] },
        { x: segments[i + 4], y: segments[i + 5] },
        { x: segments[i + 6], y: segments[i + 7] }
      );
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    } else {
      for (let j = 0; j < SEGMENT_FLOATS; j += 2) {
        minX = Math.min(minX, segments[i + j]);
        maxX = Math.max(maxX, segments[i + j]);
        minY = Math.min(minY, segments[i + j + 1]);
        maxY = Math.max(maxY, segments[i + j + 1]);
      }
    }
  }

  return minX === Infinity ? undefined : [minX, minY, maxX, maxY];
}
