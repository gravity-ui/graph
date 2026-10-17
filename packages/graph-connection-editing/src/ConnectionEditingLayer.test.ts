import { CanvasBlock, Graph, GraphComponent } from "@gravity-ui/graph";
import type { PortState } from "@gravity-ui/graph";

import { ConnectionEditingLayer } from "./ConnectionEditingLayer";

// Exposes the default actions of the layer; the drag itself is covered by the E2E suite.
class TestLayer extends ConnectionEditingLayer {
  public connect(source: PortState, target: PortState): void {
    this.createConnection(source, target);
  }
  public select(port: PortState, selected: boolean): void {
    this.selectPort(port, selected);
  }
}

const block = { is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 };

test("stale port selection does not select or deselect a replacement block", () => {
  const graph = new Graph({ blocks: [{ ...block, id: "b" }] });
  const view = new CanvasBlock({ id: "b" }, graph.getGraphLayer());
  const port = view.getPort("p");
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  graph.blocks.deleteBlocks(["b"]);
  graph.api.addBlock({ ...block, id: "b" });
  layer.select(port, true);
  expect(graph.blocks.blockSelectionBucket.isSelected("b")).toBe(false);
  graph.api.selectBlocks(["b"], true);
  layer.select(port, false);
  expect(graph.blocks.blockSelectionBucket.isSelected("b")).toBe(true);
  graph.unmount();
});

test("repeated block port connections keep block IDs and allow endpoint updates", () => {
  const graph = new Graph({
    blocks: [
      { ...block, id: "s" },
      { ...block, id: "t" },
    ],
  });
  const source = new CanvasBlock({ id: "s" }, graph.getGraphLayer()).getOutputPort();
  const target = new CanvasBlock({ id: "t" }, graph.getGraphLayer()).getInputPort();
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  layer.connect(source, target);
  layer.connect(source, target);
  expect(graph.connections.$connectionsMap.value.size).toBe(1);
  const state = graph.connections.getConnectionState("s:t");
  expect(state?.toJSON().sourcePortId).toBeUndefined();
  state?.updateConnection({ sourceBlockId: "other" });
  expect(state?.$sourcePortId.value).toBe("other_output");
  graph.unmount();
});

test("repeated custom port connections keep the actual symbol ports without duplicates", () => {
  const graph = new Graph({});
  const component = new GraphComponent({}, graph.getGraphLayer());
  const source = component.getPort(Symbol("source"));
  const target = component.getPort(Symbol("target"));
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  layer.connect(source, target);
  layer.connect(source, target);
  const states = Array.from(graph.connections.$connectionsMap.value.values());
  expect(states).toHaveLength(1);
  expect(states[0]?.toJSON().sourcePortId).toBe(source.id);
  expect(states[0]?.toJSON().targetPortId).toBe(target.id);
  graph.unmount();
});
