import { getTriangleArrowPoints } from "../../../../utils/shapes/triangle";
import type { TPoint } from "../../../../utils/types/shapes";
import { generateBezierParams, getArrowCoords } from "../utils/bezierHelpers";

import {
  SEGMENT_FLOATS,
  bezierSegment,
  lineSegment,
  roundedPolyline,
  stockBezierSegments,
  writeBezierSegment,
  writeLineSegment,
} from "./segments";
import type { TConnectionGeometry, TConnectionGeometryFn, TConnectionGeometryInput } from "./types";
import { markPolylineStroke } from "./utils/polylineStroke";

const POLYLINE_RADIUS = 10;
const TRIANGLE_HEIGHT = 16;
const TRIANGLE_BASE = 20;

function bezierPiece(from: TPoint, to: TPoint, direction: "horizontal" | "vertical"): number[] {
  const [p0, c1, c2, p3] = generateBezierParams(from, to, direction);
  return bezierSegment(p0, c1, c2, p3);
}

function endArrow(segments: Float32Array): TConnectionGeometry["arrow"] {
  const last = segments.length - 2;
  const x = segments[last];
  const y = segments[last + 1];
  let previous = last - 2;
  while (previous >= 0 && segments[previous] === x && segments[previous + 1] === y) previous -= 2;
  if (previous < 0) return undefined;
  const from = { x: segments[previous], y: segments[previous + 1] };
  const [tip, left, right] = getTriangleArrowPoints(from, { x, y }, TRIANGLE_HEIGHT, TRIANGLE_BASE);
  return {
    points: new Float32Array([tip.x, tip.y, left.x, left.y, right.x, right.y]),
    closed: true,
    position: "end",
  };
}

function middleArrow(input: TConnectionGeometryInput, bezier: boolean): TConnectionGeometry["arrow"] {
  const { source, target, bezierDirection } = input;
  if (source.x === target.x && source.y === target.y) return undefined;
  return {
    points: new Float32Array(getArrowCoords(bezier, source.x, source.y, target.x, target.y, bezierDirection)),
    closed: false,
    position: "inline",
  };
}

export const straightGeometry: TConnectionGeometryFn = (input) => {
  const { source, target } = input;
  const segments = new Float32Array(SEGMENT_FLOATS);
  writeLineSegment(segments, 0, source, target);
  return {
    segments,
    arrow: middleArrow(input, false),
  };
};

export const bezierGeometry: TConnectionGeometryFn = (input) => {
  const { source, target, bezierDirection } = input;
  const [p0, c1, c2, p3] = generateBezierParams(source, target, bezierDirection);
  const segments = new Float32Array(SEGMENT_FLOATS);
  writeBezierSegment(segments, 0, p0, c1, c2, p3);
  stockBezierSegments.add(segments);
  return {
    segments,
    arrow: middleArrow(input, true),
  };
};

export const blockGeometry: TConnectionGeometryFn = (input: TConnectionGeometryInput) =>
  input.useBezier ? bezierGeometry(input) : straightGeometry(input);

function resolveMultipointEnds({
  points,
  source,
  target,
  sourceDelegated,
  targetDelegated,
}: TConnectionGeometryInput): readonly TPoint[] {
  if (points.length < 2 || (!sourceDelegated && !targetDelegated)) return points;
  const resolved = [...points];
  if (sourceDelegated) resolved[0] = source;
  if (targetDelegated) resolved[resolved.length - 1] = target;
  return resolved;
}

export const multipointGeometry: TConnectionGeometryFn = (input) => {
  const points = resolveMultipointEnds(input);
  if (points.length === 0) {
    return blockGeometry(input);
  }
  const end = points[points.length - 1];
  let previous = points.length - 2;
  while (previous >= 0 && points[previous].x === end.x && points[previous].y === end.y) previous--;
  if (previous < 0) return undefined;
  const segments = markPolylineStroke(new Float32Array(roundedPolyline(points, POLYLINE_RADIUS)), points);
  return { segments, arrow: endArrow(segments) };
};

export const bezierMultipointGeometry: TConnectionGeometryFn = (input) => {
  const { bezierDirection } = input;
  const points = resolveMultipointEnds(input);
  if (points.length === 0) {
    return blockGeometry(input);
  }
  if (points.length === 1) {
    return undefined;
  }
  const numbers: number[] = [];
  if (points.length === 2) {
    numbers.push(...bezierPiece(points[0], points[1], bezierDirection));
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const straight = bezierDirection === "vertical" ? from.x === to.x : from.y === to.y;
      numbers.push(...(straight ? lineSegment(from, to) : bezierPiece(from, to, bezierDirection)));
    }
  }
  const segments = new Float32Array(numbers);
  return { segments, arrow: endArrow(segments) };
};
