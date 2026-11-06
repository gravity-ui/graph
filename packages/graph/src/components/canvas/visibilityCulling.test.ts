import { Graph } from "../../graph";
import { globalScheduler } from "../../lib/Scheduler";
import { TBlockId } from "../../store/block/Block";

import { Anchor } from "./anchors";
import { Block, TBlock } from "./blocks/Block";
import { BlockConnection } from "./connections/BlockConnection";

const block = (id: string, x: number, y: number): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y,
  width: 100,
  height: 100,
  anchors: [],
});

function frames(count = 1): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("Visibility culling of graph components", () => {
  let graph: Graph;

  const view = (id: TBlockId): Block => {
    const component = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!component) throw new Error(`no view for ${String(id)}`);
    return component;
  };

  /** Camera showing the world rect [x, x + 1000] x [y, y + 800] at scale 1. */
  const lookAt = (x: number, y: number): void => {
    graph.cameraService.set({ x: -x, y: -y, scale: 1 });
  };

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.setEntities({
      blocks: [block("near", 100, 100), block("far", 50_000, 50_000)],
      connections: [{ id: "near-far", sourceBlockId: "near", targetBlockId: "far" }],
    });
    graph.start();
    frames(2);
    // The jsdom root has no size; give the camera a 1000x800 viewport after the layers attached.
    graph.cameraService.resize({ width: 1000, height: 800 });
    lookAt(0, 0);
    frames(3);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    graph.unmount();
  });

  it("walks only components near the viewport", () => {
    const near = jest.spyOn(view("near"), "iterate");
    const far = jest.spyOn(view("far"), "iterate");
    graph.getGraphLayer().performRender();
    frames(3);

    expect(near.mock.calls.length).toBeGreaterThan(0);
    expect(far).not.toHaveBeenCalled();
    expect(view("near").isRendered()).toBe(true);
    expect(view("far").isRendered()).toBe(false);
  });

  it("walks every component when the setting is off", () => {
    graph.updateSettings({ EXP_VISIBILITY_CULLING: false });
    const far = jest.spyOn(view("far"), "iterate");
    graph.getGraphLayer().performRender();
    frames(2);

    expect(far).toHaveBeenCalled();
  });

  it("renders a component once the camera reaches it and stops when it leaves", () => {
    lookAt(49_800, 49_800);
    frames(2);
    expect(view("far").isRendered()).toBe(true);
    expect(view("near").isRendered()).toBe(false);

    lookAt(0, 0);
    frames(2);
    expect(view("far").isRendered()).toBe(false);
    expect(view("near").isRendered()).toBe(true);
  });

  it("processes state changes of components out of view", () => {
    graph.api.selectBlocks(["far"], true);
    frames(2);

    expect(view("far").state.selected).toBe(true);
    // Raising the selected block moved it to the end of the draw order.
    expect(view("far").renderOrder).toBe(1);
    expect(view("near").renderOrder).toBe(0);
  });

  it("keeps out-of-view components hittable", () => {
    expect(graph.getElementOverPoint({ x: 50_050, y: 50_050 })).toBe(view("far"));
    expect(graph.getElementsOverRect({ x: 49_000, y: 49_000, width: 2000, height: 2000 }, [Block])).toEqual([
      view("far"),
    ]);
  });

  it("keeps a visible connection attached to a block out of view", () => {
    const connection = graph.rootStore.connectionsList.getConnectionState("near-far")?.getViewComponent();
    expect(connection).toBeInstanceOf(BlockConnection);

    graph.api.updateBlock({ id: "far", x: 60_000, y: 70_000 });
    frames(2);

    expect(connection?.connectionPoints?.[1]).toEqual({ x: 60_000, y: 70_050 });
    expect(view("far").isRendered()).toBe(false);
  });

  it("draws visible anchors outside their off-screen block's bounds", () => {
    graph.setEntities({
      blocks: [
        {
          ...block("overflow", 100, -400),
          anchors: Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, blockId: "overflow", type: "OUT" })),
        },
        block("far", 50_000, 50_000),
      ],
      connections: [],
    });
    graph.cameraService.set({ x: 0, y: 0, scale: 0.5 });
    frames(8);
    const anchor = graph.rootStore.blocksList.getBlockState("overflow")?.getAnchorById("a15")?.getViewComponent();
    expect(anchor?.getPosition()).toEqual({ x: 200, y: 168 });
    const arc = jest.spyOn(view("overflow").context.ctx, "arc").mockClear();

    graph.getGraphLayer().performRender();
    frames(3);

    expect(view("overflow").isRendered()).toBe(false);
    expect(arc).toHaveBeenCalledWith(200, 168, 9, 0, 2 * Math.PI);
    expect(graph.getElementOverPoint({ x: 200, y: 168 }, [Anchor])).toBe(anchor);
  });

  it("keeps point and rectangle queries consistent for anchors in a skipped branch", () => {
    graph.api.updateBlock({ id: "far", anchors: [{ id: "out", blockId: "far", type: "OUT" }] });
    frames(5);
    const anchor = graph.rootStore.blocksList.getBlockState("far")?.getAnchorById("out")?.getViewComponent();
    expect(anchor).toBeInstanceOf(Anchor);
    const far = jest.spyOn(view("far"), "iterate");

    graph.getGraphLayer().performRender();
    frames(3);

    expect(far).not.toHaveBeenCalled();
    expect(graph.getElementsOverRect({ x: 50_099, y: 50_087, width: 2, height: 2 }, [Anchor])).toContain(anchor);
    expect(graph.getElementOverPoint({ x: 50_100, y: 50_088 }, [Anchor])).toBe(anchor);
  });
});
