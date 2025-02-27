# NewBlockLayer

`NewBlockLayer` enables block duplication through an intuitive Alt+drag interaction. When a user holds the Alt key and drags an existing block, this layer creates a ghost representation that follows the cursor, and upon release, a new block is created based on the original.

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

## Methods

- **enable()**: Enables block duplication functionality
- **disable()**: Disables block duplication functionality
- **isEnabled()**: Returns whether duplication is currently enabled

## Events

The layer provides these events:

### block-add-start-from-shadow

Fired when a user starts duplicating a block (Alt+mousedown).

```typescript
graph.on("block-add-start-from-shadow", (event) => {
  console.log('Duplicating block', event.detail.sourceBlockId);
})
```

### block-added-from-shadow

Fired when a block duplication is completed.

```typescript
graph.on("block-added-from-shadow", (event) => {
  console.log('Block duplicated from', event.detail.sourceBlockId);
  console.log('At coordinates', event.detail.coord);
  
  // Create the actual block based on the source block
  const newBlock = createBlockFromSource(
    event.detail.sourceBlockId, 
    event.detail.coord
  );
})
```

## How Block Duplication Works

- Hold Alt and drag from an existing block to create a duplicate
- A semi-transparent ghost of the block follows your cursor during dragging
- When you release the mouse button, a new block is created at that position
- The actual block creation must be implemented by handling the `block-added-from-shadow` event
