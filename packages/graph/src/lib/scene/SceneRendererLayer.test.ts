import { Graph } from "../../graph";

import { SceneRendererLayer } from "./SceneRendererLayer";
import type { TSceneRenderer } from "./SceneRendererLayer";
import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";
import type { TSceneChange, TSceneStyle } from "./types";
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
  styles: (readonly TSceneStyle[])[];
  frames: TSceneFrame[];
  draws: number;
  created: number;
  disposed: number;
  animated: boolean;
  throwIn?: "apply" | "draw" | "setStyles";
  backend?: ISceneBackend;
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

  function setup(options: { renderer: TSceneRenderer; fail?: boolean }) {
    const store = new SceneStore(100);
    graph.attach(document.createElement("div"));
    graph.start();
    const fake = {
      replayed: [],
      applied: [],
      styles: [],
      frames: [],
      draws: 0,
      created: 0,
      disposed: 0,
      animated: false,
    } as unknown as TFake;
    const module: ISceneBackendModule = {
      createSceneBackend: async (_sibling, events) => {
        fake.created++;
        fake.events = events;
        const backend = {
          canvas: document.createElement("canvas"),
          stats: {},
          replay: (s: SceneStore) => s.forEach((el) => fake.replayed.push(el.id)),
          apply: (change: TSceneChange) => {
            if (fake.throwIn === "apply") throw new Error("capacity");
            fake.applied.push(change);
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
            fake.disposed++;
          },
        } as unknown as ISceneBackend;
        fake.backend = backend;
        return backend;
      },
    };
    const loadBackend = options.fail ? () => Promise.reject(new Error("no webgl")) : () => Promise.resolve(module);
    const layer = graph.addLayer(SceneRendererLayer, { store, renderer: options.renderer, loadBackend });
    const frame = (): void => {
      graph.scheduler.performUpdate();
    };
    return { layer, store, fake, frame };
  }

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

  it("forwards store changes to the backend in webgl", async () => {
    const { store, fake } = setup({ renderer: "webgl" });
    await flushPromises();
    store.add(element("b", 200));
    store.update("b", { x: 3 });
    expect(fake.applied.map((c) => c.type)).toEqual(["add", "update"]);
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
    const styleId = store.defineStyle({ id: "s" } as unknown as TSceneStyle);
    store.setStyle("b", styleId);
    frame();
    expect(fake.draws).toBe(3);
    expect(fake.styles).toHaveLength(2);
    expect(fake.styles[1]).toBe(store.getStyles());
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

  it("builds the frame from the camera and the graph clock", async () => {
    const { fake, frame } = setup({ renderer: "webgl" });
    await flushPromises();
    graph.cameraService.set({ x: 10, y: 20, width: 800, height: 600, scale: 0.5 });
    frame();
    const last = fake.frames[fake.frames.length - 1];
    expect(last).toMatchObject({ x: 10, y: 20, width: 800, height: 600, scale: 0.5 });
    expect(last.time).toBeGreaterThanOrEqual(0);
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
});
