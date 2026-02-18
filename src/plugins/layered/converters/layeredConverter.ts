import { TPoint } from "../../../utils/types/shapes";
import { DEFAULT_NODE_WIDTH, Edge } from "../layout";
import { ConverterResult } from "../types";

function buildAdjacency(edges: Edge<string>[]) {
  const adjacency = new Map<string, Array<{ to: string; arrows?: Edge<string>["arrows"] }>>();
  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const neighbors = adjacency.get(from);
    if (neighbors) {
      neighbors.push({ to, arrows: edge.arrows });
    } else {
      adjacency.set(from, [{ to, arrows: edge.arrows }]);
    }
  }
  return adjacency;
}

function getVirtualNodeCenter(
  nodePositions: Map<string, TPoint>,
  virtualNodeSize?: number
): (id: string) => TPoint | undefined {
  return (id: string) => {
    const pos = nodePositions.get(id);
    if (!pos) return undefined;
    const size = virtualNodeSize ?? DEFAULT_NODE_WIDTH;
    return {
      x: pos.x + size / 2,
      y: pos.y + size / 2,
    };
  };
}

function getBlockRightEdge(
  id: string,
  nodePositions: Map<string, TPoint>,
  blockSizes: Map<string, { width: number; height: number }>
): TPoint | undefined {
  const pos = nodePositions.get(id);
  if (!pos) return undefined;
  const size = blockSizes.get(id);
  if (size) {
    return {
      x: pos.x + size.width,
      y: pos.y + size.height / 2,
    };
  }
  return pos;
}

function getBlockLeftEdge(
  id: string,
  nodePositions: Map<string, TPoint>,
  blockSizes: Map<string, { width: number; height: number }>
): TPoint | undefined {
  const pos = nodePositions.get(id);
  if (!pos) return undefined;
  const size = blockSizes.get(id);
  if (size) {
    return {
      x: pos.x,
      y: pos.y + size.height / 2,
    };
  }
  return pos;
}

export type LayeredLayoutResult = {
  nodes: Array<{ id: string; x?: number; y?: number; shape?: string }>;
  edges: Edge<string>[];
};

export type LayeredConverterParams = {
  layoutResult: LayeredLayoutResult;
  /** Map of "sourceId/targetId" -> queue of connection ids (for multiple edges between same pair) */
  connectionIdBySourceTarget: Map<string, (string | number | symbol)[]>;
  blockSizes: Map<string, { width: number; height: number }>;
  virtualNodeSize?: number;
};

/**
 * Converts the result of layoutGraph() into the same format as ELK plugin (ConverterResult)
 * so it can be used with setEntities(blocks, connections) the same way.
 */
export function layeredConverter({
  layoutResult,
  connectionIdBySourceTarget,
  blockSizes,
  virtualNodeSize,
}: LayeredConverterParams): ConverterResult {
  const { nodes, edges } = layoutResult;
  const nodePositions = new Map<string, TPoint>();
  const dotNodeIds = new Set<string>();

  for (const node of nodes) {
    const id = String(node.id);
    nodePositions.set(id, { x: node.x ?? 0, y: node.y ?? 0 });
    if (node.shape === "dot") {
      dotNodeIds.add(id);
    }
  }

  const blocks: ConverterResult["blocks"] = {};
  for (const node of nodes) {
    if (node.shape === "dot") continue;
    const id = node.id;
    const pos = nodePositions.get(String(id));
    if (pos) {
      blocks[id] = pos;
    }
  }

  const edgesResult: ConverterResult["edges"] = {};
  const adjacency = buildAdjacency(edges);
  const visitedEdges = new Set<string>();
  const getVirtualCenter = getVirtualNodeCenter(nodePositions, virtualNodeSize);

  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const edgeKey = `${from}->${to}`;
    if (visitedEdges.has(edgeKey)) continue;
    if (dotNodeIds.has(from)) continue;

    const chain: string[] = [from];
    let current = to;
    visitedEdges.add(edgeKey);

    while (dotNodeIds.has(current)) {
      chain.push(current);
      const nextEdges = adjacency.get(current);
      if (!nextEdges || nextEdges.length === 0) break;
      const nextEdge = nextEdges[0];
      const nextEdgeKey = `${current}->${nextEdge.to}`;
      visitedEdges.add(nextEdgeKey);
      current = nextEdge.to;
    }
    chain.push(current);

    const sourceId = chain[0];
    const targetId = chain[chain.length - 1];
    const key = `${sourceId}/${targetId}`;
    const idQueue = connectionIdBySourceTarget.get(key);
    const connectionId = (idQueue?.length ? idQueue.shift() : null) ?? key;

    const points: TPoint[] = [];
    const sourceEdge = getBlockRightEdge(sourceId, nodePositions, blockSizes);
    if (sourceEdge) points.push(sourceEdge);

    if (chain.length > 2) {
      for (let i = 1; i < chain.length - 1; i++) {
        const center = getVirtualCenter(chain[i]);
        if (center) points.push(center);
      }
    }

    const targetEdge = getBlockLeftEdge(targetId, nodePositions, blockSizes);
    if (targetEdge) points.push(targetEdge);

    if (points.length >= 2) {
      (edgesResult as Record<string | number | symbol, { points: TPoint[] }>)[connectionId] = {
        points,
      };
    }
  }

  return { blocks, edges: edgesResult };
}
