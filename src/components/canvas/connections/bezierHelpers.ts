import type { TRect } from "../../../utils/types/shapes";

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

function getCubicExtrema(start: number, firstPoint: number, secondPoint: number, end: number): number[] {
  // The derivative of a cubic Bezier coordinate is a quadratic polynomial:
  // a*t^2 + b*t + c = 0.
  const a = -start + 3 * firstPoint - 3 * secondPoint + end;
  const b = 2 * (start - 2 * firstPoint + secondPoint);
  const c = firstPoint - start;

  if (Math.abs(a) < BEZIER_EPSILON) {
    if (Math.abs(b) < BEZIER_EPSILON) {
      return [];
    }

    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -BEZIER_EPSILON) {
    return [];
  }

  const sqrtDiscriminant = Math.sqrt(Math.max(0, discriminant));
  const denominator = 2 * a;
  const roots = [(-b - sqrtDiscriminant) / denominator, (-b + sqrtDiscriminant) / denominator];

  return roots.filter((t) => t > 0 && t < 1);
}

function getPointAtBezierCurve(
  startPos: { x: number; y: number },
  firstPoint: { x: number; y: number },
  secondPoint: { x: number; y: number },
  endPos: { x: number; y: number },
  time: number
) {
  const inverseTime = 1 - time;

  return {
    x:
      inverseTime ** 3 * startPos.x +
      3 * inverseTime ** 2 * time * firstPoint.x +
      3 * inverseTime * time ** 2 * secondPoint.x +
      time ** 3 * endPos.x,
    y:
      inverseTime ** 3 * startPos.y +
      3 * inverseTime ** 2 * time * firstPoint.y +
      3 * inverseTime * time ** 2 * secondPoint.y +
      time ** 3 * endPos.y,
  };
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
  const times = [
    0,
    1,
    ...getCubicExtrema(start.x, firstPoint.x, secondPoint.x, end.x),
    ...getCubicExtrema(start.y, firstPoint.y, secondPoint.y, end.y),
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  times.forEach((time) => {
    const point = getPointAtBezierCurve(start, firstPoint, secondPoint, end, time);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

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
  /* eslint-disable no-restricted-properties */
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
  /* eslint-enable no-restricted-properties */
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
