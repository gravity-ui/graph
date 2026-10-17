import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { Graph } from "./graph";
import { globalScheduler } from "./lib/Scheduler";
import { Layer } from "./services/Layer";

setFlagsFromString("--expose-gc");
// The flag exposes `gc` only to contexts created afterwards; the vm result is that native function.
const collectGarbage = runInNewContext("gc") as () => void;

interface IWeakRef<T extends object> {
  deref(): T | undefined;
}
// The package lib predates ES2021 typings; the Node runtime running Jest provides WeakRef.
const WeakRef = (globalThis as unknown as { WeakRef: new <T extends object>(target: T) => IWeakRef<T> }).WeakRef;

const GRAPH_COUNT = 20;

function mountAndUnmountGraph(removeCustomLayer: boolean): IWeakRef<Graph> {
  const graph = new Graph({}, document.createElement("div"));
  graph.start();
  const layer = graph.addLayer(Layer, { html: { zIndex: 1 } });
  globalScheduler.performUpdate();
  if (removeCustomLayer) graph.removeLayer(layer);
  graph.unmount();
  return new WeakRef(graph);
}

function unmountGraphWithHoveredConnection(): IWeakRef<Graph> {
  const graph = new Graph({}, document.createElement("div"));
  graph.setEntities({
    blocks: [
      { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] },
      { id: "b", is: "Block", name: "B", x: 50, y: 0, width: 10, height: 10, anchors: [] },
    ],
    connections: [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }],
  });
  graph.start();
  for (let i = 0; i < 3; i += 1) globalScheduler.performUpdate();
  const view = graph.rootStore.connectionsList.$connections.value[0]?.getViewComponent();
  if (!view) throw new Error("Expected a rendered connection");
  // handleEvent is the protected hit-test entry point; the cast only reaches it from the test.
  (view as unknown as { handleEvent(event: MouseEvent): void }).handleEvent(new MouseEvent("mouseenter"));
  graph.unmount();
  return new WeakRef(graph);
}

async function countCollected(refs: IWeakRef<Graph>[]): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    // Leave the current job: WeakRef targets stay alive until it ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    collectGarbage();
  }
  return refs.filter((ref) => ref.deref() === undefined).length;
}

describe("Graph garbage collection", () => {
  it("releases unmounted graphs without another scheduler frame", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => mountAndUnmountGraph(false));
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases graphs whose layers were removed before unmount", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => mountAndUnmountGraph(true));
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases graphs that were attached and detached without being started", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => {
      const graph = new Graph({}, document.createElement("div"));
      graph.detach();
      return new WeakRef(graph);
    });
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases started graphs with entities after detach, without unmount", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => {
      const graph = new Graph({}, document.createElement("div"));
      graph.setEntities({
        blocks: [{ id: "a", is: "Block", name: "A", x: 0, y: 0, width: 10, height: 10, anchors: [] }],
      });
      graph.start();
      globalScheduler.performUpdate();
      graph.detach();
      return new WeakRef(graph);
    });
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases graphs that were never attached", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => new WeakRef(new Graph({})));
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases graphs unmounted while a connection hover is pending", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => unmountGraphWithHoveredConnection());
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });
});
