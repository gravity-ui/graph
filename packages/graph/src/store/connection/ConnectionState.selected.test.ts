import { BaseConnection } from "../../components/canvas/connections/BaseConnection";
import { Graph } from "../../graph";
import { globalScheduler } from "../../lib/Scheduler";
import { ESelectionStrategy } from "../../services/selection";

import type { TConnection } from "./ConnectionState";

it("deletes only resolved selected connections without publishing an unchanged block list", () => {
  const graph = new Graph({});
  graph.setEntities({
    blocks: [{ is: "Block", id: "a", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] }],
    connections: [
      { id: "remove", sourceBlockId: "a", targetBlockId: "a" },
      { id: "keep", sourceBlockId: "a", targetBlockId: "a" },
    ],
  });
  const blocks = graph.rootStore.blocksList.$blocks.value;
  graph.api.selectConnections(["remove", "missing"], true);
  graph.api.deleteSelected();
  expect(graph.connections.$connections.value.map((edge) => edge.id)).toEqual(["keep"]);
  expect(graph.rootStore.blocksList.$blocks.value).toBe(blocks);

  const connections = graph.connections.$connections.value;
  graph.api.deleteSelected();
  expect(graph.connections.$connections.value).toBe(connections);
  expect(graph.rootStore.blocksList.$blocks.value).toBe(blocks);
});

it("connection $state has no selected field and does not change on selection", () => {
  const graph = new Graph({});
  graph.setEntities({
    blocks: [
      { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] },
      { is: "Block", id: "b", name: "B", x: 50, y: 0, width: 10, height: 10, anchors: [] },
    ],
    connections: [{ id: "c", sourceBlockId: "a", targetBlockId: "b" }],
  });
  const state = graph.rootStore.connectionsList.getConnectionState("c");
  const before = state?.$state.value;
  expect(before).not.toHaveProperty("selected");
  graph.selectionService.select("connection", ["c"], ESelectionStrategy.REPLACE);
  expect(state?.$state.value).toBe(before);
  expect(state?.$selected.value).toBe(true);
});

it("legacy selected in raw connection data does not select the connection component; the bucket does", () => {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph({}, root);
  // Untyped or persisted v1 data may still carry `selected`.
  const legacy = { id: "c", sourceBlockId: "a", targetBlockId: "b", selected: true };
  graph.setEntities({
    blocks: [
      { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] },
      { is: "Block", id: "b", name: "B", x: 50, y: 0, width: 10, height: 10, anchors: [] },
    ],
    connections: [legacy as TConnection],
  });
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
  const state = graph.rootStore.connectionsList.getConnectionState("c");
  const view = state?.getViewComponent();
  if (!(view instanceof BaseConnection)) throw new Error("Missing connection view");
  expect(view.state.selected).toBe(false);
  // A data update spreads the raw data into the component state again.
  state?.updateConnection({ label: "changed" });
  globalScheduler.performUpdate();
  expect(view.state.label).toBe("changed");
  expect(view.state.selected).toBe(false);
  graph.selectionService.select("connection", ["c"], ESelectionStrategy.REPLACE);
  globalScheduler.performUpdate();
  expect(view.state.selected).toBe(true);
  graph.unmount();
});
