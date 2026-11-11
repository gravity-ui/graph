import { Graph } from "../../graph";
import type { TSceneElementInput } from "../../lib/scene/SceneStore";
import type { TSceneChange } from "../../lib/scene/types";
import type { ISceneBackend, ISceneBackendModule } from "../../lib/scene/webgl/backendTypes";
import { Layer } from "../Layer";

import type { TSceneElementView, TSceneRendererState } from "./types";

beforeAll(() => {
  // jest-canvas-mock lacks roundRect and Path2D.addPath; stub them as SceneRendererLayer.test.ts does.
  for (const [proto, name] of [
    [CanvasRenderingContext2D.prototype, "roundRect"],
    [Path2D.prototype, "addPath"],
  ] as const) {
    if (!(name in proto)) {
      Object.defineProperty(proto, name, { value: function stub(): void {}, configurable: true, writable: true });
    }
  }
});

function waitForRenderer(target: Graph, state: TSceneRendererState, timeoutMs = 2000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const reached = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`renderer did not reach "${state}", is "${target.scene.$renderer.value}"`));
    }, timeoutMs);
    unsubscribe = target.scene.$renderer.subscribe((value) => {
      if (value === state) resolve();
    });
  });
  return reached.finally(() => {
    clearTimeout(timer);
    unsubscribe?.();
  });
}

type TFakeGpu = { module: ISceneBackendModule; created: number; disposed: number; drawn: string[][] };

/** A backend that records which element ids it knows at every draw. */
function createFakeGpu(): TFakeGpu {
  const fake: TFakeGpu = { created: 0, disposed: 0, drawn: [], module: undefined as unknown as ISceneBackendModule };
  fake.module = {
    createSceneBackend: async (): Promise<ISceneBackend> => {
      fake.created++;
      const known = new Set<string>();
      return {
        canvas: document.createElement("canvas"),
        stats: {},
        replay: (store: { forEach(cb: (element: { id: string }) => void): void }): void =>
          store.forEach((element) => known.add(element.id)),
        apply: (change: TSceneChange): void => {
          if (change.type === "delete") known.delete(change.element.id);
          else known.add(change.element.id);
        },
        setStyles: (): void => undefined,
        draw: (): boolean => {
          fake.drawn.push([...known]);
          return false;
        },
        dispose: (): void => {
          fake.disposed++;
        },
      } as unknown as ISceneBackend;
    },
  };
  return fake;
}

function rectElement(id: string): TSceneElementInput {
  return {
    id,
    zIndex: 200,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#f00" }],
  };
}

describe("graph.scene", () => {
  let graph: Graph;

  afterEach(() => graph.unmount());

  it("exists, starts on canvas and reads the level", () => {
    graph = new Graph({}, document.createElement("div"));
    expect(graph.scene.$renderer.value).toBe("canvas");
    graph.cameraService.set({ scale: 0.05 });
    expect(graph.scene.$level.value).toBe("minimalistic");
  });

  it("draws after every layer in the same tick", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    const order: string[] = [];
    class Writer extends Layer {
      protected render(): void {
        order.push("layer");
      }
    }
    const writer = graph.addLayer(Writer, {});
    const sceneLayer = graph.scene.layer;
    const draw = jest.spyOn(sceneLayer as unknown as { render(): void }, "render").mockImplementation(() => {
      order.push("scene");
    });
    writer.performRender();
    sceneLayer.performRender();
    graph.scheduler.performUpdate();
    expect(order).toEqual(["layer", "scene"]);
    draw.mockRestore();
  });

  it("follows the renderer setting", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.updateSettings({ renderer: "webgl", webglBackend: () => Promise.reject(new Error("no gpu")) });
    expect(["loading", "webgl-fallback"]).toContain(graph.scene.$renderer.value);
    await waitForRenderer(graph, "webgl-fallback");
    expect(warn).toHaveBeenCalled();
    expect(graph.scene.$renderer.value).toBe("webgl-fallback");
    warn.mockRestore();
  });

  it("pauses the clock on stop and resumes on start", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    const a = graph.scene.clock.now();
    graph.stop();
    const b = graph.scene.clock.now();
    expect(graph.scene.clock.now()).toBe(b);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("queries elements as read-only views", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.scene.store.add({
      id: "a",
      zIndex: 200,
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#f00" }],
    });
    const [view] = graph.scene.query({ x: -1, y: -1, width: 21, height: 21 });
    expect(view.id).toBe("a");
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("queries by a TRect, leaving out hidden and distant elements", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.scene.store.add({ ...rectElement("near"), x: 100, y: 100 });
    graph.scene.store.add({ ...rectElement("far"), x: 1000, y: 1000 });
    graph.scene.store.add({ ...rectElement("hidden"), x: 100, y: 100, hidden: true });
    const ids = (rect: { x: number; y: number; width: number; height: number }): string[] =>
      graph.scene.query(rect).map((view) => view.id);
    expect(ids({ x: 95, y: 95, width: 20, height: 20 })).toEqual(["near"]);
    expect(ids({ x: 0, y: 0, width: 50, height: 50 })).toEqual([]);
    expect(ids({ x: 0, y: 0, width: 2000, height: 2000 })).toEqual(["near", "far"]);
  });

  it("dispose is idempotent", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.scene.dispose();
    expect(() => graph.scene.dispose()).not.toThrow();
  });

  describe("drawInterpreted", () => {
    const textElement = (): TSceneElementView => ({
      ...rectElement("t"),
      hidden: false,
      order: 1,
      styleId: 0,
      primitives: [
        { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#f00" },
        {
          kind: "text",
          text: "label",
          family: "sans-serif",
          size: 12,
          lineHeight: 14,
          color: "#000",
          x: 0,
          y: 0,
          width: 50,
        },
      ],
    });

    it("draws rects and text, and skipText leaves only the text out", () => {
      graph = new Graph({}, document.createElement("div"));
      const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
      const fill = jest.spyOn(ctx, "fill");
      const fillText = jest.spyOn(ctx, "fillText");

      graph.scene.drawInterpreted(ctx, [textElement()], 1);
      expect(fill).toHaveBeenCalled();
      expect(fillText).toHaveBeenCalled();

      fill.mockClear();
      fillText.mockClear();
      graph.scene.drawInterpreted(ctx, [textElement()], 1, { skipText: true });
      expect(fill).toHaveBeenCalled();
      expect(fillText).not.toHaveBeenCalled();
    });
  });

  it("setRenderer writes the renderer setting", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = new Graph({}, document.createElement("div"));
    graph.updateSettings({ webglBackend: () => Promise.reject(new Error("no gpu")) });
    expect(graph.rootStore.settings.$renderer.value).toBe("canvas");
    graph.scene.setRenderer("webgl");
    expect(graph.rootStore.settings.$renderer.value).toBe("webgl");
    await waitForRenderer(graph, "webgl-fallback");
    graph.scene.setRenderer("canvas");
    expect(graph.rootStore.settings.$renderer.value).toBe("canvas");
    expect(graph.scene.$renderer.value).toBe("canvas");
    warn.mockRestore();
  });

  describe("lifecycle", () => {
    const layersOf = (target: Graph): Set<Layer> => (target.layers as unknown as { layers: Set<Layer> }).layers;

    it("unmount removes the scene layer from graph.layers", () => {
      graph = new Graph({}, document.createElement("div"));
      const layer = graph.scene.layer;
      expect(layersOf(graph).has(layer)).toBe(true);
      graph.unmount();
      expect(layersOf(graph).has(layer)).toBe(false);
    });

    it("unmount releases the settings subscription", () => {
      graph = new Graph({}, document.createElement("div"));
      const setRenderer = jest.spyOn(graph.scene.layer, "setRenderer");
      graph.updateSettings({ renderer: "webgl", webglBackend: () => Promise.reject(new Error("no gpu")) });
      expect(setRenderer).toHaveBeenCalledTimes(1);
      setRenderer.mockClear();
      graph.unmount();
      graph.rootStore.settings.setupSettings({ renderer: "canvas" });
      expect(setRenderer).not.toHaveBeenCalled();
    });

    it("unmount releases the visibility listener", () => {
      const added = jest.spyOn(document, "addEventListener");
      const removed = jest.spyOn(document, "removeEventListener");
      const visibilityCalls = (spy: jest.SpyInstance): unknown[] =>
        spy.mock.calls.filter(([type]) => type === "visibilitychange").map(([, handler]) => handler);
      try {
        graph = new Graph({}, document.createElement("div"));
        const handlers = visibilityCalls(added);
        expect(handlers).toHaveLength(1);
        expect(visibilityCalls(removed)).toHaveLength(0);
        graph.unmount();
        expect(visibilityCalls(removed)).toEqual(handlers);
      } finally {
        added.mockRestore();
        removed.mockRestore();
      }
    });

    it("pauses the clock while the document is hidden and resumes after", () => {
      let now = 0;
      const perf = jest.spyOn(performance, "now").mockImplementation(() => (now += 1000));
      let hidden = false;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      try {
        graph = new Graph({}, document.createElement("div"));
        graph.start();
        hidden = true;
        document.dispatchEvent(new Event("visibilitychange"));
        const frozen = graph.scene.clock.now();
        expect(graph.scene.clock.now()).toBe(frozen);
        hidden = false;
        document.dispatchEvent(new Event("visibilitychange"));
        expect(graph.scene.clock.now()).toBeGreaterThan(frozen);
      } finally {
        delete (document as unknown as { hidden?: boolean }).hidden;
        perf.mockRestore();
      }
    });

    it("resumes the clock after stop and start", () => {
      let now = 0;
      const perf = jest.spyOn(performance, "now").mockImplementation(() => (now += 1000));
      try {
        graph = new Graph({}, document.createElement("div"));
        graph.start();
        graph.stop();
        const frozen = graph.scene.clock.now();
        expect(graph.scene.clock.now()).toBe(frozen);
        graph.start();
        const resumed = graph.scene.clock.now();
        expect(resumed).toBeGreaterThan(frozen);
        expect(graph.scene.clock.now()).toBeGreaterThan(resumed);
      } finally {
        perf.mockRestore();
      }
    });

    it("keeps the WebGL renderer working across stop and start", async () => {
      const fake = createFakeGpu();
      graph = new Graph({ settings: { renderer: "webgl", webglBackend: () => Promise.resolve(fake.module) } });
      graph.attach(document.createElement("div"));
      graph.cameraService.set({ width: 800, height: 600 });
      graph.start();
      await waitForRenderer(graph, "webgl");
      graph.scene.store.add(rectElement("a"));
      graph.scheduler.performUpdate();
      expect(fake.drawn.at(-1)).toEqual(["a"]);

      graph.stop();
      graph.start();
      await waitForRenderer(graph, "webgl");
      fake.drawn.length = 0;
      graph.scene.store.add(rectElement("b"));
      graph.scheduler.performUpdate();
      expect(graph.scene.$renderer.value).toBe("webgl");
      expect(fake.drawn.at(-1)).toEqual(expect.arrayContaining(["a", "b"]));
    });

    it("reloads WebGL after detach and attach", async () => {
      const fake = createFakeGpu();
      graph = new Graph({ settings: { renderer: "webgl", webglBackend: () => Promise.resolve(fake.module) } });
      const root = document.createElement("div");
      graph.attach(root);
      graph.start();
      await waitForRenderer(graph, "webgl");
      const createdBefore = fake.created;

      graph.detach();
      expect(graph.scene.$renderer.value).toBe("canvas");
      expect(fake.disposed).toBe(createdBefore);

      graph.attach(root);
      graph.start();
      await waitForRenderer(graph, "webgl");
      expect(fake.created).toBe(createdBefore + 1);
      expect(graph.scene.$renderer.value).toBe("webgl");
    });
  });

  describe("frame order", () => {
    it("draws an element a layer added during layers.update() in the same frame", async () => {
      const fake = createFakeGpu();
      graph = new Graph({ settings: { renderer: "webgl", webglBackend: () => Promise.resolve(fake.module) } });
      graph.attach(document.createElement("div"));
      graph.cameraService.set({ width: 800, height: 600 });
      graph.start();
      await waitForRenderer(graph, "webgl");
      graph.scheduler.performUpdate();

      let added = false;
      class Writer extends Layer {
        protected render(): void {
          super.render();
          if (added) return;
          added = true;
          graph.scene.store.add(rectElement("late"));
        }
      }
      const writer = graph.addLayer(Writer, {});
      writer.performRender();
      fake.drawn.length = 0;
      graph.scheduler.performUpdate();

      expect(added).toBe(true);
      expect(fake.drawn.length).toBeGreaterThan(0);
      expect(fake.drawn.at(-1)).toContain("late");
    });
  });
});
