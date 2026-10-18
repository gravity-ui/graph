# @gravity-ui/graph-connection-editing

Optional layer for `@gravity-ui/graph` that lets users create connections by drag and drop. It replaces the former `ConnectionLayer` and `PortConnectionLayer` from the core package.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```sh
npm install @gravity-ui/graph @gravity-ui/graph-connection-editing
```

```ts
import { Graph } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";

const graph = new Graph({ settings: { useBlocksAnchors: true } }, document.getElementById("graph")!);
const layer = graph.addLayer(ConnectionEditingLayer, { searchRadius: 20 });

graph.on("connection-created", (event) => {
  // The connection is added to the store by default; call event.preventDefault() to handle it yourself.
  console.log(event.detail.sourcePort.id, "->", event.detail.targetPort.id);
});

layer.disable(); // or graph.addLayer(ConnectionEditingLayer, { enabled: false })
graph.start();
```

With React, use `useLayer(graph, ConnectionEditingLayer, props)` from `@gravity-ui/graph-react`.

## How connections start

- **Ports.** Drag from a port whose meta has `{ [ConnectionEditingLayer.PortMetaKey]: { snappable: true } }`. The endpoint snaps to the nearest such port within `searchRadius`. Use `snapCondition` in the same meta to reject targets.
- **Anchors.** With `useBlocksAnchors` on, drag from an anchor to an anchor of another block.
- **Blocks.** Hold Shift and drag from one block to another.

Anchor connections are created in the OUT → IN direction. Press Escape to cancel. While the layer is enabled, dragging an anchor never moves its block (`captureAnchors: false` turns this off).

## Props

All props are optional: `enabled`, `canStart`, `isConnectionAllowed`, `searchRadius`, `captureAnchors`, `createIcon`, `point`, `drawLine`, `lineWidth`, `lineDash`. The layer also has `enable()` and `disable()`.

## Events

Importing the package adds typed graph events: `connection-create-start`, `connection-create-hover`, `connection-created`, `connection-create-drop` and `connection-create-cancel`. Each payload carries `sourcePort` / `targetPort` and, when the endpoint is a block or an anchor, the block and anchor IDs. `preventDefault()` on start and hover skips the selection highlight; on `connection-created` it skips adding the connection.

Full documentation: [Connection Editing guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/plugins/connection-editing.md). Migration from `ConnectionLayer`, `PortConnectionLayer` and the `canCreateNewConnections` setting: [v1 to v2 migration guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/migration-guides/v1-to-v2.md#connection-editing-package-boundary).
