import { blockOutlineSegments } from "./blockOutline";

/** Sample the cubic itself so that uncovered joins and a spurious line through an anchor both fail. */
function points(path: Float32Array): number[][] {
  const result: number[][] = [];
  for (let k = 0; k < path.length; k += 8) {
    const next = (k + 8) % path.length;
    expect([path[k + 6], path[k + 7]]).toEqual([path[next], path[next + 1]]);
    for (const t of [0.125, 0.5, 0.875]) {
      const s = 1 - t;
      result.push(
        [0, 1].map(
          (i) =>
            s ** 3 * path[k + i] + 3 * s * t * (s * path[k + 2 + i] + t * path[k + 4 + i]) + t ** 3 * path[k + 6 + i]
        )
      );
    }
  }
  return result;
}

describe("blockOutlineSegments", () => {
  it("returns a closed rectangle, ignoring empty or invalid anchors", () => {
    const outline = blockOutlineSegments(100, 60, []);
    expect(outline).toHaveLength(1);
    expect(outline[0]).toHaveLength(32);
    expect(points(outline[0]).every(([x, y]) => x === 0 || x === 100 || y === 0 || y === 60)).toBe(true);
    expect(
      blockOutlineSegments(100, 60, [
        { x: 20, y: 0, r: 0 },
        { x: NaN, y: 0, r: 5 },
      ])
    ).toEqual(outline);
  });

  it("clips covered intervals of the rectangle and overlapping anchors, including at a corner", () => {
    const anchors = [
      { x: 100, y: 22, r: 20 },
      { x: 100, y: 40, r: 16 },
      { x: 0, y: 0, r: 13 },
    ];
    const outline = blockOutlineSegments(100, 60, anchors);
    expect(outline).toHaveLength(1);
    const samples = points(outline[0]);
    for (const [x, y] of samples) {
      const rectDistance = Math.max(-x, x - 100, -y, y - 60);
      const unionDistance = Math.min(rectDistance, ...anchors.map((a) => Math.hypot(x - a.x, y - a.y) - a.r));
      expect(Math.abs(unionDistance)).toBeLessThan(0.01);
    }
    expect(samples.some(([x]) => x > 115)).toBe(true);
    expect(samples.some(([x, y]) => x < 0 && y < 0)).toBe(true);
    expect(blockOutlineSegments(100, 60, [...anchors, anchors[0], { x: 100, y: 22, r: 4 }])).toEqual(outline);
  });

  it("traces a rounded corner cut by an anchor and keeps the rest of the edge round", () => {
    const anchor = { x: 2, y: 5, r: 7 };
    const result = blockOutlineSegments(100, 52, [anchor], 12);
    expect(result).toHaveLength(1);
    for (const [x, y] of points(result[0])) {
      const qx = Math.abs(x - 50) - 38;
      const qy = Math.abs(y - 26) - 14;
      const face = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 12;
      expect(Math.abs(Math.min(face, Math.hypot(x - anchor.x, y - anchor.y) - anchor.r))).toBeLessThan(0.01);
    }
  });

  it("emits one rim when a port coincides with a rounded corner or the rounded face is circular", () => {
    const radius = [12, 6, 0, 10];
    const rect = blockOutlineSegments(80, 48, [], radius);
    expect(rect).toHaveLength(1);
    expect(blockOutlineSegments(80, 48, [{ x: 12, y: 12, r: 12 }], radius)).toEqual(rect);
    const disk = blockOutlineSegments(24, 24, [], 30);
    expect(disk).toHaveLength(1);
    expect(points(disk[0]).every(([x, y]) => Math.abs(Math.hypot(x - 12, y - 12) - 12) < 0.004)).toBe(true);
  });

  it("preserves detached components and circles that contain the entire rectangle", () => {
    const circles = [
      { x: 5, y: 5, r: 10 },
      { x: 25, y: 5, r: 3 },
    ];
    const contours = blockOutlineSegments(10, 10, circles);
    expect(contours).toHaveLength(2);
    const samples = contours.map(points);
    expect(samples.some((loop) => loop.every(([x, y]) => Math.abs(Math.hypot(x - 5, y - 5) - 10) < 0.003))).toBe(true);
    expect(samples.some((loop) => loop.every(([x]) => x >= 22 && x <= 28))).toBe(true);
  });

  it("keeps a circle touching the outside and drops tangencies from the inside", () => {
    expect(blockOutlineSegments(30, 30, [{ x: 5, y: 11, r: 5 }])).toEqual(blockOutlineSegments(30, 30, []));
    const contours = blockOutlineSegments(30, 30, [{ x: 35, y: 15, r: 5 }]);
    expect(contours).toHaveLength(2);
    const samples = contours.flatMap(points);
    expect(samples.some(([x]) => x > 39)).toBe(true);
    expect(samples.some(([x]) => x === 0)).toBe(true);
  });

  it("omits the internal hole in a ring of intersecting circles", () => {
    const circles = [
      { x: 0, y: 0, r: 6 },
      { x: 10, y: 0, r: 6 },
      { x: 10, y: 10, r: 6 },
      { x: 0, y: 10, r: 6 },
    ];
    const contours = blockOutlineSegments(0, 0, circles);
    expect(contours).toHaveLength(1);
    expect(points(contours[0]).every(([x, y]) => Math.hypot(x - 5, y - 5) > 8)).toBe(true);
    expect(blockOutlineSegments(Infinity, -1, [])).toEqual([]);
  });
});
