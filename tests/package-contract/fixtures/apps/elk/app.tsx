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
const connections = [{ id: "source-to-target", sourceBlockId: "source", targetBlockId: "target" }] satisfies TConnection[];

const elkGraph: ElkNode = {
  id: "root",
  layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
  children: blocks.map(({ id, width, height }) => ({ id, width, height })),
  edges: connections.map(({ id, sourceBlockId, targetBlockId }) => ({
    id,
    sources: [sourceBlockId],
    targets: [targetBlockId],
  })),
};
const elk = new ELK();

const graphRoot = document.querySelector<HTMLDivElement>("#graph");
const reactRoot = document.querySelector<HTMLDivElement>("#elk-root");
if (!graphRoot || !reactRoot) throw new Error("Fixture roots were not found.");

const graph = new Graph({ settings: { connection: MultipointConnection } }, graphRoot);
graph.start();

function ElkLayout() {
  const { result, isLoading } = useElk(elkGraph, elk);

  useEffect(() => {
    if (isLoading || !result) return;
    graph.setEntities({
      blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
      connections: connections.map((connection) => ({ ...connection, ...result.edges[connection.id] })),
    });
    graph.zoomTo("center");
    reactRoot!.dataset.state = "ready";
  }, [isLoading, result]);

  return null;
}

createRoot(reactRoot).render(<ElkLayout />);
