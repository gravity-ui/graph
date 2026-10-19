import type { TPoint } from "@gravity-ui/graph";

/** Cubic segment: start, two control points, end. Straight lines are stored as cubics too. */
export type TCubic = [p0: TPoint, c1: TPoint, c2: TPoint, p3: TPoint];

export type TCurveMode = "bezier" | "straight";

export type TBezierDirection = "horizontal" | "vertical";

/**
 * Control points of a connection between two ports.
 * Uses the same formula as the canvas connections (`generateBezierParams` in core), so a WebGL curve
 * matches the canvas one.
 */
export function connectionCubic(
  start: TPoint,
  end: TPoint,
  mode: TCurveMode,
  direction: TBezierDirection = "horizontal"
): TCubic {
  if (mode === "straight") {
    return straightCubic(start, end);
  }
  const distance = Math.abs(end.x - start.x);
  const coefX = direction === "horizontal" ? Math.max(distance / 2, 25) : 0;
  const coefY = direction === "vertical" ? Math.max(distance / 2, 25) : 0;
  return [
    { x: start.x, y: start.y },
    { x: start.x + coefX, y: start.y + coefY },
    { x: end.x - coefX, y: end.y - coefY },
    { x: end.x, y: end.y },
  ];
}

/** A straight segment as a cubic with uniform parametrization, so t=0.5 is the midpoint. */
export function straightCubic(start: TPoint, end: TPoint): TCubic {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return [
    { x: start.x, y: start.y },
    { x: start.x + dx / 3, y: start.y + dy / 3 },
    { x: start.x + (2 * dx) / 3, y: start.y + (2 * dy) / 3 },
    { x: end.x, y: end.y },
  ];
}

export function cubicPoint([p0, c1, c2, p3]: TCubic, t: number): TPoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** Bounding box of the control polygon: conservative bounds of the curve. */
export function cubicBounds(cubic: TCubic): [minX: number, minY: number, maxX: number, maxY: number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of cubic) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return [minX, minY, maxX, maxY];
}

/** Approximate arc length: mean of the chord and the control polygon length. Used for dashes. */
export function cubicApproxLength([p0, c1, c2, p3]: TCubic): number {
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const net =
    Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p3.x - c2.x, p3.y - c2.y);
  return (chord + net) / 2;
}

/**
 * Parameter length of each stub when a connection is drawn as two stubs of `stubPx` screen pixels.
 * Mirrors the vertex shader: 0.5 means the whole curve is drawn.
 */
export function stubParameter(cubic: TCubic, scale: number, stubPx: number): number {
  if (stubPx <= 0) return 0.5;
  const [p0, , , p3] = cubic;
  const chordPx = Math.hypot(p3.x - p0.x, p3.y - p0.y) * scale;
  return Math.min(0.5, Math.max(0, stubPx / Math.max(chordPx, 0.001)));
}

function distanceToSegment(p: TPoint, a: TPoint, b: TPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Distance from a point to the drawn part of a cubic. With `tau < 0.5` only the two stubs
 * [0, tau] and [1 - tau, 1] are drawn, so only they are tested.
 */
export function distanceToCubic(point: TPoint, cubic: TCubic, tau = 0.5, steps = 24): number {
  const ranges: Array<[number, number]> =
    tau >= 0.5
      ? [[0, 1]]
      : [
          [0, tau],
          [1 - tau, 1],
        ];
  let best = Infinity;
  for (const [from, to] of ranges) {
    let prev = cubicPoint(cubic, from);
    for (let i = 1; i <= steps; i++) {
      const next = cubicPoint(cubic, from + ((to - from) * i) / steps);
      best = Math.min(best, distanceToSegment(point, prev, next));
      prev = next;
    }
  }
  return best;
}
