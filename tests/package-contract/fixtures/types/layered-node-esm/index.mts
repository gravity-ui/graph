// The "Usage" example from packages/graph-layered/README.md, kept verbatim so the README stays compilable.
import { Graph, MultipointConnection, type TBlock } from "@gravity-ui/graph";
import { computeLevels, layeredConverter, layoutGraph } from "@gravity-ui/graph-layered";

const blocks = [
  { id: "a", width: 200, height: 100 },
  { id: "b", width: 200, height: 100 },
];
const connections = [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }];

const levels = computeLevels(blocks.map((b) => b.id), connections);
const layout = await layoutGraph({
  nodes: blocks.map((b) => ({ ...b, id: String(b.id), level: levels.get(b.id) ?? 0 })),
  edges: connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
});
const result = layeredConverter({
  layoutResult: layout,
  connections,
  blockSizes: new Map(blocks.map((b) => [String(b.id), b])),
});

const root = document.getElementById("graph") as HTMLDivElement;
const graph = new Graph({ settings: { connection: MultipointConnection } }, root);
graph.setEntities({
  blocks: blocks.map(
    (b): TBlock => ({ ...b, ...result.blocks[b.id], is: "Block", name: b.id, selected: false, anchors: [] })
  ),
  connections: connections.map((c) => ({ ...c, ...result.edges[c.id] })),
});
