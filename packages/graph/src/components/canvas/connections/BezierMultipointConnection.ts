import { TConnectionProps } from "./BlockConnection";
import { MultipointConnection } from "./MultipointConnection";
import { bezierCurveLine, generateBezierParams, getBezierCurveBounds } from "./bezierHelpers";

/**
 * Multipoint connection that draws segments as Bezier curves and keeps straight
 * segments aligned with the configured bezier direction as lines.
 * From commit a90f9c65 (ytsaurus-ui) — alternative line representation for layout graphs.
 */
export class BezierMultipointConnection extends MultipointConnection {
  protected override collectBBoxPoints(props: TConnectionProps = this.props) {
    const bounds = super.collectBBoxPoints(props);
    const points = this.getPoints();
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      if (points.length > 2 && (props.bezierDirection === "vertical" ? start.x === end.x : start.y === end.y)) {
        continue;
      }
      if (props.useTightBezierBounds === false) {
        const [, first, second] = generateBezierParams(start, end, props.bezierDirection);
        bounds.push(first, second);
      } else {
        const { x, y, width, height } = getBezierCurveBounds(start, end, props.bezierDirection);
        bounds.push({ x, y }, { x: x + width, y: y + height });
      }
    }
    return bounds;
  }

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
