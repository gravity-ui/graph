import { isPointInStroke } from "./bezierHelpers";

describe("isPointInStroke", () => {
  it("returns false when path is undefined", () => {
    const ctx = document.createElement("canvas").getContext("2d");

    expect(isPointInStroke(ctx, undefined, 0, 0)).toBe(false);
  });

  it("returns false when path is not a Path2D instance", () => {
    const ctx = document.createElement("canvas").getContext("2d");

    expect(isPointInStroke(ctx, {} as Path2D, 0, 0)).toBe(false);
  });

  it("returns false when context is missing", () => {
    const path = new Path2D();

    expect(isPointInStroke(null, path, 0, 0)).toBe(false);
  });

  it("does not throw when path is invalid", () => {
    const ctx = document.createElement("canvas").getContext("2d");

    expect(() => isPointInStroke(ctx, undefined, 0, 0)).not.toThrow();
    expect(() => isPointInStroke(ctx, {} as Path2D, 0, 0)).not.toThrow();
    expect(() => isPointInStroke(null, new Path2D(), 0, 0)).not.toThrow();
  });
});
