import type { TPoint } from "../../../../utils/types/shapes";

/** Numbers per cubic segment: p0, c1, c2, p3. */
export const SEGMENT_FLOATS = 8;

/** Max distance, in world units, of a control point from its third of the chord for a cubic to count as a line. */
const LINE_TOLERANCE = 0.01;
/** Turns sharper than this (a reversal) keep the corner sharp. */
const REVERSAL_ANGLE = Math.PI - 0.01;
const MIN_TURN = 1e-6;
const MIN_TANGENT = 1e-9;

/** A straight line as a cubic: control points at the chord's thirds. */
export function lineSegment(from: TPoint, to: TPoint): number[] {
  const dx = (to.x - from.x) / 3;
  const dy = (to.y - from.y) / 3;
  return [from.x, from.y, from.x + dx, from.y + dy, from.x + 2 * dx, from.y + 2 * dy, to.x, to.y];
}

export function bezierSegment(p0: TPoint, c1: TPoint, c2: TPoint, p3: TPoint): number[] {
  return [p0.x, p0.y, c1.x, c1.y, c2.x, c2.y, p3.x, p3.y];
}

/** Whether the cubic at `offset` is a straight line built like `lineSegment`: control points at the chord's thirds. */
export function isLineSegment(segments: ArrayLike<number>, offset: number): boolean {
  const x0 = segments[offset];
  const y0 = segments[offset + 1];
  const dx = (segments[offset + 6] - x0) / 3;
  const dy = (segments[offset + 7] - y0) / 3;
  return (
    Math.abs(segments[offset + 2] - (x0 + dx)) <= LINE_TOLERANCE &&
    Math.abs(segments[offset + 3] - (y0 + dy)) <= LINE_TOLERANCE &&
    Math.abs(segments[offset + 4] - (x0 + 2 * dx)) <= LINE_TOLERANCE &&
    Math.abs(segments[offset + 5] - (y0 + 2 * dy)) <= LINE_TOLERANCE
  );
}

/**
 * A polyline whose corners are rounded with cubic arcs of at most `radius`; the radius shrinks with the turn
 * and to fit into the adjacent pieces. Repeated points are skipped.
 */
export function roundedPolyline(points: readonly TPoint[], radius: number): number[] {
  const path: TPoint[] = [];
  for (const point of points) {
    const last = path[path.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      path.push(point);
    }
  }
  if (path.length < 2) {
    return [];
  }

  const result: number[] = [];
  let current = path[0];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const corner = path[i];
    const next = path[i + 1];
    const lenIn = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const lenOut = Math.hypot(next.x - corner.x, next.y - corner.y);
    const inX = (corner.x - prev.x) / lenIn;
    const inY = (corner.y - prev.y) / lenIn;
    const outX = (next.x - corner.x) / lenOut;
    const outY = (next.y - corner.y) / lenOut;

    const theta = Math.acos(Math.max(-1, Math.min(1, inX * outX + inY * outY)));
    let r = Math.min(radius, (radius * theta) / Math.PI);
    const tan = Math.tan(theta / 2);
    // Rounded to 1e-9 to drop float noise like 4.999999999999999.
    const d = Math.round(Math.min(r * tan, lenIn / 2, lenOut / 2) * 1e9) / 1e9;

    if (theta < MIN_TURN || theta > REVERSAL_ANGLE || d < MIN_TANGENT) {
      result.push(...lineSegment(current, corner));
      current = corner;
      continue;
    }

    r = d / tan;
    const start = { x: corner.x - inX * d, y: corner.y - inY * d };
    const end = { x: corner.x + outX * d, y: corner.y + outY * d };
    const handle = (4 / 3) * Math.tan(theta / 4) * r;
    result.push(
      ...lineSegment(current, start),
      ...bezierSegment(
        start,
        { x: start.x + inX * handle, y: start.y + inY * handle },
        { x: end.x - outX * handle, y: end.y - outY * handle },
        end
      )
    );
    current = end;
  }
  result.push(...lineSegment(current, path[path.length - 1]));
  return result;
}
