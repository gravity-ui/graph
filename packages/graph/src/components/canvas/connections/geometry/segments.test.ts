import {
  bezierSegment,
  isLineSegment,
  lineSegment,
  roundedPolyline,
  writeBezierSegment,
  writeLineSegment,
} from "./segments";

describe("segment builders", () => {
  it("builds a straight line as a cubic with control points at the thirds", () => {
    expect(lineSegment({ x: 0, y: 0 }, { x: 30, y: 60 })).toEqual([0, 0, 10, 20, 20, 40, 30, 60]);
  });

  it("builds a cubic from its four points", () => {
    expect(bezierSegment({ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 })).toEqual([
      0, 0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("writes the same cubics into a Float32Array at an offset", () => {
    const from = { x: 31234.567, y: -1789.123 };
    const to = { x: 39876.5, y: 2345.25 };
    const out = new Float32Array(17);
    writeLineSegment(out, 1, from, to);
    writeBezierSegment(out, 9, { x: 0.1, y: 0.2 }, { x: 1.3, y: 2.4 }, { x: 3.5, y: 4.6 }, { x: 5.7, y: 6.8 });
    expect(Array.from(out.subarray(1, 9))).toEqual(Array.from(new Float32Array(lineSegment(from, to))));
    const bezier = bezierSegment({ x: 0.1, y: 0.2 }, { x: 1.3, y: 2.4 }, { x: 3.5, y: 4.6 }, { x: 5.7, y: 6.8 });
    expect(Array.from(out.subarray(9))).toEqual(Array.from(new Float32Array(bezier)));
    expect(out[0]).toBe(0);
  });

  it("tells lines from curves, also after float32 rounding of large coordinates", () => {
    const line = new Float32Array(lineSegment({ x: 31234.567, y: -1789.123 }, { x: 39876.5, y: 2345.25 }));
    expect(isLineSegment(line, 0)).toBe(true);
    // Collinear controls not at the thirds (a horizontal bezier) are a curve: Path2D draws them with bezierCurveTo.
    expect(isLineSegment(new Float32Array([0, 0, 50, 0, 50, 0, 100, 0]), 0)).toBe(false);
    expect(isLineSegment(new Float32Array([0, 0, 10, 5, 20, 5, 30, 0]), 0)).toBe(false);
  });

  it("rounds a right-angle corner with a cubic arc tangent to both pieces", () => {
    const segments = roundedPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10
    );
    // A line to the arc start, the arc, a line to the end: 3 cubics.
    expect(segments).toHaveLength(24);
    // Radius min(10, 10 · θ/π) = 5 for θ = π/2, so the arc touches the pieces 5 units from the corner.
    expect(segments.slice(0, 8)).toEqual(lineSegment({ x: 0, y: 0 }, { x: 95, y: 0 }));
    const arc = segments.slice(8, 16);
    expect(arc[0]).toBeCloseTo(95);
    expect(arc[1]).toBeCloseTo(0);
    expect(arc[6]).toBeCloseTo(100);
    expect(arc[7]).toBeCloseTo(5);
    // Handles along the tangents, 4/3 · tan(θ/4) · r long.
    const handle = (4 / 3) * Math.tan(Math.PI / 8) * 5;
    expect(arc[2]).toBeCloseTo(95 + handle);
    expect(arc[3]).toBeCloseTo(0);
    expect(arc[4]).toBeCloseTo(100);
    expect(arc[5]).toBeCloseTo(5 - handle);
    expect(segments.slice(16, 24)).toEqual(lineSegment({ x: 100, y: 5 }, { x: 100, y: 100 }));
  });

  it("keeps collinear points as straight lines without zero-length arcs", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const segments = roundedPolyline(points, 10);
    for (let o = 0; o < segments.length; o += 8) expect(isLineSegment(segments, o)).toBe(true);
    expect(segments[0]).toBe(0);
    expect(segments[segments.length - 2]).toBe(100);
  });
});
