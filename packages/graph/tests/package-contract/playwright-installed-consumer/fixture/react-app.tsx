import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import { Graph, GraphState, type TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphCanvas, useGraph, useGraphEvent } from "@gravity-ui/graph/react";

import "./app.css";
import "./react-app.css";

const blocks = [
  {
    id: "react-source",
    is: "Block",
    x: 180,
    y: 160,
    width: 220,
    height: 120,
    name: "React source",
    anchors: [],
  },
] satisfies TBlock[];

function ReactGraph() {
  const { graph, setEntities, start } = useGraph({ settings: {} });

  useLayoutEffect(() => {
    setEntities({ blocks, connections: [] });
    start();
  }, [setEntities, start]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.READY) {
      graph.zoomTo("center");
      const root = document.querySelector<HTMLDivElement>("#react-root");
      if (root) {
        root.dataset.state = "ready";
      }
    }
  });

  const renderBlock = (graphObject: Graph, block: TBlock) => (
    <GraphBlock graph={graphObject} block={block} className="react-block">
      <div data-testid={`react-block-${block.id}`}>{block.name}</div>
    </GraphBlock>
  );

  return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
}

const root = document.querySelector<HTMLDivElement>("#react-root");
if (!root) {
  throw new Error("React root was not found.");
}

createRoot(root).render(<ReactGraph />);
