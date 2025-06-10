# Anchors Documentation

Anchors are connection points on blocks that allow creating connections between blocks. This document describes the anchor structure, behavior, and how to properly configure them.

> **Note:** Anchors are optional in the graph system. You can create graphs without anchors by setting the `useBlocksAnchors` setting to `false`. In this case, connections will be made directly between blocks without specific anchor points.

## Anchor Structure

Anchors are defined using the `TAnchor` interface:

```typescript
export type TAnchor = {
  id: string;           // Unique identifier for the anchor
  blockId: TBlockId;    // ID of the block this anchor belongs to
  type: EAnchorType;    // Type of anchor (IN or OUT)
  index?: number;       // Optional index for ordering anchors of the same type
};
```

### Key Properties

1. **id**: A unique identifier for the anchor within the block. This is used to reference the anchor in connections and for selection.

2. **blockId**: The ID of the block this anchor belongs to. This is critical for the anchor to be properly associated with its parent block and for the selection system to work correctly.

3. **type**: The type of anchor, defined by the `EAnchorType` enum:
   ```typescript
   export enum EAnchorType {
     IN = "IN",   // Input anchor (can receive connections)
     OUT = "OUT", // Output anchor (can initiate connections)
   }
   ```

4. **index**: An optional numeric value that determines the order of anchors of the same type. This affects the visual positioning of anchors on the block.

## Configuring Anchors and Connections

When defining blocks in your graph configuration, you can configure anchors and connections between them:

```typescript
const graphConfig = {
  blocks: [
    {
      id: "block1",
      is: "Block",
      x: 100,
      y: 100,
      width: 150,
      height: 80,
      name: "Source Block",
      selected: false,
      anchors: [
        {
          id: "out1",
          blockId: "block1", // Must match the parent block's ID
          type: EAnchorType.OUT,
          index: 0
        }
      ]
    },
    {
      id: "block2",
      is: "Block",
      x: 400,
      y: 200,
      width: 150,
      height: 80,
      name: "Target Block",
      selected: false,
      anchors: [
        {
          id: "in1",
          blockId: "block2", // Must match the parent block's ID
          type: EAnchorType.IN,
          index: 0
        }
      ]
    }
  ],
  connections: [
    {
      id: "conn1",
      sourceBlockId: "block1",
      sourceAnchorId: "out1", // Reference to the source anchor
      targetBlockId: "block2",
      targetAnchorId: "in1", // Reference to the target anchor
      selected: false
    }
  ]
};
```

## Dynamic Anchor Creation

When creating blocks dynamically, ensure you set the correct `blockId` for each anchor:

```typescript
// Create a new block with a unique ID
const newBlockId = `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const blockId = graph.api.addBlock({
  id: newBlockId, // Explicitly set the block ID
  is: "Block",
  x: 100,
  y: 100,
  width: 150,
  height: 80,
  name: "New Block",
  selected: false,
  anchors: [
    {
      id: "in",
      blockId: newBlockId, // Use the same ID as the block
      type: EAnchorType.IN,
      index: 0
    },
    {
      id: "out",
      blockId: newBlockId, // Use the same ID as the block
      type: EAnchorType.OUT,
      index: 0
    }
  ]
});
```

## Anchor Selection

Anchors can be selected programmatically or through user interaction. The selection state is managed by the `AnchorState` class:

```typescript
// Get the anchor state
const anchorState = block.getAnchorState("anchorId");

// Select the anchor
anchorState.setSelection(true);

// Deselect the anchor
anchorState.setSelection(false);
```

## Anchor Positioning

The position of anchors is determined by the block's geometry and the anchor's type and index. The `Block` class provides methods to get the position of an anchor:

```typescript
// Get the position of an anchor
const position = block.getAnchorPosition(anchorId);
```

## Anchor Positioning and Block Height

The vertical position of anchors is determined by the block's constants, specifically `HEAD_HEIGHT` and `BODY_PADDING`. These constants are defined in the graph configuration and affect where anchors are placed on blocks.

```typescript
// From Block.ts - getAnchorPosition method
const offset = this.context.constants.block.HEAD_HEIGHT + this.context.constants.block.BODY_PADDING;
return {
  x: anchor.type === EAnchorType.OUT ? this.state.width : 0,
  y: offset + index * this.context.constants.system.GRID_SIZE * 2,
};
```

### Important Considerations for Block Height

1. **Default Constants**: By default, `HEAD_HEIGHT` is 64px and `BODY_PADDING` is 24px, resulting in an 88px vertical offset for the first anchor.

2. **Small Blocks Warning**: If your blocks have a small height (e.g., less than 90px), the anchors may appear below the actual block. To fix this:
   - Set `HEAD_HEIGHT` to 0 or a smaller value
   - Reduce `BODY_PADDING` as needed

3. **Custom Configuration Example**:
   ```javascript
   const graph = new Graph({
     constants: {
       block: {
         HEAD_HEIGHT: 0,  // Remove header height for small blocks
         BODY_PADDING: 8  // Reduce padding for better anchor positioning
       }
     },
     // other configuration...
   }, container);
   ```

4. **Anchor Index Impact**: Each additional anchor is positioned with an offset of `GRID_SIZE * 2` (default 32px). Consider this when determining how many anchors can fit on a block of a given height.
