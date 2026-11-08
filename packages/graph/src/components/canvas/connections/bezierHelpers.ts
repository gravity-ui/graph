import type { TPoint, TRect } from "../../../utils/types/shapes";

export function generateBezierParams(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal" = "horizontal"
) {
  const distance = Math.abs(endPos.x - startPos.x);
  const coef = mode === "horizontal" ? Math.max(distance / 2, 25) : 0;
  const coefY = mode === "vertical" ? Math.max(distance / 2, 25) : 0;
  return [
    startPos,
    {
      x: startPos.x + coef,
      y: startPos.y + coefY,
    },
    {
      x: endPos.x - coef,
      y: endPos.y - coefY,
    },
    endPos,
  ];
}

export function bezierCurveLine(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal" = "horizontal"
) {
  const path = new Path2D();
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos, mode);
  path.moveTo(start.x, start.y);
  path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);

  return path;
}

const BEZIER_EPSILON = 1e-8;

/**
 * Writes the parameters in (0, 1) where one coordinate of a cubic Bezier has an extremum into `times` from `count`;
 * returns the new count. The derivative of a cubic Bezier coordinate is a quadratic polynomial: a*t^2 + b*t + c = 0.
 */
function writeCubicExtrema(
  start: number,
  firstPoint: number,
  secondPoint: number,
  end: number,
  times: Float64Array,
  count: number
): number {
  const a = -start + 3 * firstPoint - 3 * secondPoint + end;
  const b = 2 * (start - 2 * firstPoint + secondPoint);
  const c = firstPoint - start;

  if (Math.abs(a) < BEZIER_EPSILON) {
    if (Math.abs(b) < BEZIER_EPSILON) {
      return count;
    }

    const t = -c / b;
    if (t > 0 && t < 1) times[count++] = t;
    return count;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -BEZIER_EPSILON) {
    return count;
  }

  const sqrtDiscriminant = Math.sqrt(Math.max(0, discriminant));
  const denominator = 2 * a;
  const first = (-b - sqrtDiscriminant) / denominator;
  const second = (-b + sqrtDiscriminant) / denominator;
  if (first > 0 && first < 1) times[count++] = first;
  if (second > 0 && second < 1) times[count++] = second;
  return count;
}

/** One coordinate of a cubic Bezier at `time`. */
function getCubicCoordinate(start: number, firstPoint: number, secondPoint: number, end: number, time: number): number {
  const inverseTime = 1 - time;
  return (
    inverseTime ** 3 * start +
    3 * inverseTime ** 2 * time * firstPoint +
    3 * inverseTime * time ** 2 * secondPoint +
    time ** 3 * end
  );
}

/** The ends and at most two extrema per coordinate. */
const cubicTimes = new Float64Array(6);

/**
 * Joins the tight axis-aligned bounds of the cubic Bezier (x0, y0) (x1, y1) (x2, y2) (x3, y3) into `bounds`
 * ([minX, minY, maxX, maxY]) without allocating.
 */
export function joinCubicBounds(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  bounds: [number, number, number, number]
): void {
  const times = cubicTimes;
  times[0] = 0;
  times[1] = 1;
  let count = writeCubicExtrema(x0, x1, x2, x3, times, 2);
  count = writeCubicExtrema(y0, y1, y2, y3, times, count);
  for (let i = 0; i < count; i++) {
    const x = getCubicCoordinate(x0, x1, x2, x3, times[i]);
    const y = getCubicCoordinate(y0, y1, y2, y3, times[i]);
    if (x < bounds[0]) bounds[0] = x;
    if (y < bounds[1]) bounds[1] = y;
    if (x > bounds[2]) bounds[2] = x;
    if (y > bounds[3]) bounds[3] = y;
  }
}

/**
 * Returns the tight axis-aligned bounds of the cubic Bezier curve.
 *
 * Control points are not necessarily on the curve. Using their bounds is a
 * safe broad-phase approximation, but can substantially inflate usableRect.
 */
export function getBezierCurveBounds(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal" = "horizontal"
): TRect {
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos, mode);
  return getCubicBounds(start, firstPoint, secondPoint, end);
}

/** The tight axis-aligned bounds of a cubic Bezier curve given by its four points. */
export function getCubicBounds(p0: TPoint, c1: TPoint, c2: TPoint, p3: TPoint): TRect {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  joinCubicBounds(p0.x, p0.y, c1.x, c1.y, c2.x, c2.y, p3.x, p3.y, bounds);
  const [minX, minY, maxX, maxY] = bounds;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// https://stackguides.com/questions/14174252/how-to-find-out-y-coordinate-of-specific-point-in-bezier-curve-in-canvas
export function getPointOfBezierCurve(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  time: number,
  mode: "vertical" | "horizontal" = "horizontal"
) {
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos, mode);
  return {
    x:
      Math.pow(1 - time, 3) * start.x +
      3 * Math.pow(1 - time, 2) * time * firstPoint.x +
      3 * (1 - time) * Math.pow(time, 2) * secondPoint.x +
      Math.pow(time, 3) * end.x,
    y:
      Math.pow(1 - time, 3) * start.y +
      3 * Math.pow(1 - time, 2) * time * firstPoint.y +
      3 * (1 - time) * Math.pow(time, 2) * secondPoint.y +
      Math.pow(time, 3) * end.y,
  };
}

export function isPointInStroke(
  ctx: CanvasRenderingContext2D | undefined | null,
  path: Path2D | undefined | null,
  x: number,
  y: number,
  threshold?: number
): boolean {
  if (!ctx || !path || !(path instanceof Path2D)) {
    return false;
  }

  const l = ctx.lineWidth;
  if (threshold) {
    ctx.lineWidth = threshold;
  }

  const intersectsLine = ctx.isPointInStroke(path, x, y);
  ctx.lineWidth = l;
  return intersectsLine;
}

export function getArrowCoords(
  useBezier: boolean,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  mode: "vertical" | "horizontal" = "horizontal"
) {
  const angle = Math.PI / 4;
  const d = 8;
  let x: number;
  let y: number;
  // calculate the angle of the line
  let lineangle: number;

  if (useBezier) {
    const bezierPos = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.5, mode);
    x = bezierPos.x;
    y = bezierPos.y;

    const bezierPos1 = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.4, mode);
    const bezierPos2 = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.6, mode);
    lineangle = Math.atan2(bezierPos2.y - bezierPos1.y, bezierPos2.x - bezierPos1.x);
  } else {
    x = x1 + (x2 - x1) / 2;
    y = y1 + (y2 - y1) / 2;
    lineangle = Math.atan2(y2 - y1, x2 - x1);
  }

  // h is the line length of a side of the arrow head
  const h = Math.abs(d / Math.cos(angle));

  const angle1 = lineangle + Math.PI + angle;
  const topx = x + Math.cos(angle1) * h;
  const topy = y + Math.sin(angle1) * h;

  const angle2 = lineangle + Math.PI - angle;
  const botx = x + Math.cos(angle2) * h;
  const boty = y + Math.sin(angle2) * h;

  return [topx, topy, x, y, botx, boty];
}
