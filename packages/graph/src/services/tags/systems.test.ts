import { Graph } from "../../graph";
import { globalScheduler } from "../../lib/Scheduler";
import { ESelectionStrategy } from "../selection";

import { draggingTag, hoveredTag, selectedTag } from "./builtinTags";
import { getEntityAddress } from "./entity";

function makeGraph(): Graph {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph({}, root);
  graph.setEntities({
    blocks: [
      { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 100, height: 50, anchors: [] },
      { is: "Block", id: "b", name: "B", x: 200, y: 0, width: 100, height: 50, anchors: [] },
    ],
    connections: [{ id: "c", sourceBlockId: "a", targetBlockId: "b" }],
  });
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  // View components exist once the scheduler has rendered a few frames.
  for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
  return graph;
}

describe("built-in tags", () => {
  it("selectedTag follows the selection buckets of every entity type", () => {
    const graph = makeGraph();
    // The single-type REPLACE resets every other bucket, so both types are selected in one call.
    graph.selectionService.select({ block: ["a"], connection: ["c"] }, ESelectionStrategy.REPLACE);
    expect(graph.scene.tags.$of("block", "a").value.has(selectedTag)).toBe(true);
    expect(graph.scene.tags.$of("connection", "c").value.has(selectedTag)).toBe(true);
    graph.selectionService.select("block", ["b"], ESelectionStrategy.REPLACE);
    expect(graph.scene.tags.$of("block", "a").value.has(selectedTag)).toBe(false);
    expect(graph.scene.tags.$of("block", "b").value.has(selectedTag)).toBe(true);
  });

  it("selectedTag rejects direct writes: selection is its one writer", () => {
    const graph = makeGraph();
    expect(() => graph.scene.tags.add(selectedTag, { block: ["a"] })).toThrow(/bound/);
  });

  it("draggingTag follows the drag service's participants", () => {
    const graph = makeGraph();
    const block = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    expect(block).toBeDefined();
    graph.dragService.$state.value = {
      ...graph.dragService.$state.value,
      isDragging: true,
      components: block ? [block] : [],
    };
    expect(graph.scene.tags.$of("block", "a").value.has(draggingTag)).toBe(true);
  });

  it("hoveredTag follows GraphLayer's hovered component", () => {
    const graph = makeGraph();
    const layer = graph.getGraphLayer();
    const block = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    layer.setHoveredComponent(block);
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(true);
    layer.setHoveredComponent(undefined);
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(false);
  });

  it("hoveredTag is dropped when the hovered component is removed under a stationary pointer", () => {
    const graph = makeGraph();
    const layer = graph.getGraphLayer();
    layer.setHoveredComponent(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent());
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(true);
    graph.setEntities({
      blocks: [{ is: "Block", id: "b", name: "B", x: 200, y: 0, width: 100, height: 50, anchors: [] }],
      connections: [],
    });
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(false);
  });

  it("exposes the hovered component read-only; only GraphLayer and its internal setter write it", () => {
    const graph = makeGraph();
    const layer = graph.getGraphLayer();
    const clear = (): void => {
      // @ts-expect-error $hoveredComponent is a ReadonlySignal.
      layer.$hoveredComponent.value = undefined;
    };
    expect(clear).toBeInstanceOf(Function);
    const block = graph.rootStore.blocksList.getBlockState("b")?.getViewComponent();
    layer.setHoveredComponent(block);
    expect(layer.$hoveredComponent.value).toBe(block);
    graph.unmount();
  });

  it("keeps tag bindings and the stores out of the package's values", async () => {
    const api: Record<string, unknown> = await import("../../index");
    expect(api).not.toHaveProperty("bindBuiltinTags");
    expect(api).not.toHaveProperty("TagStore");
    expect(api).not.toHaveProperty("SceneStyleSheet");
    expect(api).not.toHaveProperty("StyleSheet");
    expect(api).toHaveProperty("entityKey");
    expect(api).toHaveProperty("defineTag");
  });

  it("getEntityAddress reads the class's entity type and the component's entity id", () => {
    const graph = makeGraph();
    const block = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    expect(block && getEntityAddress(block)).toEqual({ type: "block", id: "a" });
    expect(getEntityAddress({})).toBeUndefined();
  });
});
