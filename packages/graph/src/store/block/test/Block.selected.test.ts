import { Block as CanvasBlock } from "../../../components/canvas/blocks/Block";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { ESelectionStrategy } from "../../../services/selection";

describe("block selection is not block data", () => {
  it("selecting a block preserves its data and its serialized form", () => {
    const graph = new Graph({});
    graph.setEntities({
      blocks: [{ is: "Block", id: "a", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] }],
    });
    const state = graph.rootStore.blocksList.getBlockState("a");
    const before = state?.$state.value;
    expect(before).not.toHaveProperty("selected");
    graph.selectionService.select("block", ["a"], ESelectionStrategy.REPLACE);
    expect(state?.$state.value).toBe(before);
    expect(state?.$selected.value).toBe(true);
    expect(state?.asTBlock()).not.toHaveProperty("selected");
  });
});

describe("legacy selected in raw block data", () => {
  it("does not select the block component; the selection bucket does", () => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    const graph = new Graph({}, root);
    // Untyped or persisted v1 data may still carry `selected`.
    const legacy = { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [], selected: true };
    graph.setEntities({ blocks: [legacy as TBlock] });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    const state = graph.rootStore.blocksList.getBlockState("a");
    const view = state?.getViewComponent();
    if (!(view instanceof CanvasBlock)) throw new Error("Missing block view");
    expect(view.state.selected).toBe(false);
    // A data update spreads the raw data into the component state again.
    state?.updateBlock({ x: 20 });
    globalScheduler.performUpdate();
    expect(view.state.x).toBe(20);
    expect(view.state.selected).toBe(false);
    graph.selectionService.select("block", ["a"], ESelectionStrategy.REPLACE);
    globalScheduler.performUpdate();
    expect(view.state.selected).toBe(true);
    graph.unmount();
  });
});
