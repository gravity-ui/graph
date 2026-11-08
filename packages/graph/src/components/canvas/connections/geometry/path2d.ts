import { SEGMENT_FLOATS, isLineSegment } from "./segments";
import type { TConnectionArrow } from "./types";

/** One subpath per run of connected cubics; lines built by `lineSegment` become `lineTo`. */
export function createSegmentsPath(segments: Float32Array): Path2D {
  const path = new Path2D();
  let endX = NaN;
  let endY = NaN;

  for (let i = 0; i + SEGMENT_FLOATS <= segments.length; i += SEGMENT_FLOATS) {
    if (segments[i] !== endX || segments[i + 1] !== endY) {
      path.moveTo(segments[i], segments[i + 1]);
    }
    if (isLineSegment(segments, i)) {
      path.lineTo(segments[i + 6], segments[i + 7]);
    } else {
      path.bezierCurveTo(
        segments[i + 2],
        segments[i + 3],
        segments[i + 4],
        segments[i + 5],
        segments[i + 6],
        segments[i + 7]
      );
    }
    endX = segments[i + 6];
    endY = segments[i + 7];
  }

  return path;
}

/** The chevron (moveTo + lineTo) or the triangle (closed). */
export function createArrowPath(arrow: TConnectionArrow): Path2D {
  const path = new Path2D();
  const { points } = arrow;

  if (points.length >= 2) {
    path.moveTo(points[0], points[1]);
    for (let i = 2; i + 1 < points.length; i += 2) {
      path.lineTo(points[i], points[i + 1]);
    }
    if (arrow.closed) {
      path.closePath();
    }
  }

  return path;
}
