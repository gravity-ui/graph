# Duplicate Block Plugin

`DuplicateBlockLayer` from `@gravity-ui/graph-duplicate-block` duplicates blocks with Alt+drag. While the user holds Alt and drags a block, a preview follows the cursor; on release, copies of the blocks are added at the drop position.

The layer supports two duplication modes:
1. **Single block duplication**: Alt+dragging a non-selected block duplicates only that block.
2. **Multiple block duplication**: Alt+dragging a selected block duplicates all selected blocks and keeps their relative positions.

In v2 the layer moved out of core and was renamed from `NewBlockLayer`. See the [migration guide](../migration-guides/v1-to-v2.md#duplicate-block-package-boundary).

## Basic Usage

`@gravity-ui/graph` is a required peer dependency. The package has no stylesheet and does not require React.

```typescript
import { Graph, layerConfig } from "@gravity-ui/graph";
import { DuplicateBlockLayer } from "@gravity-ui/graph-duplicate-block";

const graph = new Graph({
  layers: [layerConfig(DuplicateBlockLayer, {})],
});

// or add it later
const duplicateLayer = graph.addLayer(DuplicateBlockLayer, {});

// Enable or disable the functionality as needed
duplicateLayer.enable();
duplicateLayer.disable();
```

In React, attach it with `useLayer` from `@gravity-ui/graph-react` instead of calling `graph.addLayer`:

```tsx
const { graph } = useGraph({});
const duplicateLayer = useLayer(graph, DuplicateBlockLayer, {});
```

## Configuration Options

- **ghostBackground**: Background color of the preview. By default, the block border color from the theme is used.
- **isDuplicateAllowed**: Checks whether a block can be duplicated. Takes a block and returns a boolean.

```typescript
const duplicateLayer = graph.addLayer(DuplicateBlockLayer, {
  ghostBackground: "rgba(0, 100, 255, 0.3)",
  // For example, prevent duplication of blocks with a specific type
  isDuplicateAllowed: (block) => block.connectedState.$state.value.is !== "restricted-block",
});
```

## Methods

- **enable()**: Enables block duplication
- **disable()**: Disables block duplication
- **isEnabled()**: Returns whether duplication is currently enabled

## Events

Importing the package adds both events to `GraphEventsDefinitions`, so `graph.on` infers their payloads.

### blocks-duplicate-start

Fired when the user starts duplicating blocks. `event.detail.blocks` contains the blocks that will be duplicated. Calling `event.preventDefault()` hides the preview; the duplication still completes on release.

```typescript
graph.on("blocks-duplicate-start", (event) => {
  console.log("Duplicating blocks:", event.detail.blocks.length);
});
```

### blocks-duplicate

Fired on release. `event.detail.items` contains each source block with the coordinates of its copy, and `event.detail.delta` contains the offset between the sources and the copies.

If the event is not prevented, the layer clears the selection, adds the copies as selected blocks and copies the connections between them. Call `event.preventDefault()` to create the blocks yourself, for example after a backend request.

```typescript
graph.on("blocks-duplicate", (event) => {
  event.preventDefault();

  event.detail.items.forEach(({ block, coord }) => {
    createBlockFromSource(block, coord);
  });
});
```

## How Block Duplication Works

- Hold Alt and drag a block. The block itself does not move.
- A preview of the blocks follows the cursor.
- On release, the copies are added:
  - each copy keeps all fields of its source, including its type (`is`), and gets a new `id` and position;
  - when several blocks are copied, the connections between them are copied too (see below).

## Copying connections

Connections are copied only when at least two blocks are duplicated. Each end of a connection is addressed in one of two ways, and core uses the port ID when both are set:

- **By block** — `sourceBlockId` / `targetBlockId`, optionally with `sourceAnchorId` / `targetAnchorId`. The end is copied when its block is duplicated: the copy points at the duplicate and keeps the anchor ID.
- **By port** — `sourcePortId` / `targetPortId`. The end is copied only when the port is one core derives for a duplicated block: its block point (`createBlockPointPortId`) or one of its anchors (`createAnchorPortId`). The copy points at the same port of the duplicate. Custom ports cannot be mapped to a duplicate, so connections that use them are not copied.

A connection is copied only when both its ends can be copied. The copy keeps all other fields except selection and gets a new unique `id`, so repeated duplication never replaces existing connections. Its route `points` and positioned `labels` move with the blocks.

## Duplication Validation

When `isDuplicateAllowed` is provided:

1. It is called when the user presses Alt and the mouse button on a block. If it returns `false`, the layer ignores the gesture and the block is dragged as usual.
2. For multiple block duplication, each selected block is checked. Only blocks that pass are duplicated; if none pass, nothing is duplicated.
