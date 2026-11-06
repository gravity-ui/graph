import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TBlock } from "../blocks/Block";

import { BlockConnection } from "./BlockConnection";

const createBlock = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 50,
  selected: false,
  anchors: [],
});

function tick(frames = 5): void {
  for (let i = 0; i < frames; i++) {
    globalScheduler.performUpdate();
  }
}

describe("BlockConnections with useCanvasConnections", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph(
      {
        blocks: [createBlock("a", 0), createBlock("b", 300)],
        connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }],
      },
      document.createElement("div")
    );
    graph.start();
    tick();
  });

  afterEach(() => {
    graph.stop();
    graph.unmount();
  });

  it("creates no canvas connection components when disabled, keeping store geometry", () => {
    graph.updateSettings({ useCanvasConnections: false });
    tick();

    const state = graph.connections.getConnectionState("c1");
    expect(state?.getViewComponent()).toBeUndefined();
    expect(state?.$geometry.value).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it("recreates canvas connection components when enabled again", () => {
    graph.updateSettings({ useCanvasConnections: false });
    tick();
    graph.updateSettings({ useCanvasConnections: true });
    tick();

    expect(graph.connections.getConnectionState("c1")?.getViewComponent()).toBeInstanceOf(BlockConnection);
  });
});
