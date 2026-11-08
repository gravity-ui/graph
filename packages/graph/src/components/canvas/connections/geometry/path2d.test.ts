import { createArrowPath, createSegmentsPath } from "./path2d";
import { bezierSegment, lineSegment } from "./segments";

type TMockPath = Path2D & Record<"moveTo" | "lineTo" | "bezierCurveTo" | "closePath", jest.Mock>;

describe("createSegmentsPath", () => {
  it("draws a straight connection with moveTo and lineTo, as before", () => {
    const path = createSegmentsPath(new Float32Array(lineSegment({ x: 1, y: 2 }, { x: 7, y: 8 }))) as TMockPath;
    expect(path.moveTo.mock.calls).toEqual([[1, 2]]);
    expect(path.lineTo.mock.calls).toEqual([[7, 8]]);
    expect(path.bezierCurveTo).not.toHaveBeenCalled();
  });

  it("draws a bezier with moveTo and bezierCurveTo, and continues connected cubics without moveTo", () => {
    const segments = new Float32Array([
      ...bezierSegment({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }),
      ...lineSegment({ x: 100, y: 0 }, { x: 100, y: 30 }),
      ...lineSegment({ x: 200, y: 0 }, { x: 300, y: 0 }),
    ]);
    const path = createSegmentsPath(segments) as TMockPath;
    expect(path.moveTo.mock.calls).toEqual([
      [0, 0],
      [200, 0],
    ]);
    expect(path.bezierCurveTo.mock.calls).toEqual([[50, 0, 50, 0, 100, 0]]);
    expect(path.lineTo.mock.calls).toEqual([
      [100, 30],
      [300, 0],
    ]);
  });
});

describe("createArrowPath", () => {
  it("draws the chevron open and the triangle closed", () => {
    const points = new Float32Array([0, 0, 5, 5, 0, 10]);
    const chevron = createArrowPath({ points, closed: false }) as TMockPath;
    expect(chevron.moveTo.mock.calls).toEqual([[0, 0]]);
    expect(chevron.lineTo.mock.calls).toEqual([
      [5, 5],
      [0, 10],
    ]);
    expect(chevron.closePath).not.toHaveBeenCalled();
    const triangle = createArrowPath({ points, closed: true }) as TMockPath;
    expect(triangle.closePath).toHaveBeenCalledTimes(1);
  });
});
