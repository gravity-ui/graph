import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { PortState } from "../../../../store/connection/port/Port";
import { dragListener, stopDragListening } from "../../../../utils/functions/dragListener";
import { GraphComponent } from "../../GraphComponent";
import { Block } from "../../blocks/Block";

import { PortConnectionLayer } from "./PortConnectionLayer";

class TestLayer extends PortConnectionLayer {
  public mouseDown(event: GraphMouseEvent) {
    this.handleMouseDown(event);
  }
  public connect(source: PortState, target: PortState) {
    this.createConnection(source, target);
  }
  public select(port: PortState, selected: boolean) {
    this.selectPort(port, selected);
  }
}

test("stale port selection does not select or deselect a replacement block", () => {
  const block = { id: "b", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 };
  const graph = new Graph({ blocks: [block] });
  const view = new Block({ id: "b" }, graph.getGraphLayer());
  const port = view.getPort("p");
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  graph.blocks.deleteBlocks(["b"]);
  graph.api.addBlock(block);
  layer.select(port, true);
  expect(graph.blocks.blockSelectionBucket.isSelected("b")).toBe(false);
  graph.api.selectBlocks(["b"], true);
  layer.select(port, false);
  expect(graph.blocks.blockSelectionBucket.isSelected("b")).toBe(true);
  graph.unmount();
});

test("repeated default port connections preserve block IDs and allow endpoint updates", () => {
  const block = { is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 };
  const graph = new Graph({
    blocks: [
      { ...block, id: "s" },
      { ...block, id: "t" },
    ],
  });
  const sourceView = new Block({ id: "s" }, graph.getGraphLayer());
  const targetView = new Block({ id: "t" }, graph.getGraphLayer());
  const source = sourceView.getPort("s_output");
  const target = targetView.getPort("t_input");
  source.updatePort({ x: 0, y: 0, meta: { [PortConnectionLayer.PortMetaKey]: { snappable: true } } });
  target.updatePort({ x: 10, y: 10, meta: { [PortConnectionLayer.PortMetaKey]: { snappable: true } } });
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  layer.attachLayer(document.createElement("div"));
  layer.enable();
  jest.spyOn(graph, "getElementsInViewport").mockReturnValue([targetView]);
  jest.spyOn(graph.connections.ports, "findPortAtPointByComponent").mockReturnValue(source);
  const emitter = dragListener(document, {});
  const startDrag = jest.spyOn(graph.dragService, "startDrag").mockReturnValue(emitter);
  const event = new MouseEvent("mousedown");
  for (let i = 0; i < 2; i++) {
    layer.mouseDown(new CustomEvent("mousedown", { detail: { target: sourceView, sourceEvent: event } }));
    const callbacks = startDrag.mock.calls[i]?.[0];
    if (!callbacks) throw new Error("Expected port drag");
    callbacks.onStart?.(event, [0, 0]);
    callbacks.onUpdate?.(event, [10, 10]);
    callbacks.onEnd?.(event, [10, 10]);
  }
  stopDragListening(emitter);
  layer.detachLayer();
  expect(graph.connections.$connectionsMap.value.size).toBe(1);
  const state = graph.connections.getConnectionState("s:t");
  expect(state?.toJSON().sourcePortId).toBeUndefined();
  state?.updateConnection({ sourceBlockId: "other" });
  expect(state?.$sourcePortId.value).toBe("other_output");
  graph.unmount();
});

test("repeated custom port connections preserve actual symbol ports without duplicates", () => {
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
