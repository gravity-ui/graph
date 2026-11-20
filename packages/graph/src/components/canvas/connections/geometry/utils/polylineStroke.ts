import type { TPoint } from "../../../../../utils/types/shapes";

/** A turned stock polyline can cover its own samples when it retraces or its stroke is wider than its bend. */
export const turnedPolylineStrokes = new WeakSet<Float32Array>();

export function markPolylineStroke(segments: Float32Array, points: readonly TPoint[]): Float32Array {
  let dx = 0;
  let dy = 0;
  for (let i = 1; i < points.length; i++) {
    const x = points[i].x - points[i - 1].x;
    const y = points[i].y - points[i - 1].y;
    if (x === 0 && y === 0) continue;
    if ((dx || dy) && (dx * y !== dy * x || dx * x + dy * y <= 0)) {
      turnedPolylineStrokes.add(segments);
      break;
    }
    dx = x;
    dy = y;
  }
  return segments;
}
