import { getTriangleArrowPoints } from "../../../../utils/shapes/triangle";
import type { TPoint } from "../../../../utils/types/shapes";
import { generateBezierParams, getArrowCoords } from "../bezierHelpers";

import { bezierSegment, lineSegment, roundedPolyline } from "./segments";
import type { TConnectionGeometry, TConnectionGeometryFn, TConnectionGeometryInput } from "./types";

const POLYLINE_RADIUS = 10;
const TRIANGLE_HEIGHT = 16;
const TRIANGLE_BASE = 10;

function bezierPiece(from: TPoint, to: TPoint, direction: "horizontal" | "vertical"): number[] {
  const [p0, c1, c2, p3] = generateBezierParams(from, to, direction);
  return bezierSegment(p0, c1, c2, p3);
}

function triangleArrow(points: readonly TPoint[]): TConnectionGeometry["arrow"] {
  const [tip, left, right] = getTriangleArrowPoints(
    points[points.length - 2],
    points[points.length - 1],
    TRIANGLE_HEIGHT,
    TRIANGLE_BASE
  );
  return { points: new Float32Array([tip.x, tip.y, left.x, left.y, right.x, right.y]), closed: true };
}

export const straightGeometry: TConnectionGeometryFn = ({ source, target }) => ({
  segments: new Float32Array(lineSegment(source, target)),
  arrow: {
    points: new Float32Array(getArrowCoords(false, source.x, source.y, target.x, target.y)),
    closed: false,
  },
});

export const bezierGeometry: TConnectionGeometryFn = ({ source, target, bezierDirection }) => ({
  segments: new Float32Array(bezierPiece(source, target, bezierDirection)),
  arrow: {
    points: new Float32Array(getArrowCoords(true, source.x, source.y, target.x, target.y, bezierDirection)),
    closed: false,
  },
});

export const blockGeometry: TConnectionGeometryFn = (input: TConnectionGeometryInput) =>
  input.useBezier ? bezierGeometry(input) : straightGeometry(input);

export const multipointGeometry: TConnectionGeometryFn = (input) => {
  const { points } = input;
  if (points.length === 0) {
    return blockGeometry(input);
  }
  if (points.length === 1) {
    return undefined;
  }
  return { segments: new Float32Array(roundedPolyline(points, POLYLINE_RADIUS)), arrow: triangleArrow(points) };
};

export const bezierMultipointGeometry: TConnectionGeometryFn = (input) => {
  const { points, bezierDirection } = input;
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
  return { segments: new Float32Array(numbers), arrow: triangleArrow(points) };
};
