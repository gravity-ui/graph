# Connection System: Connecting Blocks in Your Graph

The Connection System allows you to create visual links between blocks in your graph. It supports different types of connections, from simple straight lines to complex curved paths with multiple points.

## Key Features

- **Flexible Connection Types**: Straight lines, bezier curves, and multi-point connections
- **Visual Customization**: Colors, dash patterns, line thickness, and arrows, from data or from a line class
- **Interactive Elements**: Hover effects, selection states, and clickable labels
- **Performance Optimized**: Efficient rendering of thousands of connections, with Canvas2D or WebGL2
- **WebGL Effects**: Animated dashes, comets, pulses and custom shader effects on WebGL lines
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

### Port Delegation

While delegated, a port mirrors another port’s position; `setPoint()` on the owner is stored and applied again on `undelegate()`. `CollapsibleGroup` uses this so connections attach to group edge ports when collapsed.

```typescript
blockPort.delegate(groupEdgePort);
blockPort.getPoint(); // groupEdgePort position
blockPort.undelegate(); // restores saved position
```

## Styling and Visual Customization

Global settings control the visual appearance of the default [BlockConnection](../../src/components/canvas/connections/BlockConnection.ts) and the behavior of all connections in your graph:

```typescript
graph.updateSettings({
  useBezierConnections: true,           // Enable curved connections
  bezierConnectionDirection: "horizontal", // "horizontal" or "vertical"
  showConnectionArrows: true,           // Show direction arrows
  showConnectionLabels: true,           // Show text labels
});
// To let users create connections, add ConnectionEditingLayer from @gravity-ui/graph-connection-editing.
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

Labels automatically respect zoom levels - they appear only when zoomed in enough for comfortable viewing. The system optimizes performance by grouping connections with similar visual properties for batch rendering.

These fields feed the default stroke of the connection's line class: `styles.background` / `styles.selectedBackground`
for the color, width 2 (4 hovered or selected), and `dashed` with `styles.dashes` for the dash. A line class that
overrides `getStroke(state)` decides the color, width and dash from any connection data; see
[Custom Connection Types](#custom-connection-types).

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
- **Two Renderers**: Canvas2D `Path2D` by default; WebGL2 for a connection class whose line is a `WebGLLine`, which
  pays off for dashes, effects and per-connection styles on large graphs (see
  [Connection Lines, Geometry and WebGL](webgl-connections.md))
- **Zoom-Aware Rendering**: Labels appear only when zoomed in
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

A `BlockConnection` has two pluggable parts, set as statics of its class:

- `static geometry`: the shape, a pure function from the endpoints, `points` and the connection's data to cubic Bézier
  segments and an arrow. Bounds and hit testing follow it.
- `static line`: how lines are drawn. `Path2DLine` (the default) draws with Canvas2D and may draw any shape;
  `WebGLLine` draws the geometry with WebGL2 and may carry effects. The line class picks the renderer of the whole
  graph.

The look (`getStroke()`, `style()`) lives in the line class; the component keeps data, state, interaction, the z-level
and the label. See [Connection Lines, Geometry and WebGL](webgl-connections.md) for the whole API.

`BlockConnection` and its subclasses are *detached*: the frame does not walk them; the batch draws their lines and
arrows and the label pass their labels. They update when their data changes (`propsChanged`, `stateChanged`,
`willIterate`, geometry hooks) and never receive `render()` or other per-frame hooks. Draw labels in
`renderLabelText()` and other extra content in `afterRender()`, which the Path2D batch runs (WebGL does not); a
subclass that must draw every frame declares `static detached = false`. `BaseConnection` subclasses are walked and
draw in `render()`. See [Detached components](../migration-guides/v1-to-v2.md#detached-components-connections-outside-the-frame-walk).

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

A custom shape is a geometry; a custom look is a line class whose `getStroke(state)` returns the color, width and
dash:

```typescript
import { BlockConnection, Path2DLine, lineSegment } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnectionGeometryFn, TLineStroke } from "@gravity-ui/graph";

// A zigzag through the middle; both renderers draw, bound and hit-test it.
const zigzagGeometry: TConnectionGeometryFn = ({ source, target }) => {
  const midX = (source.x + target.x) / 2;
  const a = { x: midX - 20, y: source.y };
  const b = { x: midX + 20, y: target.y };
  return { segments: new Float32Array([...lineSegment(source, a), ...lineSegment(a, b), ...lineSegment(b, target)]) };
};

class ZigzagLine extends Path2DLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    // Hover and selection change the color and the width, as for the default stroke; the dash stays.
    return this.withInteraction({ color: "#4285f4", width: 2, dash: state.dashed ? { pattern: [8, 4] } : undefined }, state);
  }
}

class CustomPathConnection extends BlockConnection {
  public static override geometry = zigzagGeometry;
  public static override line = ZigzagLine;
}
```

Connections with one stroke share a style group and are drawn together; the group follows `getStroke()`. A
`Path2DLine` subclass can also override `createPath(geometry)` for any Canvas2D shape and `style(ctx)` for gradients,
shadows or fills; a `WebGLLine` subclass returns the same strokes, plus effects, from `getStroke()`.

### Custom Labels and Badges

Labels are drawn by the layer's label pass, after every connection line and arrow and before blocks, by z-level
(labels of selected and hovered connections on top). Each label is culled by its own rectangle (`labelGeometry`), so a
label can be drawn while its line is outside the viewport. `BlockConnection` does not draw its label in `afterRender`
anymore: to replace the standard label, override `renderLabelText()`.

Prepare custom label bounds in `updateLabelGeometry()`, then draw in `renderLabelText()`. Call `super.updateLabelGeometry(props)` first to obtain the standard label's current position and size, including zoom and label visibility. This example adds a square status badge before the text:

```typescript
import { BlockConnection, type TConnection, type TConnectionProps, type TRect } from "@gravity-ui/graph";

function getBadgeBounds(label: TRect): TRect {
  return { x: label.x - label.height - 4, y: label.y, width: label.height, height: label.height };
}

class BadgeConnection extends BlockConnection<TConnection> {
  private badgeGeometry?: TRect;

  protected override updateLabelGeometry(props: TConnectionProps): void {
    super.updateLabelGeometry(props);
    const label = this.labelGeometry;
    this.badgeGeometry = label ? getBadgeBounds(label) : undefined;
    if (!label || !this.badgeGeometry) return;

    this.labelGeometry = {
      ...label,
      x: this.badgeGeometry.x,
      width: label.x + label.width - this.badgeGeometry.x,
    };
  }

  protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
    if (this.badgeGeometry) {
      const { x, y, width, height } = this.badgeGeometry;
      ctx.save();
      ctx.fillStyle = "#4285f4";
      ctx.fillRect(x, y, width, height);
      ctx.restore();
    }
    super.renderLabelText(ctx);
  }
}

graph.updateSettings({ connection: BadgeConnection, showConnectionLabels: true });
// Both the badge and text follow this setting and the standard zoom threshold.
graph.updateSettings({ showConnectionLabels: false });
graph.updateSettings({ showConnectionLabels: true });
```

The protected `labelGeometry` describes the combined bounds for culling and hit testing. Connection batches do not include it: a connection's batch bounds come from its geometry (the line's `getBounds()`) plus the arrow points, not from `getBBox()`, so a subclass that paints extra content in its own `afterRender` must report it from `getAfterRenderBounds()`. The line's chunk is culled by the line and the arrow, the label pass by `labelGeometry`. The base class keeps its own cached paint rectangle, so `super.renderLabelText()` draws only the standard label and does not paint over the badge. Preparing the combined bounds before painting makes them available in the same frame, including when only the badge intersects the viewport.

Existing overrides that calculate decoration bounds only inside `renderLabelText()` can still draw their decoration, but cannot make an initially offscreen connection visible through that decoration alone: viewport selection has already happened. Move that calculation to `updateLabelGeometry()` as above; the hook also clears stale decoration geometry when labels are disabled or hidden by zoom.

Apply custom visibility conditions in that hook as well. For a label shown only while the connection
is selected, call `super.updateLabelGeometry(props)` and clear `this.labelGeometry` when
`this.state.selected` is false. This keeps viewport selection and hit testing consistent with painting
as selection changes, including when the line itself is outside the viewport.

### Custom Connection with Special Rendering

Animation belongs to WebGL lines: `Path2DLine` never animates, while a `WebGLLine` stroke can carry a library effect
(`dashFlow` for running dashes and comets, `pulse` for a brightness wave) or a shader effect of your own from
`defineConnectionEffect()`, drawn for every connection in the batch:

```typescript
import { BlockConnection, WebGLLine, dashFlow } from "@gravity-ui/graph";
import type { TBaseConnectionState, TWebGLStroke } from "@gravity-ui/graph";

class CometLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    // dashFlow draws the dash itself: the base stroke has no `dash`.
    return { ...stroke, dash: undefined, effect: dashFlow.use({ pattern: [80, 180], speed: 120, fade: true }) };
  }
}

class CometConnection extends BlockConnection {
  public static override line = CometLine;
}
```

While WebGL is unavailable, Path2D draws the same lines with each effect's fallback stroke (a still dash for
`dashFlow`), with no animation. See [Effects](webgl-connections.md#effects) for custom shaders, uniforms and
per-connection parameters.

Extra Canvas2D content on top of the line goes into `afterRender(ctx)`, with its bounds from
`getAfterRenderBounds()`; only the Path2D batch calls it. A subclass that draws every frame in `render()` stays
possible: it declares `static detached = false` and is walked again:

```typescript
import { BlockConnection } from "@gravity-ui/graph";

class AnimatedConnection extends BlockConnection {
  // Drawn in render() every frame: keep this subclass in the frame walk.
  public static override readonly detached = false;

  private animationPhase = 0;

  protected override render(): void {
    if (!this.connectionPoints) return;
    const [source, target] = this.connectionPoints;
    const ctx = this.context.ctx;

    // Particle positions from the animation phase
    for (let i = 0; i < 3; i++) {
      const progress = (this.animationPhase + i * 0.3) % 1;
      const x = source.x + (target.x - source.x) * progress;
      const y = source.y + (target.y - source.y) * progress;
      ctx.fillStyle = "#ffeb3b";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    this.animationPhase = (this.animationPhase + 0.02) % 1;
    // Request the next frame.
    this.performRender();
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
- **BlockConnection**: When you need optimized rendering with batching, arrows, and labels; set `static geometry` for
  the shape and `static line` for the look
- **WebGLLine**: When you need animation, effects, dashes or per-connection styles on large graphs
- **Custom Logic**: When you need special interaction handling
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
