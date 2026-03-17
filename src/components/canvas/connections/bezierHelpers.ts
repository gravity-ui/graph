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

/**
 * Samples points along a cubic bezier curve at uniform parameter intervals.
 * Used internally by `bezierCurveLineSegmented` and `bezierCurveLineDashed`.
 */
function sampleBezierPoints(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal",
  segments: number
): Array<{ x: number; y: number }> {
  const [start, cp1, cp2, end] = generateBezierParams(startPos, endPos, mode);
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    /* eslint-disable no-restricted-properties */
    points.push({
      x:
        Math.pow(1 - t, 3) * start.x +
        3 * Math.pow(1 - t, 2) * t * cp1.x +
        3 * (1 - t) * Math.pow(t, 2) * cp2.x +
        Math.pow(t, 3) * end.x,
      y:
        Math.pow(1 - t, 3) * start.y +
        3 * Math.pow(1 - t, 2) * t * cp1.y +
        3 * (1 - t) * Math.pow(t, 2) * cp2.y +
        Math.pow(t, 3) * end.y,
    });
    /* eslint-enable no-restricted-properties */
  }

  return points;
}

/**
 * Builds a dashed Path2D from a polyline, emulating `ctx.setLineDash` in the path itself.
 *
 * Unlike `ctx.setLineDash`, this embeds the dash pattern directly into the Path2D geometry.
 * This is essential for BatchPath2DRenderer: since all connections in a chunk are merged into
 * a single Path2D and rendered with one `ctx.stroke()` call, using `ctx.setLineDash` would
 * apply the same dash pattern to the entire batch — making it impossible to mix dashed and
 * non-dashed connections. By embedding dashes in the path, each connection carries its own
 * visual pattern regardless of batching.
 *
 * The function walks along the polyline segments accumulating arc length, alternating between
 * drawing (lineTo) and skipping (moveTo) according to the dash pattern.
 *
 * @param points - Polyline vertices (e.g. from sampleBezierPoints or [[x1,y1],[x2,y2]])
 * @param dashes - Dash pattern in world units, e.g. [6, 4] → 6px dash, 4px gap
 * @returns Path2D with actual gaps representing the dash pattern
 */
export function buildDashedPath(
  points: Array<{ x: number; y: number }>,
  dashes: number[]
): Path2D {
  const path = new Path2D();
  if (points.length < 2 || dashes.length === 0) return path;

  let dashIndex = 0;
  let remaining = dashes[0];
  let drawing = true;

  path.moveTo(points[0].x, points[0].y);
  let prev = points[0];

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) {
      prev = curr;
      continue;
    }

    let walked = 0;

    while (walked < segLen) {
      const step = Math.min(remaining, segLen - walked);
      walked += step;
      remaining -= step;

      const frac = walked / segLen;
      const px = prev.x + dx * frac;
      const py = prev.y + dy * frac;

      if (drawing) {
        path.lineTo(px, py);
      } else {
        path.moveTo(px, py);
      }

      if (remaining <= 0) {
        dashIndex = (dashIndex + 1) % dashes.length;
        remaining = dashes[dashIndex];
        drawing = !drawing;
      }
    }

    prev = curr;
  }

  return path;
}

/**
 * Approximates a bezier curve with line segments and returns a Path2D and accurate bounding box.
 *
 * Unlike `bezierCurveLine`, this function emulates the bezier curve using `segments` line segments.
 * The key advantage is that the resulting bbox reflects the actual curve geometry,
 * not just the two endpoints — which is critical for correct chunk visibility culling
 * in BatchPath2DRenderer.
 *
 * @param startPos - Start point of the connection
 * @param endPos - End point of the connection
 * @param mode - Bezier direction
 * @param segments - Number of line segments (more = smoother curve, higher quality bbox)
 * @returns Path2D approximating the bezier curve, and its tight bounding box
 */
export function bezierCurveLineSegmented(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal" = "horizontal",
  segments: number = 150
): { path: Path2D; bbox: [number, number, number, number] } {
  const points = sampleBezierPoints(startPos, endPos, mode, segments);
  const path = new Path2D();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { path, bbox: [minX, minY, maxX, maxY] };
}

/**
 * Approximates a bezier curve as a dashed Path2D with an accurate bounding box.
 *
 * Combines `sampleBezierPoints` + `buildDashedPath` to produce a bezier-shaped dashed line
 * where the dash pattern is embedded in the path geometry rather than relying on
 * `ctx.setLineDash`. This is required for correct rendering in BatchPath2DRenderer.
 *
 * @param startPos - Start point of the connection
 * @param endPos - End point of the connection
 * @param mode - Bezier direction
 * @param dashes - Dash pattern in world units, e.g. [6, 4]
 * @param segments - Number of sample points for curve approximation
 * @returns Dashed Path2D and its tight bounding box
 */
export function bezierCurveLineDashed(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  mode: "vertical" | "horizontal" = "horizontal",
  dashes: number[] = [6, 4],
  segments: number = 150
): { path: Path2D; bbox: [number, number, number, number] } {
  const points = sampleBezierPoints(startPos, endPos, mode, segments);
  const path = buildDashedPath(points, dashes);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { path, bbox: [minX, minY, maxX, maxY] };
}

export function isPointInStroke(ctx: CanvasRenderingContext2D, path: Path2D, x: number, y: number, threshold?: number) {
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
