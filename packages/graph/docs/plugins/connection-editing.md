# Connection Editing

## Overview

`ConnectionEditingLayer` from `@gravity-ui/graph-connection-editing` lets users create connections by drag and drop. It replaces the former `ConnectionLayer` and `PortConnectionLayer` of the core package and requires `@gravity-ui/graph` as a peer dependency. It ships no styles.

The layer only creates connections. Existing connections are rendered and hit-tested by the core.

## Usage

```typescript
import { Graph, layerConfig } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";

// Via graph configuration
const graph = new Graph({
  settings: { useBlocksAnchors: true },
  layers: [layerConfig(ConnectionEditingLayer, { searchRadius: 20 })],
});

// Or dynamically
const layer = graph.addLayer(ConnectionEditingLayer, {});
layer.disable();
layer.enable();
```

In React, use `useLayer(graph, ConnectionEditingLayer, props)` from `@gravity-ui/graph-react`; props updates are applied with `setProps`.

## Sources and targets

A connection starts from the first match under the cursor:

1. **A connection port**: a port within `searchRadius` whose meta has `ConnectionEditingLayer.PortMetaKey` with `snappable: true`. While dragging, the endpoint snaps to the nearest connection port within `searchRadius`; the per-port `snapCondition` can reject it.
2. **An anchor**, when the `useBlocksAnchors` setting is on. It connects to an anchor of another block. Anchors are hit from the schematic level on: at the minimalistic level the block under the cursor is hit instead (see [Anchors](../components/anchors.md#drawing-and-lazy-creation)).
3. **A block**, while Shift is held. It connects to another block; the preview line starts at the mousedown point.

Connection ports are also valid targets for anchor and block sources. Anchor connections are created in the OUT → IN direction, whichever end the drag started from. Use `canStart` to restrict sources, for example to connection ports only:

```typescript
graph.addLayer(ConnectionEditingLayer, {
  canStart: ({ sourcePort }) => {
    const meta = sourcePort.meta as Record<symbol, IPortConnectionMeta | undefined> | undefined;
    return Boolean(meta?.[ConnectionEditingLayer.PortMetaKey]?.snappable);
  },
});
```

Escape cancels the drag. While the layer is enabled, pressing an anchor never moves its block, even when no connection starts from it; pass `captureAnchors: false` to let such anchors drag their block.

### Port metadata

```typescript
import { ConnectionEditingLayer, type IPortConnectionMeta } from "@gravity-ui/graph-connection-editing";

const meta: IPortConnectionMeta = {
  snappable: true,
  // ctx: { sourcePort, targetPort, cursorPosition, distance }
  snapCondition: (ctx) => ctx.sourcePort.owner !== ctx.targetPort.owner,
};

// In a custom block component
this.updatePort(portId, { meta: { [ConnectionEditingLayer.PortMetaKey]: meta } });
```

`snapCondition` applies during preview and on release, including when the cursor is exactly on the port. The nearest eligible port wins, including ports moved or enabled during the drag. A Shift-drag onto another block’s body can use its default input at any distance. Both `snapCondition` on a marked input and `isConnectionAllowed` can veto that drop.

`ConnectionEditingLayer.PortMetaKey` is `Symbol.for("PortConnectionLayer.PortMeta")`, the key used by the former `PortConnectionLayer`.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Turns connection creation on or off. `enable()` / `disable()` set it. |
| `canStart` | `({ sourcePort, sourceComponent, event }) => boolean` | — | Rejects sources. |
| `isConnectionAllowed` | `({ sourcePort, targetPort }) => boolean` | — | Rejects targets, including snapping candidates. A rejected target is treated as no target. |
| `searchRadius` | `number` | `20` | Maximum distance to a connection port in world pixels, including the boundary. Use `0` for an exact hit. |
| `captureAnchors` | `boolean` | `true` | Prevents the block drag on every anchor while enabled. |
| `createIcon` | `TConnectionEditingIcon` | — | Icon at the cursor while there is no target. |
| `point` | `TConnectionEditingIcon` | — | Icon at the cursor while a target is hovered. |
| `drawLine` | `(start, end) => { path: Path2D; style: { color; width?; dash } }` | — | Custom preview line. `style.width` is in screen pixels. |
| `lineWidth` | `number` | `3` | Default preview line width in screen pixels. |
| `lineDash` | `number[]` | solid | Default preview line dash pattern. |

`TConnectionEditingIcon` is `{ path: string; width: number; height: number; viewWidth: number; viewHeight: number; fill?: string; stroke?: string }`, where `path` is an SVG path and `viewWidth` / `viewHeight` is its view box.

## Events

The events are typed on `graph.on` once the package is imported.

The layer adds `connectionSourceTag` and `connectionTargetTag` to the scene entities that own the source and hovered ports. Drop and cancel clear the preview. Selection remains under application control throughout the drag, including for keyboard commands such as Delete. Call `preventDefault()` on start or hover to supply your own highlight for that endpoint. A preview tag bound with `graph.scene.tags.bind` stays under the control of its signal. Subclasses that previously overrode `selectPort` can use these two events to customize the preview.

A connection is written in one of two `TConnection` addressing modes, never mixed:

- **Block mode**: both ends are a block's default point port or an anchor port. The connection has `sourceBlockId` / `targetBlockId` and, for anchors, `sourceAnchorId` / `targetAnchorId`.
- **Port mode**: at least one end is any other port (a custom component port, or a custom port on a block). The connection has `sourcePortId` / `targetPortId` only.

`connection-created` and the `connection-create-drop` that follows it use the same rule: in port mode their block and anchor IDs are `undefined`; use `sourcePort.id` / `targetPort.id`. In the other events (start, hover, a drop that creates nothing), the block and anchor IDs of an end are `undefined` when that end has no block address.

| Event | Detail | `preventDefault()` |
|---|---|---|
| `connection-create-start` | `blockId`, `anchorId`, `sourcePort` | Skips the source highlight. |
| `connection-create-hover` | source/target block and anchor IDs, `sourcePort`, `targetPort?` (`undefined` when the endpoint leaves a target) | Skips the target highlight. |
| `connection-created` | source/target block and anchor IDs, `sourcePort`, `targetPort` | Does not add the connection to the store. |
| `connection-create-drop` | source/target IDs, `point`, `sourcePort`, `targetPort?`; fired on mouse release, with or without a connection | — |
| `connection-create-cancel` | `sourcePort`, `targetPort`; fired on Escape, when the source disappears, or when the layer is detached mid-drag | — |

```typescript
graph.on("connection-created", (event) => {
  event.preventDefault();
  const { sourceBlockId, sourceAnchorId, targetBlockId, targetAnchorId, sourcePort, targetPort } = event.detail;
  if (sourceBlockId !== undefined && targetBlockId !== undefined) {
    // Block mode
    myModel.connect({ sourceBlockId, sourceAnchorId, targetBlockId, targetAnchorId });
  } else {
    // Port mode
    myModel.connect({ sourcePortId: sourcePort.id, targetPortId: targetPort.id });
  }
});

graph.on("connection-create-drop", ({ detail }) => {
  if (!detail.targetPort) {
    // Dropped on empty space: for example, create a block at detail.point.
  }
});
```
