# Connection System: Connecting Blocks in Your Graph

The Connection System allows you to create visual links between blocks in your graph. It supports different types of connections, from simple straight lines to complex curved paths with multiple points.

## Key Features

- **Flexible Connection Types**: Straight lines, bezier curves, and multi-point connections
- **Visual Customization**: Colors, dash patterns, line thickness, and arrows
- **Interactive Elements**: Hover effects, selection states, and clickable labels
- **Performance Optimized**: Efficient rendering of thousands of connections
- **Anchor Support**: Connect to specific points on blocks or use default connection points

## Creating Connections

The simplest way to create connections is using block identifiers. The system will automatically connect to the default input/output points of blocks:

```typescript
// Simple connection between two blocks
const connection = {
  id: "connection-1",
  sourceBlockId: "block-1",
  targetBlockId: "block-2"
};

graph.setEntities({ connections: [connection] });
```

For more precise control, connect to specific anchor points on blocks:

```typescript
// Connection to specific anchors
const connection = {
  id: "connection-2", 
  sourceBlockId: "block-1",
  sourceAnchorId: "output",
  targetBlockId: "block-2",
  targetAnchorId: "input"
};
```

## Port System: Connection Foundation

The Port System manages connection endpoints and allows connections to be created before their target components exist, solving initialization order problems. The system can connect any graph entities - blocks, anchors, groups, or custom components.

Ports have unique identifiers based on their type:
- **Block Point Ports**: `"blockId_input"` (left side), `"blockId_output"` (right side)
- **Anchor Ports**: `"blockId/anchorId"` for specific anchor points
- **Custom Entity Ports**: Any format for groups (`"groupId_connection_point"`) or custom components

When you create connections using `sourceBlockId`/`targetBlockId`, the system automatically resolves them to port IDs. Without anchors, it uses default block points (`block-1_output` → `block-2_input`). With anchors, it creates anchor ports (`block-1/output` → `block-2/input`).

For advanced use cases, specify port IDs directly to connect any entities:

```typescript
// Connect different entity types using direct port IDs
const connections = [
   // Block to block (using port IDs directly)
  { 
    id: "connection-1",
    sourcePortId: "block-1_output",
    targetPortId: "block-2_input"
  },
  // Block to group
  {
    id: "connection-2",
    sourcePortId: "block-1_output",
    targetPortId: "group-1_connection_point"
  },
  // Group to group
  {
    id: "connection-3",
    sourcePortId: "group-1_output",
    targetPortId: "group-2_input"
  },
  // Block to custom
  {
    id: "connection-4",
    sourcePortId: "block-1_output",
    targetPortId: "custom-component/endpoint"
  }
];
```

This flexible system provides universal connections, lazy initialization, extensibility for new entity types, and consistent API regardless of what you're connecting.

### Port Management API

For advanced use cases, you can manage ports directly using the port management API:

```typescript
// Claim ownership of a port (for blocks, anchors)
const port = graph.rootStore.connectionsList.claimPort("block-1_output", ownerComponent);

// Release ownership when component is destroyed
graph.rootStore.connectionsList.releasePort("block-1_output", ownerComponent);

// Observe port changes (for connections)
const port = graph.rootStore.connectionsList.observePort("block-1_output", observerComponent);

// Stop observing when no longer needed
graph.rootStore.connectionsList.unobservePort("block-1_output", observerComponent);

// Check if port exists
if (graph.rootStore.connectionsList.hasPort("block-1_output")) {
  const port = graph.rootStore.connectionsList.getPort("block-1_output");
}
```

**Ownership Model**: Components that own ports (blocks, anchors) are responsible for updating port coordinates. Components that observe ports (connections) read coordinates for rendering but don't control them. Ports are automatically cleaned up when they have no owner and no observers.

## Styling and Visual Customization

Global settings control the visual appearance the default [BlockConnection](../../src/components/canvas/connections/BlockConnection.md) and behavior of all connections in your graph:

```typescript
graph.updateSettings({
  useBezierConnections: true,           // Enable curved connections
  bezierConnectionDirection: "horizontal", // "horizontal" or "vertical"
  showConnectionArrows: true,           // Show direction arrows
  showConnectionLabels: true,           // Show text labels
  canCreateNewConnections: true         // Allow user to create connections
});
```

Individual connections can have custom styling and labels. Set the `label` property to add text, and use `styles` for custom colors and dash patterns:

```typescript
const styledConnection = {
  id: "styled-connection",
  sourceBlockId: "block-1",
  targetBlockId: "block-2",
  label: "Data Flow",
  styles: {
    background: "#ff6b6b",           // Connection color
    selectedBackground: "#e63946",   // Color when selected
    dashes: [8, 4]                   // Dash pattern [dash, gap]
  },
  dashed: true                       // Enable dash pattern
};
```

Labels and arrows automatically respect zoom levels - they appear only when zoomed in enough for comfortable viewing. The system optimizes performance by grouping connections with similar visual properties for batch rendering.

## Advanced Connection Features

**Interactive Features** are built-in. Connections automatically respond to hover and selection states with visual feedback. Use the selection API to programmatically select connections:

```typescript
// Select connections and listen to changes
graph.api.selectConnections(["connection-1"], true);
graph.on("connection-selection-change", (event) => {
  console.log("Selected connections:", event.detail.list);
});

// Handle connection clicks
graph.on("connection-click", (event) => {
  console.log("Clicked connection:", event.detail.connection.id);
});
```

## Working with Connection Data

Manage connections through the graph API. Add single connections using the connection store, or batch multiple connections for better performance:

```typescript
// Add single connection
const connectionId = graph.rootStore.connectionsList.addConnection({
  sourceBlockId: "block-1",
  targetBlockId: "block-2"
});

// Add multiple connections (preferred for performance)
graph.setEntities({ 
  connections: [
    { id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" },
    { id: "conn-2", sourceBlockId: "block-2", targetBlockId: "block-3" }
  ]
});
```

Update existing connections by modifying their properties. You can change labels, styling, or any other connection data:

```typescript
graph.updateConnections([
  {
    id: "connection-1",
    label: "Updated Label",
    styles: { background: "#4caf50" }
  }
]);
```

Remove connections either by deleting selected ones or by specifying connection IDs:

```typescript
// Delete selected connections
graph.rootStore.connectionsList.deleteSelectedConnections();

// Delete specific connections
const connectionsToDelete = graph.rootStore.connectionsList.getConnections(["conn-1", "conn-2"]);
graph.rootStore.connectionsList.deleteConnections(connectionsToDelete);
```

## Advanced Connection Configuration

### Zoom-Based Visibility
Labels and arrows automatically respect zoom levels when enabled globally:

```typescript
// Enable labels and arrows globally
graph.updateSettings({
  showConnectionLabels: true,  // Shows only when zoomed in enough
  showConnectionArrows: true   // Shows only when zoomed in enough
});

// Connection with label - visibility controlled by zoom and global settings
const connection = {
  id: "zoom-aware",
  sourceBlockId: "block-1",
  targetBlockId: "block-2",
  label: "Process Data"
};
```

## Performance and Scale

The connection system is optimized for handling large numbers of connections efficiently:

- **Automatic Batching**: Connections with similar visual properties are grouped together for optimal rendering
- **Zoom-Aware Rendering**: Complex visual elements (labels, arrows) appear only when zoomed in
- **Lazy Updates**: Connection geometry is calculated only when source or target positions change
- **Efficient Hit Detection**: Smart collision detection for user interactions

### Working with Many Connections

```typescript
// Efficiently add many connections at once
const connections = [];
for (let i = 0; i < 1000; i++) {
  connections.push({
    id: `conn-${i}`,
    sourceBlockId: `block-${i}`,
    targetBlockId: `block-${i + 1}`,
    styles: { background: i % 2 ? "#blue" : "#red" }
  });
}

// Single operation for best performance
graph.setEntities({ connections });
```

## Configuration Examples

### Complete Connection Setup
Example of a fully configured connection with graph settings:

```typescript
// Configure global connection settings
graph.updateSettings({
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  showConnectionArrows: true,
  showConnectionLabels: true
});

// Create a styled connection
const fullConnection = {
  id: "complete-example",
  
  // Connection endpoints
  sourceBlockId: "input-block",
  sourceAnchorId: "output",
  targetBlockId: "process-block", 
  targetAnchorId: "input",
  
  // Connection-specific properties
  label: "Data Pipeline",
  
  // Styling
  styles: {
    background: "#2196f3",
    selectedBackground: "#1976d2",
    dashes: [10, 5]
  },
  dashed: true,
  
  // Selection state
  selected: false
};
```

### Dynamic Connection Updates
Example of updating connections based on application state:

```typescript
// Update connection color based on data flow status
function updateConnectionStatus(connectionId: string, status: "active" | "idle" | "error") {
  const colors = {
    active: "#4caf50",
    idle: "#757575", 
    error: "#f44336"
  };
  
  graph.updateConnections([{
    id: connectionId,
    styles: { background: colors[status] }
  }]);
}
```

## Custom Connection Types

You can create custom connection implementations by extending the base connection classes to add specific rendering logic or behavior.

### Extending BaseConnection

For custom connections with basic functionality:

```typescript
import { BaseConnection } from "@gravity-ui/graph";

class SimpleLineConnection extends BaseConnection {
  protected render() {
    if (!this.connectionPoints) return;
    
    const [source, target] = this.connectionPoints;
    const ctx = this.context.ctx;
    
    // Custom rendering logic
    this.context.ctx.strokeStyle = this.state.selected ? "#ff0000" : "#000000";
    this.context.ctx.lineWidth = 3;
    this.context.ctx.beginPath();
    this.context.ctx.moveTo(source.x, source.y);
    this.context.ctx.lineTo(target.x, target.y);
    this.context.ctx.stroke();
  }
}
```

### Extending BlockConnection

For optimized connections with advanced features. BlockConnection automatically handles performance optimization through batch rendering - see [Batch Rendering System](batch-rendering.md) for technical details on how this works internally.

```typescript
import { BlockConnection } from "@gravity-ui/graph";

class CustomPathConnection extends BlockConnection {
  // Override path creation for custom geometry
  public createPath(): Path2D {
    const path = new Path2D();
    const { x1, y1, x2, y2 } = this.geometry;
    
    // Create zigzag path
    const midX = (x1 + x2) / 2;
    const offset = 20;
    
    path.moveTo(x1, y1);
    path.lineTo(midX - offset, y1);
    path.lineTo(midX + offset, y2);
    path.lineTo(x2, y2);
    
    return path;
  }
  
  // Override styling
  public style(ctx: CanvasRenderingContext2D) {
    this.context.ctx.strokeStyle = this.state.hovered ? "#ff6b6b" : "#4285f4";
    this.context.ctx.lineWidth = this.state.selected ? 4 : 2;
    this.context.ctx.setLineDash(this.state.dashed ? [8, 4] : []);
    return { type: "stroke" };
  }
}
```

### Custom Connection with Special Rendering

Example of a connection with custom visual elements:

```typescript
class AnimatedConnection extends BlockConnection {
  private animationPhase = 0;
  protected render() {
    const [source, target] = this.connectionPoints;
    
    // Calculate particle positions based on animation phase
    for (let i = 0; i < 3; i++) {
      const progress = (this.animationPhase + i * 0.3) % 1;
      const x = source.x + (target.x - source.x) * progress;
      const y = source.y + (target.y - source.y) * progress;
      
      this.context.ctx.fillStyle = "#ffeb3b";
      this.context.ctx.beginPath();
      this.context.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.context.ctx.fill();
    }
    
    this.animationPhase += 0.02;
    if (this.animationPhase > 1) this.animationPhase = 0;
  }
}
```

### Registering Custom Connection Types

Register your custom connection in graph settings:

```typescript
import { Graph } from "@gravity-ui/graph";

// Configure graph to use custom connection type
const graph = new Graph(container, {
  settings: {
    connection: CustomPathConnection, // Use your custom class
    // other settings...
  }
});
```

### When to Use Custom Connections

- **BaseConnection**: When you need simple custom rendering without performance optimization
- **BlockConnection**: When you need optimized rendering with batching, arrows, and labels
- **Custom Logic**: When you need special interaction handling or animation
- **Domain-Specific**: For connections that represent specific concepts in your application

## Best Practices

### Connection Creation

1. **Use batch operations for multiple connections**:
   ```typescript
   // Good: Single operation for many connections
   graph.setEntities({ connections: connectionArray });
   
   // Avoid: Individual operations in loops
   connectionArray.forEach(conn => graph.addConnection(conn));
   ```
