import { distanceToArrow, distanceToSegments } from "./distance";
import { bezierSegment, lineSegment } from "./segments";

const line = new Float32Array(lineSegment({ x: 0, y: 0 }, { x: 100, y: 0 }));
const bezier = new Float32Array(bezierSegment({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 20, y: 100 }, { x: 100, y: 100 }));

function bruteForce(segments: Float32Array, x: number, y: number): number {
  let best = Infinity;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = segments;
  for (let i = 0; i <= 10000; i++) {
    const t = i / 10000;
    const u = 1 - t;
    const px = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const py = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}

describe("distanceToSegments", () => {
  it("measures the distance to a horizontal line", () => {
    expect(distanceToSegments(line, 50, 7, 0.5, 100)).toBeCloseTo(7);
    expect(distanceToSegments(line, 50, 0, 0.5, 100)).toBeCloseTo(0);
  });

  it("measures the distance to the endpoint beyond the line", () => {
    expect(distanceToSegments(line, 103, 4, 0.5, 100)).toBeCloseTo(5);
    expect(distanceToSegments(line, -3, -4, 0.5, 100)).toBeCloseTo(5);
  });

  it("matches dense sampling of a bezier within the flatness", () => {
    const flatness = 0.5;
    for (const [x, y] of [
      [50, 40],
      [10, 30],
      [90, 60],
      [60, 50],
      [-5, 5],
    ]) {
      expect(Math.abs(distanceToSegments(bezier, x, y, flatness, 1000) - bruteForce(bezier, x, y))).toBeLessThanOrEqual(
        flatness
      );
    }
  });

  it("returns Infinity for cubics farther than the limit from the hull box", () => {
    expect(distanceToSegments(line, 50, 50, 0.5, 10)).toBe(Infinity);
    expect(distanceToSegments(bezier, 500, 500, 0.5, 10)).toBe(Infinity);
  });
});

describe("distanceToArrow", () => {
  const triangle = { points: new Float32Array([0, 0, 10, 0, 0, 10]), closed: true };

  it("is 0 inside a closed arrow and the outline distance outside", () => {
    expect(distanceToArrow(triangle, 2, 2)).toBe(0);
    expect(distanceToArrow(triangle, 5, -3)).toBeCloseTo(3);
    expect(distanceToArrow(triangle, 0, 13)).toBeCloseTo(3);
  });

  it("measures an open arrow by its sides only", () => {
    const open = { points: triangle.points, closed: false };
    expect(distanceToArrow(open, 2, 2)).toBeCloseTo(2);
    // The closing side would give 0 at (0, 5); the open outline is 5 / sqrt(2) away.
    expect(distanceToArrow(open, 0, 5)).toBeCloseTo(5 * Math.SQRT1_2);
  });
});
