import type { TTileRect } from "../culling/TileIndex";

import type { TPathBounds } from "./types";

export function isValidBounds(bounds: TPathBounds | undefined): bounds is TPathBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds[0]) &&
      Number.isFinite(bounds[1]) &&
      Number.isFinite(bounds[2]) &&
      Number.isFinite(bounds[3]) &&
      bounds[0] <= bounds[2] &&
      bounds[1] <= bounds[3]
  );
}

/** Whether bounds intersect the viewport, edges inclusive; true without a viewport or valid bounds. */
export function boundsIntersect(bounds: TPathBounds | undefined, viewport: TTileRect | undefined): boolean {
  if (!viewport || !isValidBounds(bounds)) return true;
  return (
    bounds[0] <= viewport.maxX && bounds[2] >= viewport.minX && bounds[1] <= viewport.maxY && bounds[3] >= viewport.minY
  );
}
