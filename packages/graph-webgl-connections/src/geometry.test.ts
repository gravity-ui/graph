import { connectionCubic, cubicPoint, distanceToCubic, straightCubic, stubParameter } from "./geometry";

describe("connectionCubic", () => {
  it("uses the canvas bezier control points", () => {
    expect(connectionCubic({ x: 0, y: 0 }, { x: 200, y: 100 }, "bezier")).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
  });

  it("keeps a minimal control offset for close ports and supports the vertical direction", () => {
    expect(connectionCubic({ x: 0, y: 0 }, { x: 10, y: 100 }, "bezier", "vertical")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 25 },
      { x: 10, y: 75 },
      { x: 10, y: 100 },
    ]);
  });

  it("parametrizes straight segments uniformly", () => {
    const cubic = connectionCubic({ x: 0, y: 0 }, { x: 90, y: 30 }, "straight");
    expect(cubic).toEqual(straightCubic({ x: 0, y: 0 }, { x: 90, y: 30 }));
    expect(cubicPoint(cubic, 0.5)).toEqual({ x: 45, y: 15 });
  });
});

describe("stubParameter", () => {
  const cubic = straightCubic({ x: 0, y: 0 }, { x: 1000, y: 0 });

  it("covers the stub length in screen pixels", () => {
    // 1000 world units at scale 0.1 are 100 px, a 14 px stub is 14% of the curve
    expect(stubParameter(cubic, 0.1, 14)).toBeCloseTo(0.14);
  });

  it("draws short connections whole", () => {
    expect(stubParameter(cubic, 0.01, 14)).toBe(0.5);
    expect(stubParameter(cubic, 0.1, 0)).toBe(0.5);
  });
});

describe("distanceToCubic", () => {
  const cubic = straightCubic({ x: 0, y: 0 }, { x: 100, y: 0 });

  it("measures the distance to the whole curve", () => {
    expect(distanceToCubic({ x: 50, y: 7 }, cubic)).toBeCloseTo(7);
  });

  it("ignores the hidden middle part of stubs", () => {
    expect(distanceToCubic({ x: 50, y: 0 }, cubic, 0.1)).toBeCloseTo(40);
    expect(distanceToCubic({ x: 5, y: 0 }, cubic, 0.1)).toBeCloseTo(0);
    expect(distanceToCubic({ x: 95, y: 0 }, cubic, 0.1)).toBeCloseTo(0);
  });
});
