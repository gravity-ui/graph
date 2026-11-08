import { generateBezierParams, getBezierCurveBounds } from "../bezierHelpers";

import { getSegmentsBounds } from "./bounds";
import { bezierSegment, lineSegment } from "./segments";

describe("getSegmentsBounds", () => {
  it("returns the endpoints of a straight segment", () => {
    const segments = new Float32Array(lineSegment({ x: 10, y: 40 }, { x: 70, y: 20 }));
    expect(getSegmentsBounds(segments, true)).toEqual([10, 20, 70, 40]);
    expect(getSegmentsBounds(segments, false)).toEqual([10, 20, 70, 40]);
  });

  it("matches today's tight bezier bounds and control-point hull", () => {
    const [p0, c1, c2, p3] = generateBezierParams({ x: 0, y: 0 }, { x: 300, y: 60 }, "horizontal");
    const segments = new Float32Array(bezierSegment(p0, c1, c2, p3));

    const rect = getBezierCurveBounds({ x: 0, y: 0 }, { x: 300, y: 60 }, "horizontal");
    const tight = getSegmentsBounds(segments, true);
    const expected = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    expect(tight).toBeDefined();
    tight?.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));

    const xs = [p0, c1, c2, p3].map((p) => p.x);
    const ys = [p0, c1, c2, p3].map((p) => p.y);
    expect(getSegmentsBounds(segments, false)).toEqual([
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ]);
  });

  it("unions several segments", () => {
    const segments = new Float32Array([
      ...lineSegment({ x: 0, y: 0 }, { x: 10, y: 5 }),
      ...lineSegment({ x: 10, y: 5 }, { x: -20, y: 50 }),
    ]);
    expect(getSegmentsBounds(segments, true)).toEqual([-20, 0, 10, 50]);
  });

  it("returns undefined for no segments", () => {
    expect(getSegmentsBounds(new Float32Array(0), true)).toBeUndefined();
    expect(getSegmentsBounds(new Float32Array(0), false)).toBeUndefined();
  });
});
