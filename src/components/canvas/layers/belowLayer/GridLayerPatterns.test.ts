import { GridLayerPatterns } from "./GridLayerPatterns";
import type { TGridLayerPatternRequest } from "./GridLayerPatterns";

function createContext(): CanvasRenderingContext2D {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }
  return ctx;
}

const REQUEST: TGridLayerPatternRequest = { stepWorld: 80, tilePx: 40, dotSizePx: 2.4, color: "#000000" };

describe("GridLayerPatterns", () => {
  it("creates a pattern once while the key is unchanged", () => {
    const ctx = createContext();
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const patterns = new GridLayerPatterns();

    const first = patterns.get(ctx, REQUEST);
    const second = patterns.get(ctx, { ...REQUEST });

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(createPatternSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["tile size", { tilePx: 41 }],
    ["dot size", { dotSizePx: 4.8 }],
    ["color", { color: "#ffffff" }],
  ])("recreates the pattern when the %s changes", (_name, change) => {
    const ctx = createContext();
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const patterns = new GridLayerPatterns();

    const first = patterns.get(ctx, REQUEST);
    const second = patterns.get(ctx, { ...REQUEST, ...change });

    expect(second).not.toBe(first);
    expect(createPatternSpy).toHaveBeenCalledTimes(2);
  });

  it("maps one tile onto one world step centered on grid nodes", () => {
    const ctx = createContext();
    const patterns = new GridLayerPatterns();

    const pattern = patterns.get(ctx, REQUEST);

    expect(pattern?.setTransform).toHaveBeenCalledWith({ a: 2, b: 0, c: 0, d: 2, e: -40, f: -40 });
  });

  it("draws a centered dot into the tile", () => {
    const ctx = createContext();
    const scratch = createContext();
    const arcSpy = jest.spyOn(scratch, "arc");
    const patterns = new GridLayerPatterns(() => scratch);

    patterns.get(ctx, REQUEST);

    expect(scratch.canvas.width).toBe(40);
    expect(scratch.canvas.height).toBe(40);
    expect(arcSpy).toHaveBeenCalledWith(20, 20, 1.2, 0, Math.PI * 2);
    expect(scratch.fillStyle).toBe("#000000");
  });

  it("drops layers that are no longer retained", () => {
    const ctx = createContext();
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const patterns = new GridLayerPatterns();
    const coarse = { ...REQUEST, stepWorld: 400, tilePx: 200 };

    patterns.get(ctx, REQUEST);
    patterns.get(ctx, coarse);
    patterns.retain([REQUEST.stepWorld]);
    patterns.get(ctx, REQUEST);
    patterns.get(ctx, coarse);

    expect(createPatternSpy).toHaveBeenCalledTimes(3);
  });

  it("drops every pattern on clear", () => {
    const ctx = createContext();
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const patterns = new GridLayerPatterns();

    patterns.get(ctx, REQUEST);
    patterns.clear();
    patterns.get(ctx, REQUEST);

    expect(createPatternSpy).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when the pattern cannot be created", () => {
    const ctx = createContext();
    jest.spyOn(ctx, "createPattern").mockReturnValue(null);
    const patterns = new GridLayerPatterns();

    expect(() => patterns.get(ctx, REQUEST)).not.toThrow();
    expect(patterns.get(ctx, REQUEST)).toBeUndefined();
  });

  it("returns undefined when no scratch context is available", () => {
    const ctx = createContext();
    const patterns = new GridLayerPatterns(() => null);

    expect(patterns.get(ctx, REQUEST)).toBeUndefined();
  });
});
