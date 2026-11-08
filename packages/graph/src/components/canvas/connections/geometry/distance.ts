import { SEGMENT_FLOATS, isLineSegment } from "./segments";
import type { TConnectionArrow } from "./types";

const MAX_CHORDS = 256;

function distanceToChord(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Smallest distance from the point to the cubics, subdividing each to `flatness` world units. */
export function distanceToSegments(
  segments: Float32Array,
  x: number,
  y: number,
  flatness: number,
  limit: number
): number {
  let best = Infinity;

  for (let i = 0; i + SEGMENT_FLOATS <= segments.length; i += SEGMENT_FLOATS) {
    const x0 = segments[i];
    const y0 = segments[i + 1];
    const x1 = segments[i + 2];
    const y1 = segments[i + 3];
    const x2 = segments[i + 4];
    const y2 = segments[i + 5];
    const x3 = segments[i + 6];
    const y3 = segments[i + 7];

    // The curve lies in the hull's box: skip cubics farther than `limit` from it.
    const minX = Math.min(x0, x1, x2, x3);
    const maxX = Math.max(x0, x1, x2, x3);
    const minY = Math.min(y0, y1, y2, y3);
    const maxY = Math.max(y0, y1, y2, y3);
    const boxDx = Math.max(minX - x, 0, x - maxX);
    const boxDy = Math.max(minY - y, 0, y - maxY);
    if (boxDx * boxDx + boxDy * boxDy > limit * limit) continue;

    if (isLineSegment(segments, i)) {
      best = Math.min(best, distanceToChord(x, y, x0, y0, x3, y3));
      continue;
    }

    const maxB2 =
      6 * Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
    const n = Math.min(MAX_CHORDS, Math.max(1, Math.ceil(Math.sqrt(maxB2 / (8 * flatness)))));

    let prevX = x0;
    let prevY = y0;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      const px = a * x0 + b * x1 + c * x2 + d * x3;
      const py = a * y0 + b * y1 + c * y2 + d * y3;
      best = Math.min(best, distanceToChord(x, y, prevX, prevY, px, py));
      prevX = px;
      prevY = py;
    }
  }

  return best;
}

function isInsidePolygon(points: Float32Array, x: number, y: number): boolean {
  let inside = false;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[2 * i];
    const yi = points[2 * i + 1];
    const xj = points[2 * j];
    const yj = points[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance to the arrow's outline; 0 inside a closed arrow. */
export function distanceToArrow(arrow: TConnectionArrow, x: number, y: number): number {
  const { points, closed } = arrow;
  const count = points.length / 2;
  if (count === 0) return Infinity;
  if (count === 1) return Math.hypot(x - points[0], y - points[1]);
  if (closed && isInsidePolygon(points, x, y)) return 0;

  let best = Infinity;
  const sides = closed ? count : count - 1;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % count;
    best = Math.min(best, distanceToChord(x, y, points[2 * i], points[2 * i + 1], points[2 * j], points[2 * j + 1]));
  }
  return best;
}
