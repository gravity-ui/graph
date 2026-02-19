import { MultipointConnection } from "./MultipointConnection";

const MIN_BEZIER_OFFSET = 25;

export function generateBezierParams(startPos: { x: number; y: number }, endPos: { x: number; y: number }) {
  const distance = Math.abs(endPos.x - startPos.x);
  const coef = Math.max(distance / 2, MIN_BEZIER_OFFSET);
  return [
    startPos,
    {
      x: startPos.x + coef,
      y: startPos.y,
    },
    {
      x: endPos.x - coef,
      y: endPos.y,
    },
    endPos,
  ];
}

export function bezierCurveLine(startPos: { x: number; y: number }, endPos: { x: number; y: number }): Path2D {
  const path = new Path2D();
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos);
  path.moveTo(start.x, start.y);
  path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);
  return path;
}

/**
 * Multipoint connection that draws segments as Bezier curves (horizontal segments as lines).
 * From commit a90f9c65 (ytsaurus-ui) — alternative line representation for layout graphs.
 */
export class BezierMultipointConnection extends MultipointConnection {
  public override createPath(): Path2D {
    const points = this.getPoints();
    if (!points.length) {
      return super.createPath();
    }

    const path = new Path2D();

    if (points.length === 1) {
      return path;
    }

    if (points.length === 2) {
      return bezierCurveLine(points[0], points[1]);
    }

    for (let i = 1; i < points.length; i++) {
      const startPoint = points[i - 1];
      const endPoint = points[i];

      if (startPoint.y === endPoint.y) {
        path.moveTo(startPoint.x, startPoint.y);
        path.lineTo(endPoint.x, endPoint.y);
      } else {
        const [start, firstPoint, secondPoint, end] = generateBezierParams(startPoint, endPoint);
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);
      }
    }

    return path;
  }
}
