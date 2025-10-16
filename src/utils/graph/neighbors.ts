import type { Graph } from "../../graph";
import type { TBlockId } from "../../store/block/Block";
import type { TConnectionId } from "../../store/connection/ConnectionState";

export type TNeighborsResult = {
  /** IDs of blocks connected to the target block */
  blocks: TBlockId[];
  /** IDs of connections connected to the target block */
  connections: TConnectionId[];
  /** IDs of incoming connections */
  incomingConnections: TConnectionId[];
  /** IDs of outgoing connections */
  outgoingConnections: TConnectionId[];
  /** IDs of source blocks (blocks that have connections to the target) */
  sourceBlocks: TBlockId[];
  /** IDs of target blocks (blocks that the target connects to) */
  targetBlocks: TBlockId[];
};

/**
 * Find all neighbors (connected blocks and connections) for a given block
 *
 * @param graph - Graph instance
 * @param blockId - ID of the block to find neighbors for
 * @returns Object containing all related entities
 *
 * @example
 * ```typescript
 * const neighbors = findBlockNeighbors(graph, "block-1");
 *
 * // Highlight the block and its neighbors
 * graph.highlight({
 *   block: ["block-1", ...neighbors.blocks],
 *   connection: neighbors.connections
 * });
 * ```
 */
export function findBlockNeighbors(graph: Graph, blockId: TBlockId): TNeighborsResult {
  const connections = graph.rootStore.connectionsList.$connections.value;

  const incomingConnections: TConnectionId[] = [];
  const outgoingConnections: TConnectionId[] = [];
  const sourceBlocks = new Set<TBlockId>();
  const targetBlocks = new Set<TBlockId>();

  // Find all connections related to this block
  for (const connection of connections) {
    if (connection.targetBlockId === blockId) {
      incomingConnections.push(connection.id);
      sourceBlocks.add(connection.sourceBlockId);
    }
    if (connection.sourceBlockId === blockId) {
      outgoingConnections.push(connection.id);
      targetBlocks.add(connection.targetBlockId);
    }
  }

  const allConnections = [...incomingConnections, ...outgoingConnections];
  const allBlocks = [...sourceBlocks, ...targetBlocks];

  return {
    blocks: allBlocks,
    connections: allConnections,
    incomingConnections,
    outgoingConnections,
    sourceBlocks: Array.from(sourceBlocks),
    targetBlocks: Array.from(targetBlocks),
  };
}

/**
 * Find all neighbors for multiple blocks
 *
 * @param graph - Graph instance
 * @param blockIds - Array of block IDs
 * @returns Combined neighbors result
 *
 * @example
 * ```typescript
 * const neighbors = findMultipleBlocksNeighbors(graph, ["block-1", "block-2"]);
 * graph.highlight({
 *   block: [...blockIds, ...neighbors.blocks],
 *   connection: neighbors.connections
 * });
 * ```
 */
export function findMultipleBlocksNeighbors(graph: Graph, blockIds: TBlockId[]): TNeighborsResult {
  const blocksSet = new Set<TBlockId>();
  const connectionsSet = new Set<TConnectionId>();
  const incomingConnectionsSet = new Set<TConnectionId>();
  const outgoingConnectionsSet = new Set<TConnectionId>();
  const sourceBlocksSet = new Set<TBlockId>();
  const targetBlocksSet = new Set<TBlockId>();

  for (const blockId of blockIds) {
    const neighbors = findBlockNeighbors(graph, blockId);

    neighbors.blocks.forEach((id) => blocksSet.add(id));
    neighbors.connections.forEach((id) => connectionsSet.add(id));
    neighbors.incomingConnections.forEach((id) => incomingConnectionsSet.add(id));
    neighbors.outgoingConnections.forEach((id) => outgoingConnectionsSet.add(id));
    neighbors.sourceBlocks.forEach((id) => sourceBlocksSet.add(id));
    neighbors.targetBlocks.forEach((id) => targetBlocksSet.add(id));
  }

  return {
    blocks: Array.from(blocksSet),
    connections: Array.from(connectionsSet),
    incomingConnections: Array.from(incomingConnectionsSet),
    outgoingConnections: Array.from(outgoingConnectionsSet),
    sourceBlocks: Array.from(sourceBlocksSet),
    targetBlocks: Array.from(targetBlocksSet),
  };
}

/**
 * Find all blocks connected by a specific connection
 *
 * @param graph - Graph instance
 * @param connectionId - ID of the connection
 * @returns Object with source and target block IDs
 *
 * @example
 * ```typescript
 * const { sourceBlockId, targetBlockId } = findConnectionBlocks(graph, "connection-1");
 * graph.highlight({
 *   block: [sourceBlockId, targetBlockId],
 *   connection: ["connection-1"]
 * });
 * ```
 */
export function findConnectionBlocks(
  graph: Graph,
  connectionId: TConnectionId
): { sourceBlockId: TBlockId; targetBlockId: TBlockId } | null {
  const connection = graph.rootStore.connectionsList.$connectionsMap.value.get(connectionId);

  if (!connection) {
    return null;
  }

  return {
    sourceBlockId: connection.sourceBlockId,
    targetBlockId: connection.targetBlockId,
  };
}

export type THighlightNeighborsOptions = {
  /** Include the original block(s) in highlight */
  includeSelf?: boolean;
  /** Only highlight incoming connections and their source blocks */
  incomingOnly?: boolean;
  /** Only highlight outgoing connections and their target blocks */
  outgoingOnly?: boolean;
};

/**
 * Highlight a block and its neighbors
 *
 * @param graph - Graph instance
 * @param blockId - ID of the block
 * @param options - Highlighting options
 *
 * @example
 * ```typescript
 * // Highlight block and all neighbors
 * highlightBlockNeighbors(graph, "block-1");
 *
 * // Highlight only incoming connections
 * highlightBlockNeighbors(graph, "block-1", { incomingOnly: true });
 *
 * // Highlight neighbors without the block itself
 * highlightBlockNeighbors(graph, "block-1", { includeSelf: false });
 * ```
 */
export function highlightBlockNeighbors(
  graph: Graph,
  blockId: TBlockId,
  options: THighlightNeighborsOptions = {}
): void {
  const { includeSelf = true, incomingOnly = false, outgoingOnly = false } = options;

  const neighbors = findBlockNeighbors(graph, blockId);

  let blocks: TBlockId[] = [];
  let connections: TConnectionId[] = [];

  if (incomingOnly) {
    blocks = neighbors.sourceBlocks;
    connections = neighbors.incomingConnections;
  } else if (outgoingOnly) {
    blocks = neighbors.targetBlocks;
    connections = neighbors.outgoingConnections;
  } else {
    blocks = neighbors.blocks;
    connections = neighbors.connections;
  }

  if (includeSelf) {
    blocks = [blockId, ...blocks];
  }

  graph.highlight({
    block: blocks,
    connection: connections,
  });
}

/**
 * Focus on a block and its neighbors (lowlight everything else)
 *
 * @param graph - Graph instance
 * @param blockId - ID of the block
 * @param options - Highlighting options
 *
 * @example
 * ```typescript
 * // Focus on block and its neighbors
 * focusBlockNeighbors(graph, "block-1");
 * ```
 */
export function focusBlockNeighbors(graph: Graph, blockId: TBlockId, options: THighlightNeighborsOptions = {}): void {
  const { includeSelf = true, incomingOnly = false, outgoingOnly = false } = options;

  const neighbors = findBlockNeighbors(graph, blockId);

  let blocks: TBlockId[] = [];
  let connections: TConnectionId[] = [];

  if (incomingOnly) {
    blocks = neighbors.sourceBlocks;
    connections = neighbors.incomingConnections;
  } else if (outgoingOnly) {
    blocks = neighbors.targetBlocks;
    connections = neighbors.outgoingConnections;
  } else {
    blocks = neighbors.blocks;
    connections = neighbors.connections;
  }

  if (includeSelf) {
    blocks = [blockId, ...blocks];
  }

  graph.focus({
    block: blocks,
    connection: connections,
  });
}
