import { Graph } from "../../graph";

import { SceneCanvasLayer } from "./SceneCanvasLayer";
import { ScenePathBatch } from "./ScenePathBatch";
import { SceneStore } from "./SceneStore";

beforeAll(() => {
  // jest-canvas-mock lacks roundRect and Path2D.addPath; stub them as drawPrimitives.test.ts does.
  for (const [proto, name] of [
    [CanvasRenderingContext2D.prototype, "roundRect"],
    [Path2D.prototype, "addPath"],
  ] as const) {
    if (!(name in proto)) {
      Object.defineProperty(proto, name, { value: function stub(): void {}, configurable: true, writable: true });
    }
  }
});

describe("SceneCanvasLayer", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => graph.unmount());

  it("draws the elements of the store that meet the viewport", () => {
    const store = new SceneStore(100);
    const circle = { kind: "circle" as const, cx: 5, cy: 5, r: 5, fill: "#000" };
    store.add({
      id: "near",
      zIndex: 1,
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [circle],
    });
    store.add({
      id: "far",
      zIndex: 1,
      x: 900,
      y: 900,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [circle],
    });
    const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store });
    layer.attachLayer(document.createElement("div"));
    const fill = jest.spyOn(layer.context.ctx as CanvasRenderingContext2D, "fill");

    layer.drawScene({ minX: 0, minY: 0, maxX: 100, maxY: 100 });

    expect(layer.stats).toEqual({ elements: 1, primitives: 1, batchedPrimitives: 0, chunks: 0 });
    expect(fill).toHaveBeenCalledTimes(1);
    layer.detachLayer();
  });

  it("passes maxRun to the drawing of runs", () => {
    const store = new SceneStore(100);
    const segments = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0]);
    for (const id of ["a", "b", "c"]) {
      store.add({
        id,
        zIndex: 1,
        x: 0,
        y: 0,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        primitives: [{ kind: "path", segments, stroke: { color: "#123", width: 2 } }],
      });
    }
    const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, maxRun: 2 });
    layer.attachLayer(document.createElement("div"));
    const stroke = jest.spyOn(layer.context.ctx as CanvasRenderingContext2D, "stroke");

    layer.drawScene({ minX: 0, minY: 0, maxX: 100, maxY: 100 });

    expect(stroke).toHaveBeenCalledTimes(2);
    layer.detachLayer();
  });

  it("draws a batch between the store elements by z-index", () => {
    const store = new SceneStore(100);
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    for (const [id, zIndex] of [
      ["low", 0],
      ["high", 2],
    ] as const) {
      store.add({
        id,
        zIndex,
        x: 0,
        y: 0,
        bounds,
        primitives: [{ kind: "rect", x: 0, y: 0, width: 5, height: 5, fill: "#000" }],
      });
    }
    const batch = new ScenePathBatch({ zIndex: 1 });
    batch.add({
      id: "p",
      x: 0,
      y: 0,
      bounds,
      primitives: [{ kind: "path", segments: new Float32Array([0, 0, 1, 0]), stroke: { color: "#123", width: 2 } }],
    });
    const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, batches: [batch] });
    layer.attachLayer(document.createElement("div"));
    const ctx = layer.context.ctx as CanvasRenderingContext2D;
    const calls: string[] = [];
    jest.spyOn(ctx, "fill").mockImplementation(() => {
      calls.push("fill");
    });
    jest.spyOn(ctx, "stroke").mockImplementation(() => {
      calls.push("stroke");
    });

    layer.drawScene({ minX: 0, minY: 0, maxX: 100, maxY: 100 });

    expect(calls).toEqual(["fill", "stroke", "fill"]);
    expect(layer.stats).toEqual({ elements: 2, primitives: 3, batchedPrimitives: 1, chunks: 1 });
    layer.detachLayer();
  });

  describe("z-order of batches", () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    function elementFill(zIndex: number): string {
      return `#00${(zIndex + 50).toString(16).padStart(2, "0")}00`;
    }

    function batchStroke(zIndex: number): string {
      return `#${(zIndex + 50).toString(16).padStart(2, "0")}0000`;
    }

    /** Draws a scene of rect elements and path batches and returns what was painted, in order. */
    function paint(elementZ: number[], batchZ: number[], maxRun?: number): string[] {
      const store = new SceneStore(100);
      elementZ.forEach((zIndex, i) => {
        store.add({
          id: `e${i}`,
          zIndex,
          x: 0,
          y: 0,
          bounds,
          primitives: [{ kind: "rect", x: 0, y: 0, width: 5, height: 5, fill: elementFill(zIndex) }],
        });
      });
      const batches = batchZ.map((zIndex) => {
        const batch = new ScenePathBatch({ zIndex });
        batch.add({
          id: `b${zIndex}`,
          x: 0,
          y: 0,
          bounds,
          primitives: [
            {
              kind: "path",
              segments: new Float32Array([0, 0, 1, 0]),
              stroke: { color: batchStroke(zIndex), width: 2 },
            },
          ],
        });
        return batch;
      });
      const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, batches, maxRun });
      layer.attachLayer(document.createElement("div"));
      const ctx = layer.context.ctx as CanvasRenderingContext2D;
      const painted: string[] = [];
      jest.spyOn(ctx, "fill").mockImplementation(() => {
        painted.push(`e${(ctx.fillStyle as string).slice(3, 5)}`);
      });
      jest.spyOn(ctx, "stroke").mockImplementation(() => {
        painted.push(`b${(ctx.strokeStyle as string).slice(1, 3)}`);
      });
      layer.drawScene(viewport);
      layer.detachLayer();
      return painted;
    }

    const e = (z: number): string => `e${(z + 50).toString(16).padStart(2, "0")}`;
    const b = (z: number): string => `b${(z + 50).toString(16).padStart(2, "0")}`;

    it("draws an element of the same z-index before the batch", () => {
      expect(paint([1], [1])).toEqual([e(1), b(1)]);
    });

    it("draws elements of the same z-index before the batch and higher ones after", () => {
      expect(paint([0, 1, 2], [1])).toEqual([e(0), e(1), b(1), e(2)]);
    });

    it("draws batches passed out of order by ascending z-index with elements between them", () => {
      expect(paint([0, 2, 4], [3, 1])).toEqual([e(0), b(1), e(2), b(3), e(4)]);
    });

    it("draws a batch below all elements first and a batch above all elements last", () => {
      expect(paint([2, 3], [1, 5])).toEqual([b(1), e(2), e(3), b(5)]);
    });

    it("orders a negative z-index element and batch before the rest", () => {
      expect(paint([-2, 0], [-1])).toEqual([e(-2), b(-1), e(0)]);
      expect(paint([0], [-3])).toEqual([b(-3), e(0)]);
    });

    it("draws every element once when batches have no elements between them", () => {
      expect(paint([1, 1, 2], [1, 1, 2])).toEqual([e(1), e(1), b(1), b(1), e(2), b(2)]);
    });

    it("applies maxRun to the slices of elements on the batches path", () => {
      const store = new SceneStore(100);
      for (const id of ["a", "b", "c"]) {
        store.add({
          id,
          zIndex: 1,
          x: 0,
          y: 0,
          bounds,
          primitives: [
            { kind: "path", segments: new Float32Array([0, 0, 1, 0]), stroke: { color: "#123456", width: 2 } },
          ],
        });
      }
      const batch = new ScenePathBatch({ zIndex: 2 });
      batch.add({
        id: "p",
        x: 0,
        y: 0,
        bounds,
        primitives: [
          { kind: "path", segments: new Float32Array([0, 0, 1, 0]), stroke: { color: "#654321", width: 2 } },
        ],
      });
      const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, batches: [batch], maxRun: 2 });
      layer.attachLayer(document.createElement("div"));
      const stroke = jest.spyOn(layer.context.ctx as CanvasRenderingContext2D, "stroke");

      layer.drawScene(viewport);

      // Two runs for three paths (maxRun 2), plus one stroke for the batch.
      expect(stroke).toHaveBeenCalledTimes(3);
      layer.detachLayer();
    });
  });

  it("turns the camera state into a world viewport", () => {
    const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store: new SceneStore() });
    graph.cameraService.set({ x: 100, y: 50, width: 800, height: 600, scale: 0.5 });
    expect(layer.getWorldViewport()).toEqual({ minX: -200, minY: -100, maxX: 1400, maxY: 1100 });
  });
});
