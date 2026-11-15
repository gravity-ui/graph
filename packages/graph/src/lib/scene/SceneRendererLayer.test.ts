import { Graph } from "../../graph";

import { SceneRendererLayer } from "./SceneRendererLayer";
import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";
import type { TSceneChange, TSceneRenderer, TSceneStyle } from "./types";
import type { ISceneBackend, ISceneBackendModule, TSceneBackendEvents, TSceneFrame } from "./webgl/backendTypes";

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

type TFake = {
  events: TSceneBackendEvents;
  replayed: string[];
  applied: TSceneChange[];
  applyCalls: number;
  styles: (readonly TSceneStyle[])[];
  frames: TSceneFrame[];
  draws: number;
  created: number;
  disposed: number;
  animated: boolean;
  throwIn?: "apply" | "draw" | "setStyles";
  backend?: ISceneBackend;
  /** When set, creation waits for it, so a test can act on the events of an in-flight creation. */
  gate?: Promise<void>;
};

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function element(id: string, zIndex: number): TSceneElementInput {
  return {
    id,
    zIndex,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [{ kind: "rect", x: 0, y: 0, width: 5, height: 5, fill: "#000" }],
  };
}

describe("SceneRendererLayer", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => graph.unmount());

  function setup(options: {
    renderer: TSceneRenderer;
    fail?: boolean;
    clock?: { now(): number };
    gate?: Promise<void>;
  }) {
    const store = new SceneStore(100);
    graph.attach(document.createElement("div"));
    graph.start();
    const fake = {
      replayed: [],
      applied: [],
      applyCalls: 0,
      styles: [],
      frames: [],
      draws: 0,
      created: 0,
      disposed: 0,
      animated: false,
      gate: options.gate,
    } as unknown as TFake;
    const module: ISceneBackendModule = {
      createSceneBackend: async (_sibling, events) => {
        fake.created++;
        let gone = false;
        // Like the real backend: after dispose() its listeners are aborted, so no event can be delivered.
        fake.events = {
          onLost: () => {
            if (!gone) events.onLost();
          },
          onRestored: () => {
            if (!gone) events.onRestored();
          },
        };
        if (fake.gate) await fake.gate;
        const backend = {
          canvas: document.createElement("canvas"),
          stats: {},
          replay: (s: SceneStore) => s.forEach((el) => fake.replayed.push(el.id)),
          applyMany: (changes: readonly TSceneChange[]) => {
            if (fake.throwIn === "apply") throw new Error("capacity");
            fake.applyCalls++;
            fake.applied.push(...changes);
          },
          setStyles: (styles: readonly TSceneStyle[]) => {
            if (fake.throwIn === "setStyles") throw new Error("styles");
            fake.styles.push(styles);
          },
          draw: (frame: TSceneFrame) => {
            if (fake.throwIn === "draw") throw new Error("gl error");
            fake.draws++;
            fake.frames.push(frame);
            return fake.animated;
          },
          dispose: () => {
            gone = true;
            fake.disposed++;
          },
        } as unknown as ISceneBackend;
        fake.backend = backend;
        return backend;
      },
    };
    const loadBackend = options.fail ? () => Promise.reject(new Error("no webgl")) : () => Promise.resolve(module);
    const layer = graph.addLayer(SceneRendererLayer, {
      store,
      renderer: options.renderer,
      loadBackend,
      clock: options.clock,
    });
    const frame = (): void => {
      graph.scheduler.performUpdate();
    };
    return { layer, store, fake, frame };
  }

  it("creates a canvas that lets pointer events and selection through to the layers below", () => {
    const { layer } = setup({ renderer: "canvas" });
    const canvas = layer.getCanvas();
    expect(canvas?.classList.contains("no-pointer-events")).toBe(true);
    expect(canvas?.classList.contains("no-user-select")).toBe(true);
  });

  it("goes canvas → loading → webgl and replays the store", async () => {
    const { layer, store, fake } = setup({ renderer: "canvas" });
    store.add(element("a", 200));
    layer.setRenderer("webgl");
    expect(layer.$state.value).toBe("loading");
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    expect(fake.replayed).toEqual(["a"]);
    expect(layer.getBackend()).toBe(fake.backend);
  });

  it("falls back when the backend fails to load", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { layer } = setup({ renderer: "webgl", fail: true });
    await flushPromises();
    expect(layer.$state.value).toBe("webgl-fallback");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("draws with the interpreter while lost and replays on restore", async () => {
    const { layer, fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    const before = fake.draws;
    fake.events.onLost();
    expect(layer.$state.value).toBe("lost");
    frame();
    expect(fake.draws).toBe(before);
    const lost = fake.backend;
    fake.events.onRestored();
    expect(layer.$state.value).toBe("restoring");
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    expect(fake.created).toBe(2);
    expect(fake.disposed).toBe(1);
    expect(layer.getBackend()).not.toBe(lost);
  });

  it("keeps asking the scheduler for frames while the backend animates", async () => {
    const { fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    fake.animated = true;
    frame();
    const animating = fake.draws;
    frame();
    expect(fake.draws).toBe(animating + 1);
    fake.animated = false;
    frame();
    const settled = fake.draws;
    frame();
    expect(fake.draws).toBe(settled);
  });

  it("forwards store changes to the backend once per frame, one change per element", async () => {
    const { store, fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    store.add(element("b", 200));
    store.update("b", { x: 3 });
    expect(fake.applied).toEqual([]);
    frame();
    expect(fake.applied.map((change) => change.type)).toEqual(["add"]);
    store.update("b", { x: 4 });
    store.update("b", { hidden: true });
    frame();
    expect(fake.applied.slice(1).map((change) => [change.type, [...(change.fields ?? [])].sort()])).toEqual([
      ["update", ["hidden", "x"]],
    ]);
    expect(fake.applyCalls).toBe(2);
  });

  it("drops the changes queued before a context loss: the restored backend replays the store", async () => {
    const { layer, store, fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    store.add(element("a", 200));
    fake.events.onLost();
    frame();
    fake.events.onRestored();
    fake.replayed.length = 0;
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    expect(fake.replayed).toEqual(["a"]);
    frame();
    expect(fake.applied).toEqual([]);
    expect(fake.applyCalls).toBe(0);
  });

  it("passes styles to the backend only when they change", async () => {
    const { store, fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    store.add(element("a", 200));
    frame();
    expect(fake.styles).toHaveLength(1);
    store.add(element("b", 200));
    frame();
    expect(fake.draws).toBe(2);
    expect(fake.styles).toHaveLength(1);
    const styleId = store.defineStyle({ raise: 0 });
    store.setStyle("b", styleId);
    frame();
    expect(fake.draws).toBe(3);
    expect(fake.styles).toHaveLength(2);
    expect(fake.styles[1]).toBe(store.getStyles());
  });

  it("redraws and uploads the styles after a change of table properties only", async () => {
    const { store, fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    store.add(element("a", 200));
    const row = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    store.setStyle("a", row);
    frame();
    const draws = fake.draws;
    const applied = fake.applied.length;
    store.replaceStyles(new Map([[row, { parts: { body: { color: "#0000ff" } } }]]));
    frame();
    expect(fake.applied).toHaveLength(applied);
    expect(fake.draws).toBe(draws + 1);
    expect(fake.styles.at(-1)).toBe(store.getStyles());
  });

  it("schedules a Canvas2D frame after a change of table properties only", () => {
    const { layer, store, frame } = setup({ renderer: "canvas" });
    store.add(element("a", 200));
    const row = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    store.setStyle("a", row);
    frame();
    const scheduled = jest.spyOn(layer, "performRender");
    store.replaceStyles(new Map([[row, { parts: { body: { visible: false } } }]]));
    expect(scheduled).toHaveBeenCalled();
    scheduled.mockRestore();
  });

  it.each(["apply", "draw", "setStyles"] as const)(
    "falls back, disposes once and warns once when the backend throws in %s",
    async (where) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { layer, store, fake, frame } = setup({ renderer: "webgl" });
      await flushPromises();
      expect(layer.$state.value).toBe("webgl");
      fake.throwIn = where;
      expect(() => {
        store.add(element("a", 200));
        frame();
        frame();
      }).not.toThrow();
      expect(layer.$state.value).toBe("webgl-fallback");
      expect(fake.disposed).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(layer.getBackend()).toBeUndefined();
      expect(() => {
        store.add(element("b", 200));
        frame();
      }).not.toThrow();
      expect(fake.disposed).toBe(1);
      warn.mockRestore();
    }
  );

  it("builds the frame from the camera, the graph clock and the store's dim colour", async () => {
    const { fake, frame, store } = setup({ renderer: "webgl" });
    await flushPromises();
    graph.cameraService.set({ x: 10, y: 20, width: 800, height: 600, scale: 0.5 });
    frame();
    const last = fake.frames[fake.frames.length - 1];
    expect(last).toMatchObject({ x: 10, y: 20, width: 800, height: 600, scale: 0.5, dimColor: store.getDimColor() });
    expect(last.time).toBeGreaterThanOrEqual(0);
    // A new dim colour draws a frame with it.
    const draws = fake.draws;
    store.setDimColor("#123456");
    frame();
    expect(fake.draws).toBe(draws + 1);
    expect(fake.frames[fake.frames.length - 1].dimColor).toBe("#123456");
  });

  it("disposes the backend on setRenderer(canvas) and ignores a late load", async () => {
    const { layer, fake } = setup({ renderer: "canvas" });
    layer.setRenderer("webgl");
    layer.setRenderer("canvas");
    expect(layer.$state.value).toBe("canvas");
    await flushPromises();
    expect(layer.$state.value).toBe("canvas");
    expect(fake.created).toBe(1);
    expect(fake.disposed).toBe(1);
    expect(layer.getBackend()).toBeUndefined();

    layer.setRenderer("webgl");
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    layer.setRenderer("canvas");
    expect(fake.disposed).toBe(2);
    expect(layer.$state.value).toBe("canvas");
  });

  it("disposes the backend on unmount", async () => {
    const { fake } = setup({ renderer: "webgl" });
    await flushPromises();
    graph.unmount();
    expect(fake.disposed).toBe(1);
  });

  it("disposes the backend on detach and creates a new one on re-attach", async () => {
    const { layer, store, fake } = setup({ renderer: "webgl" });
    store.add(element("a", 200));
    await flushPromises();
    const first = fake.backend;
    layer.detachLayer();
    expect(fake.disposed).toBe(1);
    expect(layer.getBackend()).toBeUndefined();
    store.add(element("b", 200));
    fake.replayed.length = 0;
    layer.attachLayer(document.createElement("div"));
    expect(layer.$state.value).toBe("loading");
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    expect(fake.created).toBe(2);
    expect(fake.disposed).toBe(1);
    expect(layer.getBackend()).not.toBe(first);
    expect(fake.replayed.sort()).toEqual(["a", "b"]);
  });

  it("uses the given clock for frame.time", async () => {
    const { fake, frame } = setup({ renderer: "webgl", clock: { now: () => 7 } });
    await flushPromises();
    frame();
    expect(fake.frames[fake.frames.length - 1].time).toBe(7);
  });

  it("goes to lost when the context is lost during load, and restores on onRestored", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { layer, store, fake } = setup({ renderer: "webgl", gate });
    store.add(element("a", 200));
    await flushPromises();
    expect(layer.$state.value).toBe("loading");
    const lostEvents = fake.events;
    lostEvents.onLost();
    fake.gate = undefined;
    release();
    await flushPromises();
    expect(layer.$state.value).toBe("lost");
    expect(fake.disposed).toBe(0);
    expect(fake.replayed).toEqual([]);
    fake.replayed.length = 0;
    lostEvents.onRestored();
    expect(layer.$state.value).toBe("restoring");
    await flushPromises();
    expect(layer.$state.value).toBe("webgl");
    expect(fake.created).toBe(2);
    expect(fake.disposed).toBe(1);
    expect(fake.replayed).toEqual(["a"]);
  });

  it("disposes a backend set aside as lost when the layer unmounts", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { layer, fake } = setup({ renderer: "webgl", gate });
    await flushPromises();
    fake.events.onLost();
    release();
    await flushPromises();
    expect(layer.$state.value).toBe("lost");
    graph.unmount();
    expect(fake.disposed).toBe(1);
  });

  describe("late fonts", () => {
    const original = Object.getOwnPropertyDescriptor(document, "fonts");

    afterEach(() => {
      if (original) Object.defineProperty(document, "fonts", original);
      else delete (document as unknown as { fonts?: unknown }).fonts;
    });

    it("recreates the backend on loadingdone while in webgl", async () => {
      const fonts = new EventTarget();
      Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
      const { layer, store, fake } = setup({ renderer: "webgl" });
      store.add(element("a", 200));
      await flushPromises();
      expect(fake.created).toBe(1);
      fake.replayed.length = 0;
      const first = fake.backend;
      fonts.dispatchEvent(new Event("loadingdone"));
      expect(layer.$state.value).toBe("restoring");
      await flushPromises();
      expect(layer.$state.value).toBe("webgl");
      expect(fake.created).toBe(2);
      expect(fake.disposed).toBe(1);
      expect(fake.replayed).toEqual(["a"]);
      expect(layer.getBackend()).not.toBe(first);
    });

    it("drops the changes queued before a font reload: the new backend replays the store", async () => {
      const fonts = new EventTarget();
      Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
      const { layer, store, fake, frame } = setup({ renderer: "webgl" });
      await flushPromises();
      store.add(element("a", 200));
      store.update("a", { x: 3 });
      fonts.dispatchEvent(new Event("loadingdone"));
      fake.replayed.length = 0;
      await flushPromises();
      expect(layer.$state.value).toBe("webgl");
      expect(fake.replayed).toEqual(["a"]);
      frame();
      expect(fake.applied).toEqual([]);
      expect(fake.applyCalls).toBe(0);
    });

    it("removes the fonts listener on unmount", async () => {
      const fonts = new EventTarget();
      Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
      const addSpy = jest.spyOn(fonts, "addEventListener");
      const { fake } = setup({ renderer: "webgl" });
      await flushPromises();
      const signals = (): (AbortSignal | undefined)[] =>
        addSpy.mock.calls.map((call) => (call[2] as AddEventListenerOptions | undefined)?.signal);
      expect(signals().length).toBeGreaterThan(0);
      for (const signal of signals()) {
        expect(signal).toBeDefined();
        expect(signal?.aborted).toBe(false);
      }
      graph.unmount();
      for (const signal of signals()) expect(signal?.aborted).toBe(true);
      fonts.dispatchEvent(new Event("loadingdone"));
      await flushPromises();
      expect(fake.created).toBe(1);
    });

    it("redraws with the interpreter on loadingdone outside webgl, creating no backend", async () => {
      const fonts = new EventTarget();
      Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
      const { layer, store, fake, frame } = setup({ renderer: "canvas" });
      store.add({
        ...element("a", 200),
        primitives: [
          { kind: "text", text: "a", family: "f", size: 10, lineHeight: 12, color: "#000", x: 0, y: 0, width: 50 },
        ],
      });
      const ctx = layer.getCanvas()?.getContext("2d");
      if (!ctx) throw new Error("the layer has no 2D context");
      const drawn = jest.spyOn(ctx, "fillText");
      for (let i = 0; i < 4; i++) frame();
      expect(drawn).toHaveBeenCalled();
      drawn.mockClear();
      frame();
      // Nothing changed: the scheduler skips the layer.
      expect(drawn).not.toHaveBeenCalled();
      fonts.dispatchEvent(new Event("loadingdone"));
      frame();
      // The interpreter draws again: the text is wrapped with the loaded fonts (the scene cleared the wrap cache).
      expect(drawn).toHaveBeenCalledWith("a", 0, expect.any(Number));
      await flushPromises();
      expect(fake.created).toBe(0);
      expect(layer.$state.value).toBe("canvas");
    });
  });
});
