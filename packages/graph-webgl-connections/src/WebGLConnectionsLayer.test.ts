import { Graph } from "@gravity-ui/graph";
import type { LayerProps, TBlock } from "@gravity-ui/graph";

import { WebGLConnectionsLayer, defaultWebGLConnectionStyle } from "./WebGLConnectionsLayer";

const createBlock = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 50,
  selected: false,
  anchors: [],
});

describe("WebGLConnectionsLayer", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph(
      {
        blocks: [createBlock("a", 0), createBlock("b", 300)],
        connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }],
      },
      document.createElement("div")
    );
    // layers are attached (and afterInit runs) once the graph is started
    graph.start();
  });

  afterEach(() => {
    graph.stop();
    graph.unmount();
  });

  it("keeps canvas connections when WebGL2 is unavailable", () => {
    // jsdom has no WebGL2 context
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const layer = graph.addLayer(WebGLConnectionsLayer, {});

    expect(layer.isActive()).toBe(false);
    expect(graph.rootStore.settings.getConfigFlag("useCanvasConnections")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("styles connections like canvas connections by default", () => {
    const colors = graph.$graphColors.value.connection;
    const connection = { sourceBlockId: "a", targetBlockId: "b" };

    expect(defaultWebGLConnectionStyle(connection, { selected: false, hovered: false }, graph)).toEqual({
      color: colors.background,
      width: 2,
      dash: undefined,
      arrow: true,
    });
    expect(
      defaultWebGLConnectionStyle({ ...connection, dashed: true }, { selected: true, hovered: false }, graph)
    ).toEqual({ color: colors.selectedBackground, width: 4, dash: [6, 4], arrow: true });
  });
});

/** A WebGL2 stand-in: constants are numbers, every method returns a truthy dummy. */
function createFakeWebGL2(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const fake = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "canvas") return canvas;
        if (property === "isContextLost") return () => false;
        if (typeof property === "string" && /^[A-Z0-9_]+$/.test(property)) return 0;
        return () => ({});
      },
    }
  );
  return fake as unknown as WebGL2RenderingContext;
}

/** jsdom has no WebGL: give this layer's canvas a fake WebGL2 context. */
class TestWebGLConnectionsLayer extends WebGLConnectionsLayer {
  protected createCanvas(params: NonNullable<LayerProps["canvas"]>): HTMLCanvasElement {
    const canvas = super.createCanvas(params);
    const gl = createFakeWebGL2(canvas);
    canvas.getContext = ((type: string) => (type === "webgl2" ? gl : null)) as HTMLCanvasElement["getContext"];
    return canvas;
  }
}

describe("WebGLConnectionsLayer with a WebGL2 context", () => {
  let graph: Graph;

  function tick(frames = 5): void {
    for (let i = 0; i < frames; i++) graph.scheduler.performUpdate();
  }

  beforeEach(() => {
    graph = new Graph(
      {
        blocks: [createBlock("a", 0), createBlock("b", 300)],
        connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }],
      },
      document.createElement("div")
    );
    graph.start();
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    tick();
  });

  afterEach(() => {
    graph.stop();
    graph.unmount();
  });

  it("replaces canvas connections while attached and restores them when removed", () => {
    const layer = graph.addLayer(TestWebGLConnectionsLayer, {});
    tick();

    expect(layer.isActive()).toBe(true);
    expect(graph.rootStore.settings.getConfigFlag("useCanvasConnections")).toBe(false);
    expect(graph.connections.getConnectionState("c1")?.getViewComponent()).toBeUndefined();

    graph.removeLayer(layer);
    tick();

    expect(graph.rootStore.settings.getConfigFlag("useCanvasConnections")).toBe(true);
    expect(graph.connections.getConnectionState("c1")?.getViewComponent()).toBeDefined();
  });

  it("picks the connection under a point and follows block moves", () => {
    const layer = graph.addLayer(TestWebGLConnectionsLayer, {});
    tick();

    // the connection runs from the right port of "a" (100, 25) to the left port of "b" (300, 25)
    expect(layer.pick({ x: 200, y: 26 })).toBe("c1");
    expect(layer.pick({ x: 200, y: 60 })).toBeUndefined();

    graph.rootStore.blocksList.getBlockState("b")?.updateXY(300, 200);
    tick();

    expect(layer.pick({ x: 200, y: 26 })).toBeUndefined();
    expect(layer.pick({ x: 299, y: 225 })).toBe("c1");
  });

  it("hit-tests only the stubs, unless the connection is focused", () => {
    const layer = graph.addLayer(TestWebGLConnectionsLayer, { lod: { stubsBelowScale: 2, stubLengthPx: 14 } });
    tick();

    expect(layer.pick({ x: 105, y: 25 })).toBe("c1");
    expect(layer.pick({ x: 200, y: 25 })).toBeUndefined();

    graph.api.selectConnections(["c1"], true);
    tick();

    expect(layer.pick({ x: 200, y: 25 })).toBe("c1");
  });
});
