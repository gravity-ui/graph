import { Block } from "../../../components/canvas/blocks/Block";
import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { Graph } from "../../../graph";
import { drawElements } from "../../../lib/scene/canvas/drawPrimitives";
import type { ISceneBackend, ISceneBackendModule, TSceneBackendEvents } from "../../../lib/scene/renderer/backendTypes";
import type { TSceneElementInput } from "../../../lib/scene/store/SceneStore";
import type { TSceneChange } from "../../../lib/scene/types";
import { Layer } from "../../Layer";
import { ECameraScaleLevel } from "../../camera/cameraScaleEnums";
import { ESelectionStrategy } from "../../selection";
import { StyleResolver } from "../../styles/StyleResolver";
import type { TSceneStyles, TStyleParts } from "../../styles/types";
import { entityKey } from "../../tags/TagStore";
import { hoveredTag, selectedTag } from "../../tags/builtinTags";
import { defineTag } from "../../tags/defineTag";
import type { TSceneElementView, TSceneRendererState, TSceneState } from "../types";

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

type TFakeGpu = {
  module: ISceneBackendModule;
  events?: TSceneBackendEvents;
  created: number;
  disposed: number;
  drawn: string[][];
};

/** A backend that records which element ids it knows at every draw. */
function createFakeGpu(): TFakeGpu {
  const fake: TFakeGpu = { created: 0, disposed: 0, drawn: [], module: undefined as unknown as ISceneBackendModule };
  fake.module = {
    createSceneBackend: async (_sibling, events): Promise<ISceneBackend> => {
      fake.events = events;
      fake.created++;
      const known = new Set<string>();
      return {
        canvas: document.createElement("canvas"),
        stats: {},
        replay: (store: { forEach(cb: (element: { id: string }) => void): void }): void =>
          store.forEach((element) => known.add(element.id)),
        applyMany: (changes: readonly TSceneChange[]): void => {
          for (const change of changes) {
            if (change.type === "delete") known.delete(change.element.id);
            else known.add(change.element.id);
          }
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

  it("keeps a Canvas request made by the initial WebGL loading subscriber", async () => {
    const gpu = createFakeGpu();
    graph = new Graph({ settings: { renderer: "webgl", webglBackend: async () => gpu.module } });
    const states: TSceneRendererState[] = [];
    const unsubscribe = graph.scene.$renderer.subscribe((state) => {
      states.push(state);
      if (state === "loading") graph.scene.setRenderer("canvas");
    });
    try {
      graph.attach(document.createElement("div"));
      graph.start();
      // Let the backend import and creation finish if cancellation failed.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(states).toEqual(["canvas", "loading", "canvas"]);
      expect(graph.scene.$renderer.value).toBe("canvas");
      expect(gpu.created).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  it("does not transfer the selection when a replacement uses the string form of a numeric block ID", () => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 320 }, clientHeight: { value: 200 } });
    const block = { is: "Block", name: "A", x: 10, y: 20, width: 40, height: 30 };
    graph = new Graph({ blocks: [{ ...block, id: 7 }] }, root);
    graph.start();
    graph.scheduler.performUpdate();
    graph.api.selectBlocks([7], true);
    expect(graph.scene.explain("block", 7).tags).toContainEqual({ name: selectedTag.name, value: true });

    graph.setEntities({ blocks: [{ ...block, id: "7", x: 100 }] });
    graph.scheduler.performUpdate();

    expect(graph.scene.explain("block", "7").tags).not.toContainEqual({ name: selectedTag.name, value: true });
    const view = { x: 0, y: 0, width: 320, height: 200 };
    expect(graph.scene.query(view, { entityTypes: ["block"] })).toEqual([
      expect.objectContaining({ id: entityKey("block", "7"), x: 100 }),
    ]);
    graph.api.deleteSelected();
    expect(graph.api.getBlockById("7")).toBeDefined();
  });

  it("keeps separate scene views for numeric and string IDs in one snapshot", () => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 320 }, clientHeight: { value: 200 } });
    const block = { is: "Block", name: "A", y: 20, width: 40, height: 30 };
    const edge = { sourceBlockId: "7", targetBlockId: "target" };
    graph = new Graph(
      {
        blocks: [
          { ...block, id: 7, x: 10 },
          { ...block, id: "7", x: 100 },
          { ...block, id: "target", x: 180 },
        ],
        connections: [
          { ...edge, id: 8 },
          { ...edge, id: "8" },
        ],
      },
      root
    );
    graph.start();
    graph.scheduler.performUpdate();

    const view = { x: 0, y: 0, width: 320, height: 200 };
    const ids = graph.scene.query(view).map(({ id }) => id);
    const sameSpelling = [
      entityKey("block", 7),
      entityKey("block", "7"),
      entityKey("connection", 8),
      entityKey("connection", "8"),
    ];
    expect(new Set(sameSpelling).size).toBe(4);
    expect(ids).toEqual(expect.arrayContaining(sameSpelling));
  });

  describe("scene-state-change", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function deliverEvents() {
      jest.runAllTicks();
      jest.advanceTimersByTime(0);
    }

    function startGraph(config: ConstructorParameters<typeof Graph>[0] = {}) {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 320 }, clientHeight: { value: 200 } });
      graph = new Graph(config, root);
      const changes: TSceneState[] = [];
      graph.on("scene-state-change", (event) => {
        expect(event.cancelable).toBe(false);
        changes.push(event.state);
      });
      expect(graph.scene.state).toBe("init");
      graph.start();
      expect(graph.scene.state).toBe("initialize");
      expect(changes).toEqual([]);
      deliverEvents();
      expect(changes).toEqual(["init", "initialize"]);
      return changes;
    }

    it("delivers ready after the populated Canvas draw and repeats only for full replacements", () => {
      const block = { id: "a", is: "Block", name: "A", x: 10, y: 20, width: 40, height: 30 };
      const changes = startGraph({ blocks: [block] });
      graph.scheduler.performUpdate();
      expect(graph.scene.store.get(entityKey("block", "a"))).toBeDefined();
      expect(changes).toEqual(["init", "initialize"]);
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");
      graph.updateEntities({ blocks: [{ ...block, x: 20 }] });
      graph.cameraService.set({ scale: 0.5 });
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes).toHaveLength(3);
      graph.setEntities({});
      expect(graph.scene.state).toBe("initialize");
      graph.scheduler.performUpdate();
      expect(graph.scene.store.get(entityKey("block", "a"))).toBeUndefined();
      deliverEvents();
      expect(changes.slice(3)).toEqual(["initialize", "ready"]);
    });

    it("waits for a visible viewport and cancels pending readiness on detach or unmount", () => {
      const changes = startGraph();
      graph.cameraService.set({ width: 0 });
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(graph.scene.state).toBe("initialize");
      graph.cameraService.set({ width: 320 });
      graph.scheduler.performUpdate();
      jest.runAllTicks();
      expect(graph.scene.state).toBe("ready");
      graph.stop();
      deliverEvents();
      expect(changes).toEqual(["init", "initialize", "init"]);
      graph.start();
      graph.scheduler.performUpdate();
      graph.unmount();
      deliverEvents();
      expect(changes).toHaveLength(3);
    });

    it("waits for the requested WebGL draw, and for a Canvas draw on switch or fallback", async () => {
      const gpu = createFakeGpu();
      const changes = startGraph({ settings: { renderer: "webgl", webglBackend: async () => gpu.module } });
      graph.scheduler.performUpdate();
      expect(graph.scene.state).toBe("initialize");
      await waitForRenderer(graph, "webgl");
      expect(graph.scene.state).toBe("initialize");
      graph.scheduler.performUpdate();
      expect(gpu.drawn).toHaveLength(1);
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");
      graph.scene.setRenderer("canvas");
      expect(graph.scene.state).toBe("switch");
      graph.scheduler.performUpdate();
      jest.runAllTicks();
      graph.updateSettings({
        webglBackend: async () => {
          throw new Error("no WebGL");
        },
        renderer: "webgl",
      });
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes.slice(3)).toEqual(["switch", "switch"]);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      await waitForRenderer(graph, "webgl-fallback");
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("waits for the fitted camera when zoomTo(center) resolves after the first draw", () => {
      const block = { id: "far", is: "Block", name: "", x: 5000, y: 800, width: 40, height: 30 };
      const changes = startGraph({ blocks: [block] });
      graph.zoomTo("center", { padding: 20 });
      const before = graph.$camera.peek();
      graph.scheduler.performUpdate();
      expect(graph.$camera.peek()).not.toEqual(before);
      deliverEvents();
      expect(changes).toEqual(["init", "initialize"]);
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");
    });

    it("waits for a replacement made by another layer after the graph layer already drew", () => {
      const changes = startGraph();
      graph.scheduler.performUpdate();
      deliverEvents();
      let replace = true;
      class ReplacingLayer extends Layer {
        protected render(): void {
          if (!replace) return;
          replace = false;
          graph.setEntities({ blocks: [{ id: "new", is: "Block", name: "", x: 0, y: 0, width: 40, height: 20 }] });
        }
      }
      graph.addLayer(ReplacingLayer, {});
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(graph.scene.store.get(entityKey("block", "new"))).toBeUndefined();
      expect(changes.at(-1)).toBe("initialize");
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(graph.scene.store.get(entityKey("block", "new"))).toBeDefined();
      expect(changes.at(-1)).toBe("ready");
    });

    it("presents the Canvas fallback on loss and the restored WebGL frame on recovery", async () => {
      const gpu = createFakeGpu();
      const changes = startGraph({ settings: { renderer: "webgl", webglBackend: async () => gpu.module } });
      await waitForRenderer(graph, "webgl");
      graph.scheduler.performUpdate();
      deliverEvents();
      gpu.events?.onLost();
      expect(graph.scene.state).toBe("switch");
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");
      const draws = gpu.drawn.length;
      gpu.events?.onRestored();
      await waitForRenderer(graph, "webgl");
      expect(graph.scene.state).toBe("switch");
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(gpu.drawn.length).toBe(draws + 1);
      expect(changes).toEqual(["init", "initialize", "ready", "switch", "ready", "switch", "ready"]);
    });

    it("gives an opted-in overlay a paint before warm GPU creation and cancels an obsolete teardown", async () => {
      const changes = startGraph();
      graph.scene.store.add(rectElement("content"));
      graph.scheduler.performUpdate();
      deliverEvents();
      const gpu = createFakeGpu();
      graph.updateSettings({ renderer: "webgl", webglBackend: async () => gpu.module, yieldBeforeSceneLoad: true });
      const pending = graph.scene.pendingPresentation;
      expect(pending).toBeDefined();
      deliverEvents();
      await Promise.resolve();
      expect(changes.at(-1)).toBe("switch");
      expect(graph.scene.state).toBe("switch");
      expect(gpu.created).toBe(0);
      jest.advanceTimersToNextFrame();
      await Promise.resolve();
      expect(gpu.created).toBe(0);
      jest.advanceTimersByTime(1);
      await waitForRenderer(graph, "webgl");
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(changes.at(-1)).toBe("ready");

      graph.scene.setRenderer("canvas");
      const secondPaint = graph.scene.pendingPresentation;
      graph.scene.setRenderer("webgl");
      deliverEvents();
      jest.advanceTimersToNextFrame();
      jest.advanceTimersByTime(1);
      await secondPaint;
      graph.scheduler.performUpdate();
      deliverEvents();
      expect(graph.scene.$renderer.value).toBe("webgl");
      expect(graph.scene.state).toBe("ready");
      expect(gpu.created).toBe(1);
      expect(gpu.disposed).toBe(0);
    });
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

  it("query returns child elements after their parent, with parent and childOrder", () => {
    graph = new Graph({}, document.createElement("div"));
    const base = { x: 0, y: 0, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, primitives: [] };
    graph.scene.store.add({ id: "p", zIndex: 200, ...base });
    graph.scene.store.add({ id: "c", zIndex: 0, parent: "p", childOrder: 4, ...base });
    const views = graph.scene.query({ x: 0, y: 0, width: 10, height: 10 });
    expect(views.map((view) => [view.id, view.parent, view.childOrder])).toEqual([
      ["p", undefined, 0],
      ["c", "p", 4],
    ]);
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

  it("redraws on a level change that no camera change caused", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ scale: 0.5 });
    graph.scheduler.performUpdate();
    const render = jest.spyOn(graph.scene.layer as unknown as { render(): void }, "render");
    graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed });
    graph.scheduler.performUpdate();
    expect(graph.scene.$level.value).toBe("detailed");
    expect(render).toHaveBeenCalled();
  });

  it("drawInterpreted draws the primitives of the given level only", () => {
    graph = new Graph({}, document.createElement("div"));
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D & {
      __getDrawCalls(): { type: string }[];
    };
    const view = Object.freeze({
      id: "e",
      childOrder: 0,
      x: 0,
      y: 0,
      zIndex: 0,
      order: 1,
      styleId: 0,
      hidden: false,
      bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      primitives: [
        { kind: "rect" as const, x: 0, y: 0, width: 4, height: 4, fill: "#f00", levelMask: 1 },
        { kind: "rect" as const, x: 0, y: 0, width: 4, height: 4, fill: "#0f0", levelMask: 2 },
      ],
    });
    graph.scene.drawInterpreted(ctx, [view], 1, { level: "schematic" });
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fillRect")).toHaveLength(1);
  });

  it("dispose is idempotent", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.scene.dispose();
    expect(() => graph.scene.dispose()).not.toThrow();
  });

  describe("drawInterpreted", () => {
    const textElement = (): TSceneElementView => ({
      ...rectElement("t"),
      childOrder: 0,
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
      const fill = jest.spyOn(ctx, "fillRect");
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
    it("defers new and renewed frame-end subscriptions and skips removed ones", () => {
      graph = new Graph({}, document.createElement("div"));
      graph.start();
      const renewed = jest.fn();
      const removed = jest.fn();
      const next = jest.fn();
      const first = jest.fn();
      const stopFirst = graph.scene.onFrameEnd(first);
      const stopRenewed = graph.scene.onFrameEnd(renewed);
      const stopRemoved = graph.scene.onFrameEnd(removed);
      first.mockImplementation(() => {
        stopFirst();
        stopRenewed();
        stopRemoved();
        graph.scene.onFrameEnd(renewed);
        graph.scene.onFrameEnd(next);
      });

      graph.scheduler.performUpdate();
      expect(renewed).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      stopRenewed();
      graph.scheduler.performUpdate();
      expect(renewed).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("aligns stationary HTML to the renderer that drew the frame, including an in-draw fallback", async () => {
      const fake = createFakeGpu();
      graph = new Graph({ settings: { renderer: "webgl", webglBackend: async () => fake.module } });
      graph.attach(document.createElement("div"));
      graph.start();
      const html = graph.addLayer(Layer, { html: { zIndex: 3, transformByCameraPosition: true } }).getHTML();
      graph.layers.rootSize.value = { width: 800, height: 600, dpr: 2 };
      graph.cameraService.set({ x: 10.375, y: -20.375, scale: 1 });
      await waitForRenderer(graph, "webgl");
      graph.scheduler.performUpdate();
      const webglMatrix = "matrix(1, 0, 0, 1, 10.375, -20.375)";
      const canvasMatrix = "matrix(1, 0, 0, 1, 10.5, -20.5)";
      expect(html?.style.transform).toBe(webglMatrix);

      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const backend = graph.scene.layer.getBackend();
        if (!backend) throw new Error("Expected an active WebGL backend");
        jest.spyOn(backend, "draw").mockImplementationOnce(() => {
          throw new Error("failed draw");
        });
        graph.scene.store.add(rectElement("fallback"));
        graph.scheduler.performUpdate();
        expect(graph.scene.$renderer.peek()).toBe("webgl-fallback");
        expect(graph.scene.layer.context.ctx?.getTransform()).toMatchObject({ e: 21, f: -41 });
        expect(html?.style.transform).toBe(canvasMatrix);
      } finally {
        warn.mockRestore();
      }

      graph.updateSettings({ renderer: "canvas" });
      graph.updateSettings({ renderer: "webgl" });
      await waitForRenderer(graph, "webgl");
      expect(html?.style.transform).toBe(canvasMatrix);
      graph.scheduler.performUpdate();
      expect(fake.drawn.at(-1)).toEqual(["fallback"]);
      expect(html?.style.transform).toBe(webglMatrix);
    });

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

describe("bindStyle and explain", () => {
  class Styled {
    public declare readonly __styleParts?: TStyleParts<"border">;
  }
  const running = defineTag("running");
  let graph: Graph;

  afterEach(() => graph.unmount());

  function addElement(id: string): void {
    graph.scene.store.add({
      id,
      zIndex: 200,
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
    });
  }

  it("keeps the element's style on the entity's tags and explains it", () => {
    graph = new Graph({});
    graph.scene.styles.add([{ target: Styled, tags: [running], style: { parts: { border: { color: "#2e7d32" } } } }]);
    addElement("e");
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    expect(graph.scene.store.get("e")?.styleId).not.toBe(0);
    const plain = graph.scene.store.get("e")?.styleId;
    graph.scene.tags.add(running, { block: ["e"] });
    const styled = graph.scene.store.get("e")?.styleId;
    expect(styled).not.toBe(plain);
    const explanation = graph.scene.explain("block", "e");
    expect(explanation.tags).toEqual([{ name: "running", value: true }]);
    expect(explanation.target).toBe("Styled");
    expect(explanation.style?.parts).toEqual({ border: { color: "#2e7d32" } });
    unbind();
    expect(graph.scene.store.get("e")?.styleId).toBe(0);
    expect(graph.scene.explain("block", "e").rules).toEqual([]);
  });

  it("explains matched rules with their layer, priority and tags", () => {
    graph = new Graph({});
    const focus = defineTag("focus");
    graph.scene.styles.add([
      { target: Styled, style: { parts: { border: { width: 1 } } } },
      { target: Styled, tags: [running], priority: 2, style: { parts: { border: { color: "#2e7d32" } } } },
    ]);
    graph.scene.tags.setRoot(focus, true);
    graph.scene.tags.add(running, { block: ["e"] });
    addElement("e");
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    const explanation = graph.scene.explain("block", "e");
    expect(explanation.root).toEqual(["focus"]);
    expect(explanation.rules).toEqual([
      { theme: false, priority: 0, layer: "base", tags: [] },
      { theme: false, priority: 2, layer: "state", tags: ["running"] },
    ]);
    expect(explanation.style).toBe(graph.scene.store.getStyles()[graph.scene.store.get("e")?.styleId ?? 0]);
    unbind();
  });

  it("explains an unbound entity with its tags only", () => {
    graph = new Graph({});
    graph.scene.tags.add(running, { block: ["x"] });
    expect(graph.scene.explain("block", "x")).toEqual({
      tags: [{ name: "running", value: true }],
      root: [],
      rules: [],
    });
  });

  it("frees the old row when the tags change and the row on unbind", () => {
    graph = new Graph({});
    addElement("e");
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    const plain = graph.scene.store.get("e")?.styleId ?? 0;
    graph.scene.tags.add(running, { block: ["e"] });
    expect(graph.scene.store.getStyles()[plain]).toEqual({});
    const styled = graph.scene.store.get("e")?.styleId ?? 0;
    unbind();
    unbind();
    expect(graph.scene.store.getStyles()[styled]).toEqual({});
    graph.scene.tags.delete(running, { block: ["e"] });
    expect(graph.scene.store.get("e")?.styleId).toBe(0);
  });

  it("shares a row between entities with the same tags", () => {
    graph = new Graph({});
    addElement("a");
    addElement("b");
    graph.scene.bindStyle("a", { type: "block", id: "a" }, Styled);
    graph.scene.bindStyle("b", { type: "block", id: "b" }, Styled);
    expect(graph.scene.store.get("a")?.styleId).toBe(graph.scene.store.get("b")?.styleId);
  });

  it("binds before the element exists and after it is deleted", () => {
    graph = new Graph({});
    const unbind = graph.scene.bindStyle("late", { type: "block", id: "late" }, Styled);
    graph.scene.tags.add(running, { block: ["late"] });
    expect(graph.scene.store.get("late")).toBeUndefined();
    expect(() => unbind()).not.toThrow();
  });

  it("hides a part by a scope-only rule and shows it again by a state rule", () => {
    class Titled {
      public declare readonly __styleParts?: TStyleParts<"title">;
    }
    const shown = defineTag("shown");
    graph = new Graph({});
    graph.cameraService.set({ scale: 0.05 });
    expect(graph.scene.$level.value).toBe("minimalistic");
    graph.scene.styles.add([
      { target: Titled, scope: { levels: ["minimalistic"] }, style: { parts: { title: { visible: false } } } },
      { target: Titled, tags: [shown], style: { parts: { title: { visible: true } } } },
    ]);
    graph.scene.store.add({
      id: "e",
      zIndex: 200,
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [{ kind: "rect", part: "title", x: 0, y: 0, width: 10, height: 10, fill: "#000000" }],
    });
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Titled);
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const draw = (): number =>
      drawElements(ctx, graph.scene.store.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 }), 0.05, {
        styles: graph.scene.store.getStyles(),
      });
    expect(draw()).toBe(0);
    graph.scene.tags.add(shown, { block: ["e"] });
    expect(draw()).toBe(1);
    graph.scene.tags.clear(shown);
    expect(draw()).toBe(0);
    graph.cameraService.set({ scale: 1 });
    expect(draw()).toBe(1);
  });

  it("draws the next frame after a root tag or a rule changes only colours", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    const focus = defineTag("focus");
    graph.scene.styles.add([{ target: Styled, root: [focus], style: { parts: { border: { color: "#ff0000" } } } }]);
    addElement("e");
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    const drawn: (string | undefined)[] = [];
    const draw = jest.spyOn(graph.scene.layer as unknown as { render(): void }, "render").mockImplementation(() => {
      const styleId = graph.scene.store.get("e")?.styleId ?? 0;
      drawn.push(graph.scene.store.getStyles()[styleId]?.parts?.border?.color);
    });
    graph.scheduler.performUpdate();
    drawn.length = 0;

    graph.scene.tags.setRoot(focus, true);
    graph.scheduler.performUpdate();
    expect(drawn).toEqual(["#ff0000"]);

    graph.scene.styles.add([
      { target: Styled, root: [focus], priority: 1, style: { parts: { border: { color: "#00ff00" } } } },
    ]);
    graph.scheduler.performUpdate();
    expect(drawn).toEqual(["#ff0000", "#00ff00"]);
    draw.mockRestore();
  });

  it("takes the dim colour from the theme's layer background", () => {
    graph = new Graph({});
    expect(graph.scene.store.getDimColor()).toBe(graph.$graphColors.value.canvas.layerBackground);
    graph.setColors({ canvas: { layerBackground: "#123456" } });
    expect(graph.scene.store.getDimColor()).toBe("#123456");
  });

  it("draws the next frame after a rule changes only dim or the theme changes the dim colour", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    const focus = defineTag("focus");
    graph.scene.styles.add([{ target: Styled, root: [focus], style: { dim: 0.6 } }]);
    addElement("e");
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    const drawn: [number | undefined, string][] = [];
    const draw = jest.spyOn(graph.scene.layer as unknown as { render(): void }, "render").mockImplementation(() => {
      const styleId = graph.scene.store.get("e")?.styleId ?? 0;
      drawn.push([graph.scene.store.getStyles()[styleId]?.dim, graph.scene.store.getDimColor()]);
    });
    graph.scheduler.performUpdate();
    drawn.length = 0;

    graph.scene.tags.setRoot(focus, true);
    graph.scheduler.performUpdate();
    const background = graph.$graphColors.value.canvas.layerBackground;
    expect(drawn).toEqual([[0.6, background]]);

    graph.setColors({ canvas: { layerBackground: "#000000" } });
    graph.scheduler.performUpdate();
    expect(drawn).toEqual([
      [0.6, background],
      [0.6, "#000000"],
    ]);
    draw.mockRestore();
  });

  it("a focus dim rule keeps the theme's selection border of a block outside the highlight", () => {
    graph = new Graph({});
    const focus = defineTag("focus");
    const highlighted = defineTag("highlighted");
    graph.scene.styles.add([{ target: Block, root: [focus], notTags: [highlighted], style: { dim: 0.6 } }]);
    graph.scene.tags.setRoot(focus, true);
    const style = graph.scene.styleFor(Block, new Map([[selectedTag, true]]));
    expect(style.parts?.border?.color).toBe(graph.$graphColors.value.block.selectedBorder);
    expect(style.dim).toBe(0.6);
    expect(graph.scene.styleFor(Block, new Map([[highlighted, true]])).dim).toBeUndefined();
  });

  it("an opacity rule on a tag re-encodes the bound element and fades its paints on Canvas2D", () => {
    graph = new Graph({});
    const ghost = defineTag("ghost");
    graph.scene.styles.add([{ target: Styled, tags: [ghost], style: { opacity: 0.4 } }]);
    graph.scene.store.add({
      id: "e",
      zIndex: 200,
      x: 0,
      y: 0,
      bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      primitives: [{ kind: "rect", x: 0, y: 0, width: 4, height: 4, fill: "#ff0000", part: "border" }],
    });
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    const fields: string[][] = [];
    graph.scene.store.subscribe((change) => fields.push([...(change.fields ?? [])]));
    graph.scene.tags.set(ghost, { block: ["e"] });
    const element = graph.scene.store.get("e");
    expect(element && graph.scene.store.getStyles()[element.styleId].opacity).toBe(0.4);
    expect(fields.some((changed) => changed.includes("primitives"))).toBe(true);
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const fills: unknown[] = [];
    const fill = jest.spyOn(ctx, "fillRect").mockImplementation(() => fills.push(ctx.fillStyle));
    drawElements(ctx, element ? [element] : [], 1, { styles: graph.scene.store.getStyles() });
    expect(fills).toEqual(["rgba(255, 0, 0, 0.4)"]);
    fill.mockRestore();
  });

  it("unmount releases style bindings before it clears the built-in tags", () => {
    graph = new Graph({});
    graph.setEntities({ blocks: [{ is: "Block", id: "e", name: "E", x: 0, y: 0, width: 1, height: 1, anchors: [] }] });
    graph.selectionService.select("block", ["e"], ESelectionStrategy.REPLACE);
    addElement("e");
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Styled);
    expect(graph.scene.tags.$of("block", "e").value.has(selectedTag)).toBe(true);
    const acquire = jest.spyOn(StyleResolver.prototype, "acquire");
    try {
      graph.unmount();
      expect(acquire).not.toHaveBeenCalled();
    } finally {
      acquire.mockRestore();
    }
  });

  it("applies configured component styles before mounting and inherits selection while overriding hover", () => {
    class Pipeline extends Block {
      public static override getSceneStyles(): TSceneStyles<typeof Pipeline> {
        return [
          { tags: [hoveredTag], style: { parts: { border: { width: 2 } } } },
          { tags: [selectedTag], style: { parts: { border: { color: "#2563eb" } } } },
        ];
      }
    }
    class Report extends Pipeline {
      public static override getSceneStyles(): TSceneStyles<typeof Report> {
        return [{ tags: [hoveredTag], style: { parts: { border: { width: 4 } } } }];
      }
    }
    class ReportConnection extends BlockConnection {
      public static override getSceneStyles(): TSceneStyles<typeof ReportConnection> {
        return [{ tags: [hoveredTag], style: { parts: { line: { width: 3 } } } }];
      }
    }
    graph = new Graph(
      {
        blocks: [{ is: "report", id: "r", name: "Report", x: 0, y: 0, width: 100, height: 50 }],
        settings: { blockComponents: { report: Report }, connection: ReportConnection },
      },
      document.createElement("div")
    );
    const tags = new Map([
      [hoveredTag, true],
      [selectedTag, true],
    ] as const);
    expect(graph.scene.styleFor(Report, tags)).toMatchObject({
      parts: { border: { color: "#2563eb", width: 4 } },
    });
    expect(graph.scene.styleFor(Pipeline, tags).parts?.border?.width).toBe(2);
    expect(graph.scene.styleFor(ReportConnection, tags).parts?.line?.width).toBe(3);

    graph.start();
    graph.cameraService.set({ scale: 0.5 });
    graph.selectionService.select("block", ["r"], ESelectionStrategy.REPLACE);
    graph.scene.tags.add(hoveredTag, { block: ["r"] });
    graph.scheduler.performUpdate();
    expect(graph.scene.explain("block", "r").style).toMatchObject({
      parts: { border: { color: "#2563eb", width: 4 } },
    });

    const remove = graph.scene.styles.add([
      { target: Report, tags: [hoveredTag], style: { parts: { border: { width: 6 } } } },
    ]);
    expect(graph.scene.styleFor(Report, tags).parts?.border?.width).toBe(6);
    remove();
    expect(graph.scene.styleFor(Report, tags).parts?.border?.width).toBe(4);
  });

  it("keeps a scoped class rule while an element of a replaced configured class is still bound", () => {
    class Scoped extends Block {
      public static override getSceneStyles(): TSceneStyles<typeof Scoped> {
        return [{ scope: { minScale: 0.4 }, style: { parts: { title: { color: "#225588" } } } }];
      }
    }
    graph = new Graph({});
    graph.cameraService.set({ scale: 0.3 });
    graph.updateSettings({ blockComponents: { scoped: Scoped } });
    expect(graph.scene.styles.$thresholds.value).toContain(0.4);
    addElement("e");
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Scoped);
    graph.resetSettings(["blockComponents"]);
    graph.cameraService.set({ scale: 0.5 });
    expect(graph.scene.explain("block", "e").style?.base?.title?.color).toBe("#225588");

    unbind();
    expect(graph.scene.styles.$thresholds.value).not.toContain(0.4);
    const unbindDiscovered = graph.scene.bindStyle("e", { type: "block", id: "e" }, Scoped);
    expect(graph.scene.explain("block", "e").style?.base?.title?.color).toBe("#225588");
    unbindDiscovered();
  });

  it("styleFor and $styleGeneration follow the stylesheet", () => {
    graph = new Graph({});
    const generation = graph.scene.$styleGeneration.value;
    graph.scene.styles.add([{ target: Styled, tags: [running], style: { parts: { border: { color: "#2e7d32" } } } }]);
    expect(graph.scene.$styleGeneration.value).toBe(generation + 1);
    expect(graph.scene.styleFor(Styled, new Map([[running, true]])).parts).toEqual({
      border: { color: "#2e7d32" },
    });
  });

  it("leaves a bound style asleep across equivalent levels and follows rules that distinguish them", () => {
    graph = new Graph({});
    graph.cameraService.set({ scale: 0.8 });
    graph.scene.styles.add([{ target: Styled, scope: { levels: ["detailed", "schematic"] }, style: { raise: 1 } }]);
    addElement("link");
    const changed = jest.fn();
    const unbind = graph.scene.bindStyle("link", { type: "connection", id: "link" }, Styled, changed);
    const read = jest.spyOn(graph.scene.store, "get");
    const generation = graph.scene.$styleGeneration.peek();
    graph.cameraService.set({ scale: 0.69 });
    expect(graph.scene.$styleGeneration.peek()).toBe(generation + 1);
    expect(read).not.toHaveBeenCalledWith("link");
    expect(changed).toHaveBeenCalledTimes(1);

    const remove = graph.scene.styles.add([{ target: Styled, scope: { levels: ["schematic"] }, style: { raise: 2 } }]);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ raise: 2 }));
    graph.cameraService.set({ scale: 0.8 });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ raise: 1 }));
    remove();
    read.mockClear();
    graph.cameraService.set({ scale: 0.69 });
    expect(read).not.toHaveBeenCalledWith("link");
    read.mockRestore();
    unbind();
  });

  it("bindStyle after dispose does nothing", () => {
    graph = new Graph({});
    addElement("e");
    graph.scene.dispose();
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Block);
    expect(graph.scene.store.get("e")?.styleId).toBe(0);
    expect(() => unbind()).not.toThrow();
  });

  it("bindStyle leaves an element alone when it already has the row", () => {
    graph = new Graph({});
    addElement("e");
    const setStyle = jest.spyOn(graph.scene.store, "setStyle");
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Block);
    const calls = setStyle.mock.calls.length;
    graph.scene.bindStyle("e", { type: "block", id: "e" }, Block);
    expect(setStyle.mock.calls.length).toBe(calls);
  });

  it("bindStyle records no binding when its first run throws", () => {
    graph = new Graph({});
    addElement("e");
    const bad = defineTag("bad");
    graph.scene.styles.add([
      {
        target: Block,
        tags: [bad],
        style: () => {
          throw new Error("boom");
        },
      },
    ]);
    graph.scene.tags.add(bad, { block: ["e"] });
    expect(() => graph.scene.bindStyle("e", { type: "block", id: "e" }, Block)).toThrow("boom");
    expect(graph.scene.explain("block", "e").target).toBeUndefined();
  });

  it("toImage draws the scene through the interpreter at the camera's view", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.layers.rootSize.value = { width: 200, height: 100, dpr: 2 };
    graph.cameraService.set({ width: 200, height: 100, x: 10.375, y: -20.375, scale: 1 });
    graph.scene.store.add({
      id: "e",
      zIndex: 200,
      x: 10,
      y: 10,
      bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
      primitives: [{ kind: "rect", x: 0, y: 0, width: 20, height: 20, fill: "#ff0000" }],
    });
    const image = graph.scene.toImage({ pixelRatio: 3, background: "#ffffff" });
    expect([image.width, image.height]).toEqual([600, 300]);
    const ctx = image.getContext("2d") as CanvasRenderingContext2D & { __getDrawCalls(): { type: string }[] };
    expect(ctx.getTransform()).toMatchObject({ e: 31.5, f: -61.5 });
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fill" || call.type === "fillRect")).toHaveLength(2);
    const crop = graph.scene.toImage({ rect: { x: -10.375, y: 20.375, width: 200, height: 100 }, pixelRatio: 3 });
    expect(crop.getContext("2d")?.getTransform()).toMatchObject({ e: 31.125, f: -61.125 });
  });

  it("toImage of the current view draws the visible layer canvases under the scene first", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.scheduler.performUpdate();
    graph.cameraService.set({ width: 200, height: 100, x: 0, y: 0, scale: 1 });
    // jsdom gives the root no size: give every layer canvas pixels, so it can be drawn.
    for (const layer of graph.layers.getLayers()) {
      const canvas = layer.getCanvas();
      if (canvas) {
        canvas.width = 20;
        canvas.height = 10;
      }
    }
    type TCall = { type: string; props: { img?: unknown } };
    const images = (canvas: HTMLCanvasElement): unknown[] =>
      (canvas.getContext("2d") as unknown as { __getDrawCalls(): TCall[] })
        .__getDrawCalls()
        .filter((call) => call.type === "drawImage")
        .map((call) => call.props.img);
    const composed = images(graph.scene.toImage({ pixelRatio: 1 }));
    expect(composed).toContain(graph.getGraphCanvas());
    expect(composed).not.toContain(graph.scene.layer.getCanvas());
    expect(composed.length).toBeGreaterThanOrEqual(2);
    expect(images(graph.scene.toImage({ rect: { x: 0, y: 0, width: 10, height: 10 }, pixelRatio: 1 }))).toEqual([]);
  });

  it("toImage draws in the WebGL states too, and getGraphCanvas stays the GraphLayer canvas", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      graph = new Graph({}, document.createElement("div"));
      graph.start();
      graph.updateSettings({ renderer: "webgl", webglBackend: () => Promise.reject(new Error("no gpu")) });
      await Promise.resolve();
      expect(graph.getGraphCanvas()).toBe(graph.getGraphLayer().getCanvas());
      expect(graph.getGraphCanvas()).not.toBe(graph.scene.layer.getCanvas());
      expect(() => graph.scene.toImage({ rect: { x: 0, y: 0, width: 10, height: 10 }, scale: 1 })).not.toThrow();
      // The rejected backend falls back to Canvas2D asynchronously, with its warning: wait for it before the spy goes.
      for (let i = 0; i < 20 && graph.scene.$renderer.value !== "webgl-fallback"; i++) await Promise.resolve();
      expect(graph.scene.$renderer.value).toBe("webgl-fallback");
      expect(warn).toHaveBeenCalledWith("WebGL scene backend is unavailable, drawing with Canvas2D", expect.any(Error));
      expect(() => graph.scene.toImage({ rect: { x: 0, y: 0, width: 10, height: 10 }, scale: 1 })).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it("toImage refuses an output past the canvas size limits", () => {
    graph = new Graph({}, document.createElement("div"));
    expect(() =>
      graph.scene.toImage({ rect: { x: 0, y: 0, width: 100000, height: 100 }, scale: 1, pixelRatio: 1 })
    ).toThrow(/100000 x 100 pixels/);
  });

  it("toImage refuses an output past the total area limit", () => {
    graph = new Graph({}, document.createElement("div"));
    expect(() =>
      graph.scene.toImage({ rect: { x: 0, y: 0, width: 10000, height: 10000 }, scale: 1, pixelRatio: 1 })
    ).toThrow(/10000 x 10000 pixels/);
  });

  it("toImage rejects a scale or pixelRatio that is not a positive finite number", () => {
    graph = new Graph({}, document.createElement("div"));
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    const { scene } = graph;
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(() => scene.toImage({ rect, scale: bad, pixelRatio: 1 })).toThrow(/scale/);
      expect(() => scene.toImage({ rect, scale: 1, pixelRatio: bad })).toThrow(/pixelRatio/);
    }
  });
});
