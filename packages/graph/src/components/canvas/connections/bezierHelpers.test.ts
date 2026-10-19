import { getBezierCurveBounds, isPointInStroke } from "./bezierHelpers";

describe("getBezierCurveBounds", () => {
  it("does not include unused control-point area for a reversed horizontal curve", () => {
    const bounds = getBezierCurveBounds({ x: 700, y: 100 }, { x: 0, y: 350 }, "horizontal");

    expect(bounds.x).toBeCloseTo(-56.6633, 3);
    expect(bounds.y).toBeCloseTo(100, 3);
    expect(bounds.width).toBeCloseTo(813.3265, 3);
    expect(bounds.height).toBeCloseTo(250, 3);
  });

  it("calculates tight bounds for a vertical curve", () => {
    const bounds = getBezierCurveBounds({ x: 300, y: 550 }, { x: 600, y: 150 }, "vertical");

    expect(bounds.x).toBeCloseTo(300, 3);
    expect(bounds.y).toBeCloseTo(128.7901, 3);
    expect(bounds.width).toBeCloseTo(300, 3);
    expect(bounds.height).toBeCloseTo(442.4198, 3);
  });
});

describe("isPointInStroke", () => {
  it("uses threshold as line width and restores the previous line width", () => {
    const ctx = document.createElement("canvas").getContext("2d");
    const path = new Path2D();
    const previousLineWidth = 3;
    const threshold = 16;
    let lineWidthDuringHitTest: number | undefined;

    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    ctx.lineWidth = previousLineWidth;
    jest.spyOn(ctx, "isPointInStroke").mockImplementation(() => {
      lineWidthDuringHitTest = ctx.lineWidth;
      return true;
    });

    expect(isPointInStroke(ctx, path, 10, 20, threshold)).toBe(true);
    expect(lineWidthDuringHitTest).toBe(threshold);
    expect(ctx.lineWidth).toBe(previousLineWidth);
  });
});
