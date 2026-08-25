# NewBlockLayer

`NewBlockLayer` enables block duplication through an intuitive Alt+drag interaction. When a user holds the Alt key and drags an existing block, this layer creates a ghost representation that follows the cursor, and upon release, a new block is created based on the original.

The layer supports two duplication modes:
1. **Single block duplication**: When Alt+dragging a non-selected block, only that block is duplicated
2. **Multiple block duplication**: When Alt+dragging a selected block, all selected blocks are duplicated together

## Basic Usage

```typescript
const graph = useGraph();

const newBlockLayer = graph.addLayer(NewBlockLayer, {});

// Enable or disable the functionality as needed
newBlockLayer.enable();
newBlockLayer.disable();
```
or
```typescript
const graph = useGraph({
    layers: [[NewBlockLayer, {}]]
});
```

## Configuration Options

- **ghostBackground**: Background color for displaying the block shadow. By default, the block border color from the theme is used.
- **isDuplicateAllowed**: Function to check if block duplication is allowed. Takes a block as a parameter and returns a boolean value.

Example with duplication validation:

```typescript
const graph = useGraph();

const newBlockLayer = graph.addLayer(NewBlockLayer, {
  // Custom ghost background color
  ghostBackground: 'rgba(0, 100, 255, 0.3)',
  
  // Only allow duplication of blocks that meet certain criteria
  isDuplicateAllowed: (block) => {
    // For example, prevent duplication of locked blocks
    return !block.connectedState.isLocked;
    
    // Or prevent duplication of blocks with specific types
    // return block.connectedState.type !== 'restricted-block';
  }
});
```

## Methods

- **enable()**: Enables block duplication functionality
- **disable()**: Disables block duplication functionality
- **isEnabled()**: Returns whether duplication is currently enabled

## Events

The layer provides these events:

### block-add-start-from-shadow

Fired when a user starts duplicating blocks (Alt+mousedown). Provides an array of blocks that will be duplicated.

```typescript
graph.on("block-add-start-from-shadow", (event) => {
  // event.detail.blocks - array of blocks that will be duplicated
  console.log('Duplicating blocks:', event.detail.blocks.length);
})
```

### block-added-from-shadow

Fired when block duplication is completed. Provides an array of items, each containing a block and its target coordinate, as well as the delta coordinates between the start and end positions of the mouse.

```typescript
graph.on("block-added-from-shadow", (event) => {
  // event.detail.items - array of objects with block and coord properties
  // event.detail.delta - object with x and y properties representing the movement distance
  
  // Create the actual blocks based on the source blocks
  event.detail.items.forEach((item) => {
    const { block, coord } = item;
    createBlockFromSource(block, coord);
  });
  
  // You can also use the delta information
  console.log(`Blocks were moved ${event.detail.delta.x}px horizontally and ${event.detail.delta.y}px vertically`);
})
```

## How Block Duplication Works

- Hold Alt and drag from an existing block to create a duplicate
- A semi-transparent ghost of the block follows your cursor during dragging
- When you release the mouse button, new blocks are created:
  - If you started dragging from a non-selected block, only that block is duplicated
  - If you started dragging from a selected block, all selected blocks are duplicated, maintaining their relative positions
- The actual block creation must be implemented by handling the `block-added-from-shadow` event

## Duplication Validation

When the `isDuplicateAllowed` function is provided:

1. The function is called immediately when a user attempts to start a duplication (Alt+mousedown)
2. If the function returns `false` for the clicked block, the duplication process is canceled
3. For multiple block duplication (when a selected block is clicked), each selected block is checked:
   - Only blocks that pass the validation will be duplicated
   - If no blocks pass validation, the duplication process is canceled
