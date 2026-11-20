import { Graph } from "../../../../../graph";
import { globalScheduler } from "../../../../../lib/Scheduler";
import type { TBlock } from "../../Block";

/** Below SCALES[1] (0.225): the minimalistic level. */
export const FAR = 0.1;
/** Schematic: from 0.225 to 0.7. */
export const NEAR = 0.5;

export const anchored = (id: string, x: number, y = 100, is = "Block"): TBlock => ({
  id,
  is,
  name: id,
  x,
  y,
  width: 200,
  height: 100,
  anchors: [
    { id: "in", blockId: id, type: "IN" },
    { id: "out", blockId: id, type: "OUT" },
  ],
});

export function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

/** A graph with a 1000 x 800 view whose camera starts at `scale`, at the world origin. */
export function startAnchoredGraph(blocks: TBlock[], scale: number, settings: Record<string, unknown> = {}): Graph {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph({ settings: { useBlocksAnchors: true, ...settings } }, root);
  graph.start();
  graph.cameraService.set({ scale, x: 0, y: 0 });
  graph.setEntities({ blocks, connections: [] });
  frames();
  return graph;
}
