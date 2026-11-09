import { ScenePathBatch } from "./ScenePathBatch";
import type { TScenePathBatchInput } from "./ScenePathBatch";

let addPath: jest.SpyInstance;

beforeAll(() => {
  // Stub addPath when jest-canvas-mock lacks it, as drawPrimitives.test.ts does for roundRect.
  if (!("addPath" in Path2D.prototype)) {
    Object.defineProperty(Path2D.prototype, "addPath", {
      value: function addPath(): void {},
      configurable: true,
      writable: true,
    });
  }
});

beforeEach(() => {
  addPath = jest.spyOn(Path2D.prototype, "addPath");
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createContext(): CanvasRenderingContext2D {
  return document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
}

const SEGMENTS = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0]);
const POINTS = new Float32Array([0, 0, 4, 0, 4, 4]);
const STROKE = { color: "#123", width: 2 };
const VIEWPORT = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };

function line(id: string, x = 0, y = 0): TScenePathBatchInput {
  return {
    id,
    x,
    y,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [{ kind: "path", segments: SEGMENTS, stroke: STROKE }],
  };
}

describe("ScenePathBatch", () => {
  it("strokes three paths of one style in one call", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    for (const id of ["a", "b", "c"]) batch.add(line(id, 10, 10));

    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 3, chunks: 1 });
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it("builds a chunk once and reuses it", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    for (const id of ["a", "b", "c"]) batch.add(line(id, 10, 10));

    batch.render(ctx, VIEWPORT);
    expect(addPath).toHaveBeenCalledTimes(3);
    addPath.mockClear();
    batch.render(ctx, VIEWPORT);
    expect(addPath).toHaveBeenCalledTimes(0);
  });

  it("neither builds nor draws a chunk outside the viewport", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    batch.add(line("near", 0, 0));
    batch.add(line("far", 20000, 0));

    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 1, chunks: 1 });
    expect(addPath).toHaveBeenCalledTimes(1);
  });

  it("rebuilds only the chunk of the updated element", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    batch.add(line("a1", 0, 0));
    batch.add(line("a2", 100, 0));
    batch.add(line("b", 9000, 0));
    const wide = { minX: 0, minY: 0, maxX: 20000, maxY: 1000 };
    batch.render(ctx, wide);
    addPath.mockClear();

    batch.update("a1", { x: 50 });
    batch.render(ctx, wide);
    expect(addPath).toHaveBeenCalledTimes(2);
  });

  it("draws lines, then polygon fills, then polygon strokes", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    const calls: string[] = [];
    const fills: unknown[] = [];
    jest.spyOn(ctx, "stroke").mockImplementation(() => {
      calls.push("stroke");
    });
    jest.spyOn(ctx, "fill").mockImplementation(() => {
      calls.push("fill");
      fills.push(ctx.fillStyle);
    });
    batch.add({
      id: "c",
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [
        { kind: "path", segments: SEGMENTS, stroke: STROKE },
        { kind: "polygon", points: POINTS, fill: "#ff0000", stroke: { color: "#00f", width: 1 } },
      ],
    });

    batch.render(ctx, VIEWPORT);
    expect(calls).toEqual(["stroke", "fill", "stroke"]);
    expect(fills).toEqual(["#ff0000"]);
  });

  it("rejects unsupported input", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(() =>
      batch.add({ id: "r", x: 0, y: 0, bounds, primitives: [{ kind: "rect", x: 0, y: 0, width: 1, height: 1 }] })
    ).toThrow();
    expect(() =>
      batch.add({
        id: "s",
        x: 0,
        y: 0,
        bounds,
        primitives: [{ kind: "path", segments: SEGMENTS, stroke: STROKE, minScale: 0.5 }],
      })
    ).toThrow();
    batch.add(line("a"));
    expect(() => batch.add(line("a"))).toThrow();
    expect(() => batch.update("missing", { x: 1 })).toThrow();
    expect(() => batch.delete("missing")).not.toThrow();
    expect(batch.size).toBe(1);
    batch.delete("a");
    expect(batch.size).toBe(0);
  });

  it("splits a cell into chunks of chunkSize items", () => {
    const batch = new ScenePathBatch({ zIndex: 1, chunkSize: 2 });
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    for (const id of ["a", "b", "c", "d", "e"]) batch.add(line(id, 10, 10));

    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 5, chunks: 3 });
    expect(stroke).toHaveBeenCalledTimes(3);
  });

  it("keeps the element when update is rejected", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    batch.add(line("a", 10, 10));
    const rect = { kind: "rect", x: 0, y: 0, width: 1, height: 1 } as const;

    expect(() => batch.update("a", { primitives: [rect] })).toThrow();
    expect(batch.size).toBe(1);
    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 1, chunks: 1 });
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it("does not fill a polygon with an empty fill", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    const fill = jest.spyOn(ctx, "fill");
    batch.add({
      id: "p",
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [{ kind: "polygon", points: POINTS, fill: "", stroke: STROKE }],
    });

    batch.render(ctx, VIEWPORT);
    expect(fill).not.toHaveBeenCalled();
  });

  it("counts correctly after delete", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    for (const id of ["a", "b", "c"]) batch.add(line(id, 10, 10));
    batch.render(ctx, VIEWPORT);

    batch.delete("b");
    expect(batch.size).toBe(2);
    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 2, chunks: 1 });
    batch.delete("a");
    batch.delete("c");
    expect(batch.size).toBe(0);
    expect(batch.render(ctx, VIEWPORT)).toEqual({ primitives: 0, chunks: 0 });
  });

  it("moves an element to another cell and rebuilds only the two chunks", () => {
    const batch = new ScenePathBatch({ zIndex: 1 });
    const ctx = createContext();
    const wide = { minX: 0, minY: 0, maxX: 30000, maxY: 1000 };
    batch.add(line("a", 0, 0));
    batch.add(line("m", 100, 0));
    batch.add(line("c", 20000, 0));
    expect(batch.render(ctx, wide)).toEqual({ primitives: 3, chunks: 2 });
    addPath.mockClear();

    batch.update("m", { x: 9000 });
    // Cell A keeps "a" (rebuilt: 1 item), the new cell holds "m" (1 item); cell of "c" is untouched.
    expect(batch.render(ctx, wide)).toEqual({ primitives: 3, chunks: 3 });
    expect(addPath).toHaveBeenCalledTimes(2);
    expect(batch.render(ctx, { minX: 0, minY: 0, maxX: 500, maxY: 1000 })).toEqual({ primitives: 1, chunks: 1 });
    expect(batch.render(ctx, { minX: 8900, minY: 0, maxX: 9500, maxY: 1000 })).toEqual({ primitives: 1, chunks: 1 });
  });
});
