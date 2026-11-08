import type { TConnection } from "../../../../store/connection/ConnectionState";
import { getTriangleArrowPoints } from "../../../../utils/shapes/triangle";
import { generateBezierParams, getArrowCoords } from "../bezierHelpers";

import {
  bezierGeometry,
  bezierMultipointGeometry,
  blockGeometry,
  multipointGeometry,
  straightGeometry,
} from "./geometries";
import { bezierSegment, isLineSegment, lineSegment } from "./segments";
import type { TConnectionGeometryInput } from "./types";

const source = { x: 100, y: 100 };
const target = { x: 400, y: 160 };

function input(patch: Partial<TConnectionGeometryInput> = {}): TConnectionGeometryInput {
  const connection: TConnection = { id: "c", sourceBlockId: "a", targetBlockId: "b" };
  return { source, target, points: [], useBezier: true, bezierDirection: "horizontal", connection, ...patch };
}

const f32 = (values: number[]): number[] => Array.from(new Float32Array(values));

describe("library geometries", () => {
  it("straightGeometry: one line and the chevron in the middle, whatever useBezier says", () => {
    const geometry = straightGeometry(input({ useBezier: true }));
    expect(Array.from(geometry?.segments ?? [])).toEqual(f32(lineSegment(source, target)));
    expect(Array.from(geometry?.arrow?.points ?? [])).toEqual(
      f32(getArrowCoords(false, source.x, source.y, target.x, target.y))
    );
    expect(geometry?.arrow?.closed).toBe(false);
  });

  it("bezierGeometry: the curve along the direction with its chevron, whatever useBezier says", () => {
    for (const bezierDirection of ["horizontal", "vertical"] as const) {
      const geometry = bezierGeometry(input({ useBezier: false, bezierDirection }));
      const [p0, c1, c2, p3] = generateBezierParams(source, target, bezierDirection);
      expect(Array.from(geometry?.segments ?? [])).toEqual(f32(bezierSegment(p0, c1, c2, p3)));
      expect(Array.from(geometry?.arrow?.points ?? [])).toEqual(
        f32(getArrowCoords(true, source.x, source.y, target.x, target.y, bezierDirection))
      );
    }
  });

  it("blockGeometry follows useBezier", () => {
    expect(blockGeometry(input({ useBezier: false }))).toEqual(straightGeometry(input()));
    expect(blockGeometry(input({ useBezier: true }))).toEqual(bezierGeometry(input()));
  });

  it("multipointGeometry: a rounded polyline with a closed triangle at the end; blockGeometry without points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const geometry = multipointGeometry(input({ points }));
    expect(geometry?.segments.length).toBe(24);
    expect(geometry?.arrow?.closed).toBe(true);
    const [tip, left, right] = getTriangleArrowPoints(points[1], points[2], 16, 10);
    expect(Array.from(geometry?.arrow?.points ?? [])).toEqual(f32([tip.x, tip.y, left.x, left.y, right.x, right.y]));
    expect(multipointGeometry(input())).toEqual(blockGeometry(input()));
    expect(multipointGeometry(input({ points: [{ x: 1, y: 1 }] }))).toBeUndefined();
  });

  it("bezierMultipointGeometry: bezier pieces, straight pieces along the direction stay lines", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 80 },
    ];
    const geometry = bezierMultipointGeometry(input({ points, bezierDirection: "horizontal" }));
    const segments = geometry?.segments ?? new Float32Array();
    expect(segments.length).toBe(16);
    expect(isLineSegment(segments, 0)).toBe(true);
    const [p0, c1, c2, p3] = generateBezierParams(points[1], points[2], "horizontal");
    expect(Array.from(segments.slice(8))).toEqual(f32(bezierSegment(p0, c1, c2, p3)));
    expect(geometry?.arrow?.closed).toBe(true);
    // Two points: one bezier, like today's bezierCurveLine.
    const two = bezierMultipointGeometry(input({ points: [points[0], points[1]] }));
    expect(two?.segments.length).toBe(8);
    expect(isLineSegment(two?.segments ?? new Float32Array(), 0)).toBe(false);
    expect(bezierMultipointGeometry(input())).toEqual(blockGeometry(input()));
  });
});
