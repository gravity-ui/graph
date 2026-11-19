# Connection System: Connecting Blocks in Your Graph

The Connection System allows you to create visual links between blocks in your graph. It supports different types of connections, from simple straight lines to complex curved paths with multiple points.

## Key Features

- **Flexible Connection Types**: Straight lines, bezier curves, and multi-point connections
- **Visual Customization**: Colors, dash patterns, line thickness, and arrows, from data or from a line class
- **Interactive Elements**: Hover effects, selection states, and clickable labels
- **Performance Optimized**: Built-in connections share the scene renderer with blocks in Canvas2D or WebGL2
- **WebGL Effects**: Animated dashes, comets, pulses and custom shader effects with the WebGL renderer
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

graph.api.addConnection(connection);
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
const port = graph.connections.claimPort("block-1_output", ownerComponent);

// Release ownership when component is destroyed
graph.connections.releasePort("block-1_output", ownerComponent);

// Observe port changes (for connections)
graph.connections.observePort("block-1_output", observerComponent);

// Stop observing when no longer needed
graph.connections.unobservePort("block-1_output", observerComponent);

// Check if port exists
if (graph.connections.hasPort("block-1_output")) {
  const port = graph.connections.getPort("block-1_output");
}
```

**Ownership Model**: Components that own ports (blocks, anchors) are responsible for updating port coordinates. Components that observe ports (connections) read coordinates for rendering but don't control them. Ports are automatically cleaned up when they have no owner and no observers.

### Port Delegation

While delegated, a port follows the final delegate's position. Updates to the original port are saved until it is undelegated. Moving the delegate moves the drawn
connection and its hit area. A collapsed group uses this to attach connections to its edge. A multipoint route keeps its
stored bends and substitutes the delegated endpoint for its first or last point. Expanding the group restores the
original route. A connection waits for both effective endpoints to resolve before drawing. For ports owned by
blocks or their anchors, visibility follows the original blocks. When both blocks are hidden, their connection
is hidden even if the ports delegate to visible group edges.

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

The standard `label` appears at the configured zoom threshold. To style visual states across multiple connections,
add a tag and target the `line`, `arrow`, `labelBackground` or `label` part. A matching rule can override the
color in the connection data or set a camera-aware width. See [Scene styles](webgl-connections.md#scene-styles).

These fields feed the default stroke of the connection's line class: `styles.background` / `styles.selectedBackground`
for the color, width 2 (4 hovered or selected), and `dashed` with `styles.dashes` for the dash. A line class that
overrides `getStroke(state)` decides the color, width and dash from any connection data; see
[Custom Connection Types](#custom-connection-types).

## Advanced Connection Features

**Interactive Features** are built-in. Connections automatically respond to hover and selection states with visual feedback. Use the selection API to programmatically select connections:

```typescript
import { BlockConnection } from "@gravity-ui/graph";

// Select connections and listen to changes
graph.api.selectConnections(["connection-1"], true);
graph.on("connection-selection-change", (event) => {
  console.log("Selected connections:", event.detail.list);
});

// Handle connection clicks
graph.on("click", ({ detail: { target } }) => {
  if (target instanceof BlockConnection) console.log("Clicked connection:", target.getEntityId());
});
```

## Working with Connection Data

Add one connection with `graph.api.addConnection()` or add and update several in one `graph.updateEntities()`
call. An existing connection keeps fields omitted from a patch. Use `graph.setEntities({ blocks, connections })`
when loading a complete graph snapshot. It replaces both collections and clears omitted fields on existing IDs.
Passing only `connections` to `setEntities` empties the blocks collection.

```typescript
// Add single connection
const connectionId = graph.api.addConnection({
  sourceBlockId: "block-1",
  targetBlockId: "block-2"
});

// Add multiple connections (preferred for performance)
graph.updateEntities({
  connections: [
    { id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" },
    { id: "conn-2", sourceBlockId: "block-2", targetBlockId: "block-3" }
  ]
});
```

Update existing connections by modifying their properties. You can change labels, styling, or any other connection data:

```typescript
graph.api.updateConnection("connection-1", {
  label: "Updated Label",
  styles: { background: "#4caf50" }
});
```

Remove connections either by deleting selected ones or by specifying connection IDs:

```typescript
// Delete selected connections
graph.connections.deleteSelectedConnections();

// Delete specific connections
const connectionsToDelete = graph.connections.getConnections(["conn-1", "conn-2"]);
graph.connections.deleteConnections(connectionsToDelete);
```

## Advanced Connection Configuration

### Zoom-Based Visibility
The standard `label` uses `showConnectionLabels` and `connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL`.
The arrow uses `showConnectionArrows` at every zoom. On a `MultipointConnection`, the additional `labels`
array supplies explicitly positioned labels with their own rectangles.

```typescript
// Enable labels and arrows globally
graph.updateSettings({
  showConnectionLabels: true,  // Shows only when zoomed in enough
  showConnectionArrows: true   // Draw the arrow supplied by the geometry
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

Built-in lines, Béziers and polylines use the renderer in `graph.updateSettings({ renderer: "webgl" })`
or the default Canvas2D renderer. Each connection publishes its shaft, arrow and labels in a single scene
element. Both renderers use its geometry for culling and hit testing. Pan and zoom reuse the route as
the visible area and level of detail change.

The same connection class works when you switch with `graph.scene.setRenderer("canvas")` or
`graph.scene.setRenderer("webgl")`. Add a shader effect to the stock line with a tag rule, or return one
from a custom line’s stroke. See [Connection lines, geometry and effects](webgl-connections.md).

### Working with Many Connections

```typescript
// Efficiently add many connections at once
const connections = [];
for (let i = 0; i < 1000; i++) {
  connections.push({
    id: `conn-${i}`,
    sourceBlockId: `block-${i}`,
    targetBlockId: `block-${i + 1}`,
    styles: { background: i % 2 ? "#4285f4" : "#e5484d" }
  });
}

// Single operation for best performance
graph.updateEntities({ connections });
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
  dashed: true
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
  
  graph.api.updateConnection(connectionId, { styles: { background: colors[status] } });
}
```

## Custom Connection Types

You can create custom connection implementations by extending the base connection classes to add specific rendering logic or behavior.

A `BlockConnection` has two pluggable parts, set as statics of its class:

- `static geometry`: the shape, a pure function from the endpoints, `points` and the connection's data to cubic Bézier
  segments and an arrow. Bounds and hit testing follow it.
- `static line` defaults to `SceneLine`. Extend it to derive the stroke and arrow style from connection data.
  Both scene renderers draw the same returned stroke. WebGL also runs its optional shader effect.

`BlockConnection` is retained. Its scene element updates when its data, style or ports change. A
line that overrides a Canvas painting hook, a connection with custom Canvas decorations, or an immediate-mode
`BlockConnection` uses the GraphLayer Canvas compatibility batch. An immediate component also receives
per-frame `render()` calls. See [Connection lines](webgl-connections.md#lines) and
[retained components](../migration-guides/v1-to-v2.md#retained-components-connections-outside-the-frame-walk).

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

Use `BlockConnection` for a custom route with the built-in interaction, labels and arrows.

A custom shape is a geometry; a custom look is a line class whose `getStroke(state)` returns the color, width and
dash:

```typescript
import { BlockConnection, SceneLine, lineSegment } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnectionGeometryFn, TLineStroke } from "@gravity-ui/graph";

// A zigzag through the middle; both renderers draw, bound and hit-test it.
const zigzagGeometry: TConnectionGeometryFn = ({ source, target }) => {
  const midX = (source.x + target.x) / 2;
  const a = { x: midX - 20, y: source.y };
  const b = { x: midX + 20, y: target.y };
  return { segments: new Float32Array([...lineSegment(source, a), ...lineSegment(a, b), ...lineSegment(b, target)]) };
};

class ZigzagLine extends SceneLine {
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

For a Canvas-specific shape, override `SceneLine.createPath(geometry)`. For a gradient, shadow or fill, override
`style(ctx)`. These hooks draw the affected connection in the [Canvas compatibility batch](batch-rendering.md)
with either scene renderer.

### Custom Labels and Badges

The stock label and its background share the connection's scene element. For imperative Canvas drawing,
override `renderLabelText()`. This routes the connection through the GraphLayer compatibility batch. Its label
pass runs after that batch and culls labels by `labelGeometry`, so a label can draw when the shaft is offscreen.

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

A scene tag rule or a `SceneLine` stroke can supply a library effect (`dashFlow` for running dashes and
comets, `pulse` for a brightness wave) or your own shader from `defineConnectionEffect()`.

```typescript
import { BlockConnection, SceneLine, dashFlow } from "@gravity-ui/graph";
import type { TBaseConnectionState, TSceneLineStroke } from "@gravity-ui/graph";

class CometLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const stroke = super.getStroke(state);
    // dashFlow draws the dash itself: the base stroke has no `dash`.
    return { ...stroke, dash: undefined, effect: dashFlow.use({ pattern: [80, 180], speed: 120, fade: true }) };
  }
}

class CometConnection extends BlockConnection {
  public static override line = CometLine;
}
```

The scene's Canvas2D renderer draws the base stroke, including when the WebGL context is lost. See [Effects](webgl-connections.md#effects) for custom shaders, uniforms and
per-connection parameters.

Extra Canvas2D content on top of the line goes into `afterRender(ctx)`, with its bounds from
`getAfterRenderBounds()`; only the Path2D batch calls it. A subclass that draws every frame in `render()` stays
possible: it declares `static override readonly mode = "immediate"` and is walked again:

```typescript
import { BlockConnection } from "@gravity-ui/graph";

class AnimatedConnection extends BlockConnection {
  // Drawn in render() every frame: keep this subclass in the frame walk.
  public static override readonly mode = "immediate";

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
const graph = new Graph({ settings: { connection: CustomPathConnection } }, container);
```

### When to Use Custom Connections

- Use `BlockConnection` for a scene connection. Set `static geometry` for a custom route.
- Use a tag style for the built-in line or extend `SceneLine` for data-dependent strokes and effects.
- Use the same line class’s Canvas hooks for a custom `Path2D`, gradient or shadow. See [Batch Rendering](batch-rendering.md).
- Extend `BaseConnection` for a component that owns its drawing and hit geometry.
