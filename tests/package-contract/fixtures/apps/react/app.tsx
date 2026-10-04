import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import { Graph, GraphState, Layer, type TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphCanvas, GraphPortal, useBlockState, useSyncBlockState, useBlockViewState, useBlockAnchorState, useGraph, useGraphEvent } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

import "../../shared/base.css";
import "./app.css";

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
  if (!(graph instanceof Graph)) throw new Error("useGraph created a duplicate core runtime.");

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

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock}>
      <GraphPortal>
        {(layer, portalGraph) => {
          if (!(layer instanceof Layer) || portalGraph !== graph) {
            throw new Error("The React portal does not share the application's core runtime.");
          }
          return <div data-testid="react-portal">Shared core layer</div>;
        }}
      </GraphPortal>
    </GraphCanvas>
  );
}

const root = document.querySelector<HTMLDivElement>("#react-root");
if (!root) {
  throw new Error("React root was not found.");
}

createRoot(root).render(<ReactGraph />);

// Type-only contract probe; never mount this component.
function LookupContracts({ graph }: { graph: Graph }) {
  const state = useBlockState(graph, "missing");
  const sync = useSyncBlockState(graph, "missing");
  const view = useBlockViewState(graph, "missing");
  const anchor = useBlockAnchorState(graph, { id: "missing", blockId: "missing", type: "IN" });
  // @ts-expect-error a block may be absent
  state.id;
  // @ts-expect-error synchronous lookup preserves absence in emitted declarations
  sync.id;
  // @ts-expect-error a view may be absent
  view.getEntityId();
  // @ts-expect-error an anchor may be absent
  anchor.id;
  // @ts-expect-error an ID does not establish a custom metadata shape
  useSyncBlockState<TBlock<{ custom: string }>>(graph, "missing");
  if (sync) {
    const id: string | number = sync.id;
    void id;
  }
  return null;
}
void LookupContracts;
