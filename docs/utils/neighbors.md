# Neighbor Utilities

The neighbor utilities provide functions to find and highlight connected entities in the graph. These utilities are useful for implementing interactive features like "click to highlight neighbors".

## Installation

The utilities are exported from the main package:

```typescript
import {
  findBlockNeighbors,
  findMultipleBlocksNeighbors,
  findConnectionBlocks,
  highlightBlockNeighbors,
  focusBlockNeighbors,
} from "@gravity-ui/graph";
```

## Finding Neighbors

### `findBlockNeighbors(graph, blockId)`

Finds all neighbors (connected blocks and connections) for a given block.

**Parameters:**
- `graph: Graph` - Graph instance
- `blockId: TBlockId` - ID of the block to find neighbors for

**Returns:** `TNeighborsResult`
```typescript
{
  blocks: TBlockId[];              // All connected blocks
  connections: TConnectionId[];    // All connections
  incomingConnections: TConnectionId[];  // Connections pointing to this block
  outgoingConnections: TConnectionId[];  // Connections from this block
  sourceBlocks: TBlockId[];        // Blocks that connect to this block
  targetBlocks: TBlockId[];        // Blocks that this block connects to
}
```

**Example:**

```typescript
const neighbors = findBlockNeighbors(graph, "block-1");

console.log("Connected blocks:", neighbors.blocks);
console.log("All connections:", neighbors.connections);
console.log("Incoming from:", neighbors.sourceBlocks);
console.log("Outgoing to:", neighbors.targetBlocks);

// Highlight the block and its neighbors
graph.highlight({
  block: ["block-1", ...neighbors.blocks],
  connection: neighbors.connections,
});
```

### `findMultipleBlocksNeighbors(graph, blockIds)`

Finds neighbors for multiple blocks and combines the results.

**Parameters:**
- `graph: Graph` - Graph instance
- `blockIds: TBlockId[]` - Array of block IDs

**Returns:** `TNeighborsResult` - Combined neighbors result

**Example:**

```typescript
const neighbors = findMultipleBlocksNeighbors(graph, ["block-1", "block-2"]);

graph.highlight({
  block: ["block-1", "block-2", ...neighbors.blocks],
  connection: neighbors.connections,
});
```

### `findConnectionBlocks(graph, connectionId)`

Finds the source and target blocks for a specific connection.

**Parameters:**
- `graph: Graph` - Graph instance
- `connectionId: TConnectionId` - ID of the connection

**Returns:** `{ sourceBlockId: TBlockId; targetBlockId: TBlockId } | null`

**Example:**

```typescript
const blocks = findConnectionBlocks(graph, "connection-1");

if (blocks) {
  graph.highlight({
    block: [blocks.sourceBlockId, blocks.targetBlockId],
    connection: ["connection-1"],
  });
}
```

## Highlighting Neighbors

### `highlightBlockNeighbors(graph, blockId, options?)`

Highlights a block and its neighbors using the highlight system.

**Parameters:**
- `graph: Graph` - Graph instance
- `blockId: TBlockId` - ID of the block
- `options?: THighlightNeighborsOptions` - Optional configuration

**Options:**
```typescript
{
  includeSelf?: boolean;      // Include the original block (default: true)
  incomingOnly?: boolean;     // Only highlight incoming connections (default: false)
  outgoingOnly?: boolean;     // Only highlight outgoing connections (default: false)
}
```

**Examples:**

```typescript
// Highlight block and all neighbors
highlightBlockNeighbors(graph, "block-1");

// Highlight only incoming connections and their sources
highlightBlockNeighbors(graph, "block-1", { incomingOnly: true });

// Highlight only outgoing connections and their targets
highlightBlockNeighbors(graph, "block-1", { outgoingOnly: true });

// Highlight neighbors without the block itself
highlightBlockNeighbors(graph, "block-1", { includeSelf: false });
```

### `focusBlockNeighbors(graph, blockId, options?)`

Focuses on a block and its neighbors (lowlights everything else).

**Parameters:**
- Same as `highlightBlockNeighbors`

**Example:**

```typescript
// Focus on block and its neighbors, lowlight everything else
focusBlockNeighbors(graph, "block-1");

// Focus only on incoming connections
focusBlockNeighbors(graph, "block-1", { incomingOnly: true });
```

## Interactive Use Cases

### Click to Highlight Neighbors

```typescript
import { Graph } from "@gravity-ui/graph";
import { useGraphEvent } from "@gravity-ui/graph/react";
import { highlightBlockNeighbors } from "@gravity-ui/graph";

function MyComponent({ graph }: { graph: Graph }) {
  useGraphEvent(graph, "click", (detail) => {
    const target = detail.target;

    if (target && "isBlock" in target && target.isBlock) {
      const blockId = (target as any).state.id;
      highlightBlockNeighbors(graph, blockId);
    } else {
      // Clicked on empty space - clear highlight
      graph.clearHighlight();
    }
  });

  return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
}
```

### Hover to Focus

```typescript
function MyComponent({ graph }: { graph: Graph }) {
  useGraphEvent(graph, "mouseenter", (detail) => {
    const target = detail.target;

    if (target && "isBlock" in target && target.isBlock) {
      const blockId = (target as any).state.id;
      focusBlockNeighbors(graph, blockId);
    }
  });

  useGraphEvent(graph, "mouseleave", (detail) => {
    const target = detail.target;

    if (target && "isBlock" in target && target.isBlock) {
      graph.clearHighlight();
    }
  });

  return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
}
```

### Custom Selection

```typescript
function highlightPath(graph: Graph, startBlockId: string, endBlockId: string) {
  // Find all blocks in the path
  const pathBlocks = findPathBetweenBlocks(graph, startBlockId, endBlockId);
  
  if (pathBlocks) {
    graph.highlight({
      block: pathBlocks,
      // You can also find connections between these blocks
    });
  }
}
```

## Advanced Usage

### Filtering Neighbors

```typescript
const neighbors = findBlockNeighbors(graph, "block-1");

// Only highlight direct downstream dependencies
graph.highlight({
  block: ["block-1", ...neighbors.targetBlocks],
  connection: neighbors.outgoingConnections,
});
```

### Multiple Levels

```typescript
function highlightNeighborsDepth2(graph: Graph, blockId: TBlockId) {
  const level1 = findBlockNeighbors(graph, blockId);
  const level2 = findMultipleBlocksNeighbors(graph, level1.blocks);

  graph.highlight({
    block: [blockId, ...level1.blocks, ...level2.blocks],
    connection: [...level1.connections, ...level2.connections],
  });
}
```

## See Also

- [Highlight System](../system/highlight.md) - Core highlight functionality
- [Highlight Styling](../system/highlight-styling.md) - Styling guide for highlight states
- [Events](../system/events.md) - Graph event system

