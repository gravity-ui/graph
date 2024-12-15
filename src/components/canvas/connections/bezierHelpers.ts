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
