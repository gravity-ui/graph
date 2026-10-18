import { Graph, MultipointConnection, type TBlock, type TConnection } from "@gravity-ui/graph";
import { computeLevels, layeredConverter, layoutGraph } from "@gravity-ui/graph-layered";
import "@gravity-ui/graph/styles.css";

import "../../../../scripts/package-contract/shared/base.css";

const blocks = ["source", "middle", "target"].map(
  (id): TBlock => ({ id, is: "Block", x: 0, y: 0, width: 180, height: 100, name: id, selected: false, anchors: [] })
);
const connections: TConnection[] = [
  { id: "source-middle", sourceBlockId: "source", targetBlockId: "middle" },
  { id: "middle-target", sourceBlockId: "middle", targetBlockId: "target" },
];

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) {
  throw new Error("Graph root was not found.");
}

// The browser bundle is not a module, so the asynchronous layout runs inside a function.
async function applyLayout(target: HTMLDivElement): Promise<void> {
  const levels = computeLevels(
    blocks.map((block) => block.id),
    connections
  );
  const layout = await layoutGraph({
    nodes: blocks.map((block) => ({ ...block, id: String(block.id), level: levels.get(block.id) ?? 0 })),
    edges: connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
  });
  const result = layeredConverter({
    layoutResult: layout,
    connections,
    blockSizes: new Map(blocks.map((block) => [String(block.id), block])),
  });

  const graph = new Graph({ settings: { connection: MultipointConnection } }, target);
  graph.setEntities({
    blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
    connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
  });
  graph.start();
  graph.zoomTo("center");

  target.dataset.layeredReady = "true";
}

void applyLayout(root);
