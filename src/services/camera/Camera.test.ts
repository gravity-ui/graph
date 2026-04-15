import { Graph } from "../../graph";

function createGraph() {
  const node = document.createElement("div");
  const graph = new Graph({ blocks: [], connections: [] }, node);
  graph.start();
  return graph;
}

function emitMouseDown(graph: Graph, button: number) {
  const native = new MouseEvent("mousedown", { button });
  return {
    event: graph.emit("mousedown", { sourceEvent: native, pointerPressed: false }),
    native,
  };
}

describe("Middle-mouse camera pan", () => {
  it("DragService skips block drag on middle-button mousedown", (done) => {
    const graph = createGraph();
    setTimeout(() => {
      const spy = jest.spyOn(graph.dragService, "startDrag");
      emitMouseDown(graph, 1);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      done();
    }, 100);
  });

  it("DragService continues to process left-button mousedown", (done) => {
    const graph = createGraph();
    setTimeout(() => {
      // Left-button path is unchanged; just make sure we don't short-circuit.
      const spy = jest.spyOn(graph.dragService, "handleMouseDown");
      emitMouseDown(graph, 0);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
      done();
    }, 100);
  });
});
