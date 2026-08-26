import { MultipointConnection } from "./MultipointConnection";
import { bezierCurveLine, generateBezierParams } from "./bezierHelpers";

/**
 * Multipoint connection that draws segments as Bezier curves and keeps straight
 * segments aligned with the configured bezier direction as lines.
 * From commit a90f9c65 (ytsaurus-ui) — alternative line representation for layout graphs.
 */
export class BezierMultipointConnection extends MultipointConnection {
  public override createPath(): Path2D {
    const points = this.getPoints();
    const direction = this.props.bezierDirection;
    if (!points.length) {
      return super.createPath();
    }

    const path = new Path2D();

    if (points.length === 1) {
      return path;
    }

    if (points.length === 2) {
      return bezierCurveLine(points[0], points[1], direction);
    }

    for (let i = 1; i < points.length; i++) {
      const startPoint = points[i - 1];
      const endPoint = points[i];
      const isStraightSegment = direction === "vertical" ? startPoint.x === endPoint.x : startPoint.y === endPoint.y;

      if (isStraightSegment) {
        path.moveTo(startPoint.x, startPoint.y);
        path.lineTo(endPoint.x, endPoint.y);
      } else {
        const [start, firstPoint, secondPoint, end] = generateBezierParams(startPoint, endPoint, direction);
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);
      }
    }

    return path;
  }
}
