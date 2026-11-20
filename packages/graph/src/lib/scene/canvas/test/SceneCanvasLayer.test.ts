import { Graph } from "../../../../graph";
import { SceneStore } from "../../store/SceneStore";
import { SceneCanvasLayer } from "../SceneCanvasLayer";
import { ScenePathBatch } from "../ScenePathBatch";

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

  describe("z-order of batches", () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    function elementFill(zIndex: number): string {
      return `#00${(zIndex + 50).toString(16).padStart(2, "0")}00`;
    }

    function batchStroke(zIndex: number): string {
      return `#${(zIndex + 50).toString(16).padStart(2, "0")}0000`;
    }

    function paint(elementZ: number[], batchZ: number[]) {
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
      const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, batches });
      layer.attachLayer(document.createElement("div"));
      const ctx = layer.context.ctx as CanvasRenderingContext2D;
      const painted: string[] = [];
      jest.spyOn(ctx, "fillRect").mockImplementation(() => {
        painted.push(`e${(ctx.fillStyle as string).slice(3, 5)}`);
      });
      jest.spyOn(ctx, "stroke").mockImplementation(() => {
        painted.push(`b${(ctx.strokeStyle as string).slice(1, 3)}`);
      });
      layer.drawScene(viewport);
      layer.detachLayer();
      return { painted, stats: layer.stats };
    }

    const e = (z: number): string => `e${(z + 50).toString(16).padStart(2, "0")}`;
    const b = (z: number): string => `b${(z + 50).toString(16).padStart(2, "0")}`;

    it.each<[number[], number[], string[]]>([
      [[1], [1], [e(1), b(1)]],
      [[0, 1, 2], [1], [e(0), e(1), b(1), e(2)]],
      [
        [0, 2, 4],
        [3, 1],
        [e(0), b(1), e(2), b(3), e(4)],
      ],
      [
        [2, 3],
        [1, 5],
        [b(1), e(2), e(3), b(5)],
      ],
      [[-2, 0], [-1], [e(-2), b(-1), e(0)]],
      [[0], [-3], [b(-3), e(0)]],
      [
        [1, 1, 2],
        [1, 1, 2],
        [e(1), e(1), b(1), b(1), e(2), b(2)],
      ],
    ])("paints element depths %j and batch depths %j in z-order", (elements, batches, expected) => {
      expect(paint(elements, batches).painted).toEqual(expected);
    });

    it("includes batch primitives and chunks in the draw statistics", () => {
      const { painted, stats } = paint([0, 2], [1]);
      expect(painted).toEqual([e(0), b(1), e(2)]);
      expect(stats).toEqual({ elements: 2, primitives: 3, batchedPrimitives: 1, chunks: 1 });
    });

    it("places a raised element by its raised bucket relative to a batch", () => {
      const store = new SceneStore(100);
      for (const [id, zIndex] of [
        ["plain", 203],
        ["raised", 200],
      ] as const) {
        store.add({
          id,
          zIndex,
          x: 0,
          y: 0,
          bounds,
          primitives: [{ kind: "rect", x: 0, y: 0, width: 5, height: 5, fill: elementFill(zIndex) }],
        });
      }
      // The raised element sits in bucket 205, after the plain one (203), though its own zIndex is lower.
      store.setStyle("raised", store.defineStyle({ raise: 5 }));
      const batch = new ScenePathBatch({ zIndex: 204 });
      batch.add({
        id: "b",
        x: 0,
        y: 0,
        bounds,
        primitives: [
          { kind: "path", segments: new Float32Array([0, 0, 1, 0]), stroke: { color: batchStroke(204), width: 2 } },
        ],
      });
      const layer = new SceneCanvasLayer({ graph, camera: graph.cameraService, store, batches: [batch] });
      layer.attachLayer(document.createElement("div"));
      const ctx = layer.context.ctx as CanvasRenderingContext2D;
      const painted: string[] = [];
      jest.spyOn(ctx, "fillRect").mockImplementation(() => {
        painted.push(`e${(ctx.fillStyle as string).slice(3, 5)}`);
      });
      jest.spyOn(ctx, "stroke").mockImplementation(() => {
        painted.push(`b${(ctx.strokeStyle as string).slice(1, 3)}`);
      });
      layer.drawScene(viewport);
      layer.detachLayer();
      expect(painted).toEqual([e(203), b(204), e(200)]);
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
