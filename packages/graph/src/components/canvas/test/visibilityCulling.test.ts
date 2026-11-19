import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TBlockId } from "../../../store/block/Block";
import { Anchor } from "../anchors";
import { Block, TBlock } from "../blocks/Block";
import { LegacyCanvasBlock } from "../blocks/LegacyCanvasBlock";
import { BlockConnection } from "../connections/BlockConnection";

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
    // The walk tests use the walked (legacy) block; scene blocks are covered by Block.scene.test.ts.
    graph = new Graph({ settings: { blockComponents: { Block: LegacyCanvasBlock } } }, document.createElement("div"));
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

  it("walks every component and paints only what the camera sees when viewportCulling is off", () => {
    graph.updateSettings({ viewportCulling: false });
    frames(2);
    const far = jest.spyOn(view("far"), "iterate");
    const farRender = jest.spyOn(view("far") as unknown as { render(): void }, "render");
    graph.getGraphLayer().performRender();
    frames(2);

    expect(far).toHaveBeenCalled();
    expect(farRender).not.toHaveBeenCalled();
    expect(view("near").isRendered()).toBe(true);
    expect(view("far").isRendered()).toBe(false);
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
    // 20 anchors are 40 primitives under one block: they fit the depth's adaptive width, so no limit is reported.
    const error = jest.spyOn(console, "error");
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

    graph.getGraphLayer().performRender();
    frames(3);

    expect(view("overflow").isRendered()).toBe(false);
    const anchorElement = anchor?.getSceneElementId() ?? "";
    expect(graph.scene.store.get(anchorElement)?.x).toBe(200);
    const viewport = { minX: 0, minY: 0, maxX: 2000, maxY: 1600 };
    expect(graph.scene.store.query(viewport).map((element) => element.id)).toContain(anchorElement);
    expect(graph.getElementOverPoint({ x: 200, y: 168 }, [Anchor])).toBe(anchor);
    expect(graph.scene.store.childrenOf(view("overflow").getSceneElementId())).toHaveLength(20);
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps point and rectangle queries consistent for anchors in a skipped branch", () => {
    graph.api.updateBlock({ id: "far", anchors: [{ id: "out", blockId: "far", type: "OUT" }] });
    // The camera shows the block once, so it creates its anchor, and leaves it again.
    lookAt(49_800, 49_800);
    frames(3);
    lookAt(0, 0);
    frames(5);
    const anchor = graph.rootStore.blocksList.getBlockState("far")?.getAnchorById("out")?.getViewComponent();
    expect(anchor).toBeInstanceOf(Anchor);
    const far = jest.spyOn(view("far"), "iterate");

    graph.getGraphLayer().performRender();
    frames(3);

    expect(far).not.toHaveBeenCalled();
    const rect = { x: 50_099, y: 50_087, width: 2, height: 2 };
    // Scale 1 is the detailed level: without an HTML view the stock anchor is not shown, so neither query finds it
    // and the point finds its block.
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([]);
    expect(graph.getElementOverPoint({ x: 50_100, y: 50_088 }, [Anchor])).toBeUndefined();
    expect(graph.getElementOverPoint({ x: 50_100, y: 50_088 }) === view("far")).toBe(true);
    // The schematic level shows it: both queries find it in the skipped branch (no frame runs in between).
    graph.cameraService.set({ scale: 0.5 });
    expect(graph.getElementsOverRect(rect, [Anchor])).toContain(anchor);
    expect(graph.getElementOverPoint({ x: 50_100, y: 50_088 }, [Anchor])).toBe(anchor);
    expect(far).not.toHaveBeenCalled();
  });
});
