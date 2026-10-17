import { Graph } from "./graph";
import { globalScheduler } from "./lib/Scheduler";

// A separate file keeps registrations from other tests out of the global scheduler counts.
function registrations(): number {
  return globalScheduler.getSchedulers().flat().length;
}

function rendersOnNextFrame(graph: Graph): boolean {
  const layer = graph.getGraphLayer();
  const iterate = jest.spyOn(layer, "iterate");
  layer.performRender();
  globalScheduler.performUpdate();
  const rendered = iterate.mock.calls.length > 0;
  iterate.mockRestore();
  return rendered;
}

describe("Graphs sharing the frame loop", () => {
  it("keeps a started graph rendering when another graph stops or unmounts", () => {
    const first = new Graph({}, document.createElement("div"));
    const second = new Graph({}, document.createElement("div"));
    first.start();
    second.start();

    first.stop();
    expect(rendersOnNextFrame(first)).toBe(false);
    expect(rendersOnNextFrame(second)).toBe(true);
    first.unmount();
    expect(rendersOnNextFrame(second)).toBe(true);

    second.unmount();
    expect(registrations()).toBe(0);
  });

  it("renders a graph only while it is started", () => {
    const graph = new Graph({}, document.createElement("div"));
    expect(registrations()).toBe(0);
    expect(rendersOnNextFrame(graph)).toBe(false);

    graph.start();
    expect(rendersOnNextFrame(graph)).toBe(true);

    graph.unmount();
    expect(registrations()).toBe(0);
  });

  it("leaves nothing scheduled after unmounting a graph with blocks and connections", () => {
    const graph = new Graph({}, document.createElement("div"));
    graph.setEntities({
      blocks: [
        { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] },
        { id: "b", is: "Block", name: "B", x: 50, y: 0, width: 10, height: 10, anchors: [] },
      ],
      connections: [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }],
    });
    graph.start();
    for (let i = 0; i < 5; i += 1) globalScheduler.performUpdate();

    graph.unmount();
    const ready = jest.fn();
    graph.runAfterGraphReady(ready);

    expect(registrations()).toBe(0);
    expect(ready).not.toHaveBeenCalled();
  });

  it("registers one frame task however often start() is called", () => {
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.start();
    expect(registrations()).toBe(1);
    graph.stop();
    graph.start();
    expect(registrations()).toBe(1);

    graph.unmount();
    expect(registrations()).toBe(0);
  });

  it("does not update a layer removed by another layer during the frame task", () => {
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    globalScheduler.performUpdate();
    const removed = graph.getGraphLayer();
    const iterate = jest.spyOn(removed, "iterate");
    const first = graph.layers.getLayers()[0];
    const firstIterate = first.iterate.bind(first);
    jest.spyOn(first, "iterate").mockImplementation((): boolean => {
      graph.detachLayer(removed);
      return firstIterate();
    });
    first.performRender();
    removed.performRender();

    globalScheduler.performUpdate();

    expect(first).not.toBe(removed);
    expect(iterate).not.toHaveBeenCalled();
    graph.unmount();
    graph.removeLayer(removed);
  });
});
