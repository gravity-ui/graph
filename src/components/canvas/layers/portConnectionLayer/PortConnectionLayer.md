# PortConnectionLayer

Port-based connection layer for creating connections between graph elements using ports as the primary abstraction.

## Overview

`PortConnectionLayer` is a new layer designed to work exclusively with ports instead of components (Block/Anchor). It provides a more unified and efficient approach to connection creation.

## Key Differences from ConnectionLayer

| Feature | ConnectionLayer | PortConnectionLayer |
|---------|----------------|---------------------|
| Primary abstraction | Components (Block/Anchor) | Ports (PortState) |
| Element detection | `getElementOverPoint` → Component | `getElementsOverPoint` → Components → Ports |
| Port lookup | Component → Port | Components under cursor → Filter ports by distance |
| Metadata structure | Direct `IPortSnapMeta` | `meta[PortMetaKey]` |
| Events | Standard events | New `port-*` events with port refs |
| Dependencies | Depends on Block/Anchor classes | Only depends on PortState |

## Usage

### Basic Setup

```typescript
import { PortConnectionLayer } from "@gravity-ui/graph";

const GraphApp = () => {
  const { graph, addLayer } = useGraph({
    settings: {
      canCreateNewConnections: true,
      useBlocksAnchors: true,
    },
  });

  useLayoutEffect(() => {
    const layer = addLayer(PortConnectionLayer, {
      searchRadius: 30, // Port detection radius in pixels
      createIcon: { /* icon config */ },
      point: { /* point icon config */ },
      drawLine: (start, end) => { /* custom line renderer */ }
    });

    return () => layer.detachLayer();
  }, []);
};
```

### Configuring Port Snapping

```typescript
class MagneticBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);

      // Configure port metadata using PortMetaKey
      this.updatePort(portId, undefined, undefined, {
        [PortConnectionLayer.PortMetaKey]: {
          snappable: true,
          snapCondition: (ctx) => {
            // Custom validation logic
            const sameBlock = ctx.sourcePort.owner === ctx.targetPort.owner;
            return !sameBlock;
          }
        }
      });
    });
  }
}
```

## Port Metadata API

### PortMetaKey

Unique symbol key for storing layer-specific metadata in ports:

```typescript
PortConnectionLayer.PortMetaKey // Symbol.for("PortConnectionLayer.PortMeta")
```

### IPortConnectionMeta

```typescript
interface IPortConnectionMeta {
  snappable?: boolean;
  snapCondition?: TPortSnapCondition;
}

type TPortSnapCondition = (context: {
  sourcePort: PortState;
  targetPort: PortState;
  cursorPosition: TPoint;
  distance: number;
}) => boolean;
```

## Performance Optimization

PortConnectionLayer uses several optimizations for efficient port snapping:

### Viewport-based Filtering

The snapping system only considers ports from components visible in the current viewport (with padding). This significantly improves performance on large graphs:

- **RBush spatial index**: Fast nearest-neighbor search for ports
- **Viewport filtering**: Only includes ports from visible components
- **Lazy rebuild**: Snapping tree is rebuilt only when needed:
  - When ports change (new ports added, removed, or updated)
  - When camera moves (viewport changes)
  - When connection creation starts

### Memory Efficiency

The spatial index is automatically rebuilt when:
1. Components enter or leave the viewport
2. Port metadata changes
3. Ports are added or removed

This ensures the snapping system stays accurate while minimizing memory usage.

## Events

PortConnectionLayer emits new events with extended parameters:

### port-connection-create-start

Fired when connection creation starts from a port.

```typescript
graph.on("port-connection-create-start", (event) => {
  const { blockId, anchorId, sourcePort } = event.detail;
  console.log("Starting connection from port:", sourcePort.id);
  console.log("Port metadata:", sourcePort.meta);
});
```

### port-connection-create-hover

Fired when hovering over a potential target port.

```typescript
graph.on("port-connection-create-hover", (event) => {
  const { sourcePort, targetPort } = event.detail;
  if (targetPort) {
    console.log("Hovering over target port:", targetPort.id);
  }
});
```

### port-connection-created

Fired when a connection is successfully created.

```typescript
graph.on("port-connection-created", (event) => {
  const { sourcePort, targetPort, sourceBlockId, targetBlockId } = event.detail;
  console.log("Connection created between ports:", sourcePort.id, "->", targetPort.id);
  
  // Access port metadata
  const sourceMeta = sourcePort.meta?.[PortConnectionLayer.PortMetaKey];
  const targetMeta = targetPort.meta?.[PortConnectionLayer.PortMetaKey];
});
```

### port-connection-create-drop

Fired when the mouse is released (regardless of success).

```typescript
graph.on("port-connection-create-drop", (event) => {
  const { sourcePort, targetPort, point } = event.detail;
  console.log("Connection dropped at:", point);
});
```

## Advanced Examples

### Data Type Validation

```typescript
class TypedBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);
      const dataType = anchor.type === EAnchorType.IN ? "number" : "string";

      this.updatePort(portId, undefined, undefined, {
        [PortConnectionLayer.PortMetaKey]: {
          snappable: true,
          snapCondition: (ctx) => {
            // Check data types match
            const sourceMeta = ctx.sourcePort.meta as { dataType?: string };
            const targetMeta = ctx.targetPort.meta as { dataType?: string };
            
            return sourceMeta?.dataType === targetMeta?.dataType;
          }
        },
        dataType: dataType
      });
    });
  }
}
```

### Distance-Based Validation

```typescript
const snapMeta: IPortConnectionMeta = {
  snappable: true,
  snapCondition: (ctx) => {
    // Only snap if very close (within 10px)
    return ctx.distance <= 10;
  }
};
```

## Benefits

1. **Unified API**: Work with ports directly, no component type checks needed
2. **Better Performance**: 
   - First finds components under cursor using `getElementsOverPoint`
   - Then checks only their ports instead of all ports in the graph
   - More efficient for graphs with many ports
3. **Namespace Safety**: Symbol-based metadata keys prevent conflicts
4. **Enhanced Events**: Direct access to port objects and metadata
5. **Type Safety**: Better TypeScript inference with port-first approach
6. **Backward Compatible**: Existing ConnectionLayer continues to work

## Migration from ConnectionLayer

PortConnectionLayer is a drop-in replacement for ConnectionLayer:

```typescript
// Old way
addLayer(ConnectionLayer, { /* props */ });

// New way
addLayer(PortConnectionLayer, { /* same props */ });
```

Update your blocks to use the new metadata structure:

```typescript
// Old metadata structure (ConnectionLayer)
this.updatePort(portId, undefined, undefined, {
  snappable: true,
  snapCondition: (ctx) => { /* ... */ }
});

// New metadata structure (PortConnectionLayer)
this.updatePort(portId, undefined, undefined, {
  [PortConnectionLayer.PortMetaKey]: {
    snappable: true,
    snapCondition: (ctx) => { /* ... */ }
  }
});
```

## See Also

- [ConnectionLayer](../connectionLayer/ConnectionLayer.md) - Original component-based connection layer
- [Port System](../../../../store/connection/port/Port.ts) - Port state management
