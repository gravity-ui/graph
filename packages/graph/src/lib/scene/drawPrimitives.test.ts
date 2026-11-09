import { drawElements, isPrimitiveVisible, textWorldSize } from "./drawPrimitives";
import type { TSceneElement } from "./types";

beforeAll(() => {
  // jest-canvas-mock 2.5 has no roundRect.
  if (!("roundRect" in CanvasRenderingContext2D.prototype)) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, "roundRect", {
      value: function roundRect(): void {},
      configurable: true,
      writable: true,
    });
  }
});

function createContext(): CanvasRenderingContext2D {
  return document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
}

function element(patch: Partial<TSceneElement>): TSceneElement {
  return {
    id: "element",
    zIndex: 0,
    sequence: 1,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [],
    hidden: false,
    ...patch,
  };
}

const SEGMENTS = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0]);

function line(id: string): TSceneElement {
  return element({ id, primitives: [{ kind: "path", segments: SEGMENTS, stroke: { color: "#123", width: 2 } }] });
}

describe("scene primitives", () => {
  it("shows a primitive only inside its scale range", () => {
    const circle = { kind: "circle" as const, cx: 0, cy: 0, r: 1, minScale: 0.2, maxScale: 0.7 };
    expect(isPrimitiveVisible(circle, 0.2)).toBe(true);
    expect(isPrimitiveVisible(circle, 0.69)).toBe(true);
    expect(isPrimitiveVisible(circle, 0.7)).toBe(false);
    expect(isPrimitiveVisible(circle, 0.1)).toBe(false);
  });

  it("holds a screen size within world limits", () => {
    expect(textWorldSize(12, 0.5)).toBe(12);
    expect(textWorldSize({ px: 9, minWorld: 14 }, 0.25)).toBe(36);
    expect(textWorldSize({ px: 9, minWorld: 14 }, 1)).toBe(14);
    expect(textWorldSize({ px: 14, maxWorld: 28 }, 0.25)).toBe(28);
  });

  it("insets an inside border and outsets an outside one by half its width", () => {
    const ctx = createContext();
    const roundRect = jest.spyOn(ctx, "roundRect");
    const rect = { kind: "rect" as const, x: 0, y: 0, width: 40, height: 20, radius: 8 };
    drawElements(
      ctx,
      [
        element({ x: 100, y: 50, primitives: [{ ...rect, border: { color: "#000", width: 4, align: "inside" } }] }),
        element({ x: 100, y: 50, primitives: [{ ...rect, border: { color: "#000", width: 4, align: "outside" } }] }),
      ],
      1
    );
    expect(roundRect).toHaveBeenNthCalledWith(1, 102, 52, 36, 16, 6);
    expect(roundRect).toHaveBeenNthCalledWith(2, 98, 48, 44, 24, 10);
  });

  it("strokes consecutive paths of one stroke style with one call", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    expect(drawElements(ctx, [line("a"), line("b"), line("c")], 1)).toBe(3);
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it("ends a run after maxRun paths and polygons", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    expect(drawElements(ctx, [line("a"), line("b"), line("c")], 1, { maxRun: 2 })).toBe(3);
    expect(stroke).toHaveBeenCalledTimes(2);
  });

  it("treats maxRun Infinity as unbounded", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    drawElements(ctx, [line("a"), line("b"), line("c")], 1, { maxRun: Infinity });
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, NaN])("rejects maxRun %p, which is not a positive integer", (maxRun) => {
    const ctx = createContext();
    expect(() => drawElements(ctx, [line("a")], 1, { maxRun })).toThrow(RangeError);
  });

  it("flushes a path run before a later shape so the draw order holds", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const fill = jest.spyOn(ctx, "fill");
    const block = element({
      id: "block",
      primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#fff" }],
    });
    drawElements(ctx, [line("a"), block, line("b")], 1);
    expect(stroke).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(stroke.mock.invocationCallOrder[0]).toBeLessThan(fill.mock.invocationCallOrder[0]);
    expect(fill.mock.invocationCallOrder[0]).toBeLessThan(stroke.mock.invocationCallOrder[1]);
  });

  it("fills a polygon run once and strokes it with the paths of the same style", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const fill = jest.spyOn(ctx, "fill");
    const arrow = new Float32Array([0, 0, 4, 2, 0, 4]);
    const connection = (id: string): TSceneElement =>
      element({
        id,
        primitives: [
          { kind: "path", segments: SEGMENTS, stroke: { color: "#123", width: 2 } },
          { kind: "polygon", points: arrow, fill: "#123", stroke: { color: "#123", width: 2 } },
        ],
      });
    drawElements(ctx, [connection("a"), connection("b")], 1);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it("skips hidden elements and primitives outside their scale range", () => {
    const ctx = createContext();
    const visible = { kind: "circle" as const, cx: 0, cy: 0, r: 1, fill: "#000" };
    const drawn = drawElements(
      ctx,
      [
        element({ hidden: true, primitives: [visible] }),
        element({ primitives: [visible, { ...visible, minScale: 0.5 }] }),
      ],
      0.3
    );
    expect(drawn).toBe(1);
  });
});
