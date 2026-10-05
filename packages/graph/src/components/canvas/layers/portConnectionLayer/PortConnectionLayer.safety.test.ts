import { Graph } from "../../../../graph";
import { PortState } from "../../../../store/connection/port/Port";
import { Block } from "../../blocks/Block";

import { PortConnectionLayer } from "./PortConnectionLayer";

class TestLayer extends PortConnectionLayer {
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
