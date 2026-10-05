import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { dragListener, stopDragListening } from "../../../../utils/functions/dragListener";
import { Block } from "../../blocks/Block";

import { ConnectionLayer } from "./ConnectionLayer";

class TestLayer extends ConnectionLayer {
  public mouseDown(event: GraphMouseEvent) {
    this.handleMouseDown(event);
  }
}

const block = { is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 };
function setup() {
  const graph = new Graph({
    blocks: [
      { ...block, id: "s" },
      { ...block, id: "t" },
    ],
  });
  const source = new Block({ id: "s" }, graph.getGraphLayer());
  const target = new Block({ id: "t" }, graph.getGraphLayer());
  const layer = new TestLayer({ graph, camera: graph.cameraService });
  layer.enable();
  layer.attachLayer(document.createElement("div"));
  const emitter = dragListener(document, {});
  const startDrag = jest.spyOn(graph.dragService, "startDrag").mockReturnValue(emitter);
  const event = new MouseEvent("mousedown", { shiftKey: true });
  layer.mouseDown(new CustomEvent("mousedown", { detail: { target: source, sourceEvent: event } }));
  const callbacks = startDrag.mock.calls[0]?.[0];
  if (!callbacks) throw new Error("Expected connection drag callbacks");
  return {
    graph,
    target,
    layer,
    event,
    callbacks,
    cleanup: () => {
      stopDragListening(emitter);
      layer.detachLayer();
      graph.unmount();
    },
  };
}

test("create-start handler cannot select a replacement source block", () => {
  const { graph, callbacks, event, cleanup } = setup();
  graph.on("connection-create-start", () => {
    graph.blocks.deleteBlocks(["s"]);
    graph.api.addBlock({ ...block, id: "s" });
  });
  callbacks.onStart?.(event, [0, 0]);
  expect(graph.blocks.blockSelectionBucket.isSelected("s")).toBe(false);
  cleanup();
});

test("connection-created handler cannot connect a replacement target block", () => {
  const { graph, target, callbacks, event, cleanup } = setup();
  jest.spyOn(graph, "getElementOverPoint").mockReturnValue(target);
  graph.on("connection-created", () => {
    graph.blocks.deleteBlocks(["t"]);
    graph.api.addBlock({ ...block, id: "t" });
  });
  callbacks.onStart?.(event, [0, 0]);
  callbacks.onUpdate?.(event, [10, 10]);
  callbacks.onEnd?.(event, [10, 10]);
  expect(graph.connections.getConnections()).toHaveLength(0);
  cleanup();
});
