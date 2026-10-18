import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";

import { Graph, MultipointConnection, type TBlock, type TConnection } from "@gravity-ui/graph";
import { useElk } from "@gravity-ui/graph-elk/react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import "@gravity-ui/graph/styles.css";

import "../../shared/base.css";

const blocks = [
  { id: "source", is: "Block", x: 0, y: 0, width: 160, height: 80, name: "Source", anchors: [] },
  { id: "target", is: "Block", x: 0, y: 0, width: 160, height: 80, name: "Target", anchors: [] },
] satisfies TBlock[];
const connections: TConnection[] = [{ id: "source-to-target", sourceBlockId: "source", targetBlockId: "target" }];

const elkGraph: ElkNode = {
  id: "root",
  layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
  children: blocks.map(({ id, width, height }) => ({ id, width, height })),
  // ELK edges connect blocks: skip connections without an id or block ids (for example port-only ones).
  edges: connections.flatMap(({ id, sourceBlockId, targetBlockId }) =>
    id === undefined || sourceBlockId === undefined || targetBlockId === undefined
      ? []
      : [{ id: String(id), sources: [String(sourceBlockId)], targets: [String(targetBlockId)] }]
  ),
};
const elk = new ELK();

const graphRoot = document.querySelector<HTMLDivElement>("#graph");
const reactRoot = document.querySelector<HTMLDivElement>("#elk-root");
if (!graphRoot || !reactRoot) throw new Error("Fixture roots were not found.");

// Deliberately without @gravity-ui/graph-react: the /react entry needs only React and core.
const graph = new Graph({ settings: { connection: MultipointConnection } }, graphRoot);
graph.start();

function ElkLayout() {
  const { result, isLoading } = useElk(elkGraph, elk);

  useEffect(() => {
    if (isLoading || !result) return;
    graph.setEntities({
      blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
      connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
    });
    graph.zoomTo("center");
    reactRoot!.dataset.state = "ready";
  }, [isLoading, result]);

  return null;
}

createRoot(reactRoot).render(<ElkLayout />);
