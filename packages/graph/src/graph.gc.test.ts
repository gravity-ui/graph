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

async function countCollected(refs: IWeakRef<Graph>[]): Promise<number> {
  // Pending scheduler work (deferred removals, store debounces) is released by the next global
  // frame; unmount stops the loop, so this test supplies that frame explicitly.
  globalScheduler.performUpdate();
  for (let i = 0; i < 3; i += 1) {
    // Leave the current job: WeakRef targets stay alive until it ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    collectGarbage();
  }
  return refs.filter((ref) => ref.deref() === undefined).length;
}

describe("Graph garbage collection", () => {
  it("releases unmounted graphs after the next scheduler frame", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => mountAndUnmountGraph(false));
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });

  it("releases graphs whose layers were removed before unmount", async () => {
    const refs = Array.from({ length: GRAPH_COUNT }, () => mountAndUnmountGraph(true));
    expect(await countCollected(refs)).toBe(GRAPH_COUNT);
  });
});
