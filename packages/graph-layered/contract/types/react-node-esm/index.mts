// The "React" example from packages/graph-layered/README.md, kept verbatim so the README stays compilable.
import { useEffect } from "react";
import type { Graph, TBlock, TConnection } from "@gravity-ui/graph";
import { useLayeredLayout } from "@gravity-ui/graph-layered/react";

const LAYOUT_OPTIONS = { nodeVerticalGap: 120 };

function useLayeredGraph(graph: Graph, blocks: TBlock[], connections: TConnection[]): void {
  const { result, isLoading } = useLayeredLayout({ blocks, connections, layoutOptions: LAYOUT_OPTIONS });

  useEffect(() => {
    if (isLoading || !result) return;
    graph.setEntities({
      blocks: blocks.map((b) => ({ ...b, ...result.blocks[b.id] })),
      connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
    });
  }, [graph, blocks, connections, isLoading, result]);
}

export { useLayeredGraph };
