# Drag System

The Drag System provides a centralized way to handle drag operations for all graph components. It automatically manages drag lifecycle, autopanning, cursor states, and coordinates movement across multiple selected components.

## Overview

When a user drags components on the graph:
1. **DragService** intercepts the mouse events
2. Collects all selected draggable components
3. Manages the drag lifecycle (start → update → end)
4. Handles autopanning near canvas edges
5. Synchronizes cursor state
6. Delegates actual movement to components via lifecycle methods

### Key Benefits

- **Unified Drag Behavior**: All draggable components use the same drag system
- **Multi-Selection Support**: Drag multiple selected components simultaneously
- **Automatic Autopanning**: Camera moves when dragging near canvas edges
- **Reactive State**: Track drag state for conditional behaviors (e.g., disable snapping)
- **Type Safety**: Full TypeScript support with typed contexts and diffs

## Basic Usage

### Accessing Drag State

The `DragService` exposes a reactive `$state` signal that you can use to track the current drag operation:

```typescript
import { Graph } from "@gravity-ui/graph";

const graph = new Graph(config, container);

// Subscribe to drag state changes
graph.dragService.$state.subscribe((state) => {
  if (state.isDragging) {
    console.log("Dragging", state.components.length, "components");
    console.log("Component types:", [...state.componentTypes]);
    console.log("Is homogeneous:", state.isHomogeneous);
  }
});
```

### Drag State Properties

| Property | Type | Description |
|----------|------|-------------|
| `isDragging` | `boolean` | Whether a drag operation is in progress |
| `components` | `GraphComponent[]` | Components participating in the drag |
| `componentTypes` | `Set<string>` | Set of component type names (constructor names) |
| `isMultiple` | `boolean` | Whether multiple components are being dragged |
| `isHomogeneous` | `boolean` | Whether all components are of the same type |

### Example: Conditional Behavior Based on Drag State

```typescript
// Disable snap-to-grid when dragging heterogeneous components
function shouldSnapToGrid(graph: Graph): boolean {
  const { isDragging, isHomogeneous, componentTypes } = graph.dragService.$state.value;
  
  // Only snap when dragging blocks of the same type
  if (isDragging && !isHomogeneous) {
    return false;
  }
  
  // Only snap for Block components
  if (isDragging && !componentTypes.has("Block")) {
    return false;
  }
  
  return true;
}
```

## Creating Draggable Components

To make a custom `GraphComponent` draggable, override the drag lifecycle methods:

### Step 1: Enable Dragging

Override `isDraggable()` to return `true` when the component should be draggable:

```typescript
import { GraphComponent } from "@gravity-ui/graph";

class MyCustomComponent extends GraphComponent {
  public override isDraggable(): boolean {
    // Draggable when not locked and geometry changes are allowed
    return !this.props.locked && this.canChangeGeometry();
  }
}
```

### Step 2: Handle Drag Start

Override `handleDragStart()` to initialize drag state:

```typescript
import { DragContext } from "@gravity-ui/graph";

class MyCustomComponent extends GraphComponent {
  private initialPosition: { x: number; y: number } | null = null;

  public override handleDragStart(context: DragContext): void {
    // Store initial position for absolute positioning
    this.initialPosition = {
      x: this.state.x,
      y: this.state.y,
    };
    
    // Emit custom event
    this.context.graph.emit("my-component-drag-start", {
      component: this,
      position: this.initialPosition,
    });
  }
}
```

### Step 3: Handle Drag Updates

Override `handleDrag()` to update component position during drag:

```typescript
import { DragDiff, DragContext } from "@gravity-ui/graph";

class MyCustomComponent extends GraphComponent {
  public override handleDrag(diff: DragDiff, context: DragContext): void {
    if (!this.initialPosition) return;

    // Option 1: Use absolute diff (relative to drag start)
    const newX = this.initialPosition.x + diff.diffX;
    const newY = this.initialPosition.y + diff.diffY;

    // Option 2: Use incremental delta (frame-to-frame movement)
    // const newX = this.state.x + diff.deltaX;
    // const newY = this.state.y + diff.deltaY;

    this.updatePosition(newX, newY);
  }
}
```

### Step 4: Handle Drag End

Override `handleDragEnd()` to finalize the drag operation:

```typescript
import { DragContext } from "@gravity-ui/graph";

class MyCustomComponent extends GraphComponent {
  public override handleDragEnd(context: DragContext): void {
    // Clean up drag state
    this.initialPosition = null;
    
    // Update hit box for accurate hit testing
    this.updateHitBox(this.state);
    
    // Emit custom event
    this.context.graph.emit("my-component-drag-end", {
      component: this,
      position: { x: this.state.x, y: this.state.y },
    });
  }
}
```

## DragDiff Reference

The `DragDiff` object provides coordinate information during drag:

| Property | Type | Description |
|----------|------|-------------|
| `startCoords` | `[number, number]` | World coordinates when drag started |
| `prevCoords` | `[number, number]` | World coordinates from previous frame |
| `currentCoords` | `[number, number]` | Current world coordinates |
| `diffX` | `number` | Absolute X displacement from start (`currentCoords[0] - startCoords[0]`) |
| `diffY` | `number` | Absolute Y displacement from start (`currentCoords[1] - startCoords[1]`) |
| `deltaX` | `number` | Incremental X change since last frame (`currentCoords[0] - prevCoords[0]`) |
| `deltaY` | `number` | Incremental Y change since last frame (`currentCoords[1] - prevCoords[1]`) |

### When to Use `diffX/diffY` vs `deltaX/deltaY`

**Use `diffX/diffY` (absolute)** when you need position relative to drag start:
```typescript
// Good for: Restoring to initial position + offset
const newX = this.initialPosition.x + diff.diffX;
const newY = this.initialPosition.y + diff.diffY;
```

**Use `deltaX/deltaY` (incremental)** when you need frame-to-frame movement:
```typescript
// Good for: Accumulating position changes
const newX = this.state.x + diff.deltaX;
const newY = this.state.y + diff.deltaY;
```

## DragContext Reference

The `DragContext` object provides additional information about the drag operation:

| Property | Type | Description |
|----------|------|-------------|
| `sourceEvent` | `MouseEvent` | The native mouse event |
| `startCoords` | `[number, number]` | World coordinates when drag started |
| `prevCoords` | `[number, number]` | World coordinates from previous frame |
| `currentCoords` | `[number, number]` | Current world coordinates |
| `components` | `GraphComponent[]` | All components participating in this drag |

### Example: Coordinated Multi-Component Behavior

```typescript
public override handleDrag(diff: DragDiff, context: DragContext): void {
  // Check if this is a multi-component drag
  if (context.components.length > 1) {
    // Skip individual snapping when dragging multiple items
    this.moveWithoutSnapping(diff.deltaX, diff.deltaY);
  } else {
    // Apply snapping for single item drag
    this.moveWithSnapping(diff.deltaX, diff.deltaY);
  }
}
```

## React Integration

### Reacting to Drag State Changes

```tsx
import { useEffect, useState } from "react";
import { useGraph, DragState } from "@gravity-ui/graph";

function DragIndicator() {
  const { graph } = useGraph();
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!graph) return;

    const unsubscribe = graph.dragService.$state.subscribe((state) => {
      setDragState(state);
    });

    return unsubscribe;
  }, [graph]);

  if (!dragState?.isDragging) return null;

  return (
    <div className="drag-indicator">
      Dragging {dragState.components.length} item(s)
      {!dragState.isHomogeneous && " (mixed types)"}
    </div>
  );
}
```

### Disabling UI During Drag

```tsx
function Toolbar() {
  const { graph } = useGraph();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!graph) return;

    const unsubscribe = graph.dragService.$state.subscribe((state) => {
      setIsDragging(state.isDragging);
    });

    return unsubscribe;
  }, [graph]);

  return (
    <div className="toolbar">
      <button disabled={isDragging}>Add Block</button>
      <button disabled={isDragging}>Delete Selected</button>
    </div>
  );
}
```

## Block Drag Events

The built-in `Block` component emits events during drag operations that you can listen to:

| Event | Description | Payload |
|-------|-------------|---------|
| `block-drag-start` | Fires when block drag starts | `{ nativeEvent, block }` |
| `block-drag` | Fires on each drag frame | `{ nativeEvent, block, x, y }` |
| `block-drag-end` | Fires when block drag ends | `{ nativeEvent, block }` |

### Example: Listening to Block Drag Events

```typescript
graph.on("block-drag-start", (event) => {
  console.log("Block drag started:", event.detail.block.id);
});

graph.on("block-drag", (event) => {
  const { block, x, y } = event.detail;
  console.log(`Block ${block.id} moving to (${x}, ${y})`);
  
  // Prevent default to cancel the drag
  // event.preventDefault();
});

graph.on("block-drag-end", (event) => {
  console.log("Block drag ended:", event.detail.block.id);
});
```

## Advanced Topics

### Drag Behavior with Selection

The DragService integrates with the SelectionService:

1. **Target in selection**: All selected draggable components move together
2. **Target not in selection**: Only the target component moves

```typescript
// Example: User has blocks A, B, C selected
// - Click and drag block A → A, B, C all move
// - Click and drag block D (not selected) → Only D moves
```

### Autopanning

Autopanning is automatically enabled during drag operations. When the cursor moves near the canvas edges, the camera pans to follow:

```typescript
// Autopanning is managed by DragService
// - Enabled on drag start
// - Disabled on drag end
// - Camera changes trigger position recalculation for smooth movement
```

### Cursor Locking

During drag operations, the cursor is locked to "grabbing":

```typescript
// Cursor management is automatic
// - Locks to "grabbing" on first move
// - Unlocks when drag ends
```

## Complete Example: Custom Draggable Node

```typescript
import {
  GraphComponent,
  DragContext,
  DragDiff,
  TGraphComponentProps,
} from "@gravity-ui/graph";

interface NodeProps extends TGraphComponentProps {
  locked?: boolean;
}

interface NodeState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CustomNode extends GraphComponent<NodeProps, NodeState> {
  private dragStartPosition: { x: number; y: number } | null = null;

  public getEntityId(): string {
    return this.props.id;
  }

  // Enable dragging when not locked
  public override isDraggable(): boolean {
    return !this.props.locked;
  }

  // Store initial position on drag start
  public override handleDragStart(context: DragContext): void {
    this.dragStartPosition = {
      x: this.state.x,
      y: this.state.y,
    };

    this.context.graph.emit("custom-node-drag-start", {
      nodeId: this.getEntityId(),
      position: this.dragStartPosition,
    });
  }

  // Update position during drag
  public override handleDrag(diff: DragDiff, context: DragContext): void {
    if (!this.dragStartPosition) return;

    // Use absolute diff for stable positioning
    const newX = this.dragStartPosition.x + diff.diffX;
    const newY = this.dragStartPosition.y + diff.diffY;

    // Apply snapping only for single-item drags
    const shouldSnap = context.components.length === 1;
    const [finalX, finalY] = shouldSnap
      ? this.snapToGrid(newX, newY)
      : [newX, newY];

    this.setState({ x: finalX, y: finalY });
    this.updateHitBox({ ...this.state, x: finalX, y: finalY });
  }

  // Clean up on drag end
  public override handleDragEnd(context: DragContext): void {
    this.context.graph.emit("custom-node-drag-end", {
      nodeId: this.getEntityId(),
      position: { x: this.state.x, y: this.state.y },
    });

    this.dragStartPosition = null;
    this.updateHitBox(this.state);
  }

  private snapToGrid(x: number, y: number): [number, number] {
    const gridSize = 20;
    return [
      Math.round(x / gridSize) * gridSize,
      Math.round(y / gridSize) * gridSize,
    ];
  }

  private updateHitBox(state: NodeState): void {
    this.setHitBox(
      state.x,
      state.y,
      state.x + state.width,
      state.y + state.height
    );
  }

  protected render(): void {
    // Render the node...
  }
}
```

## API Reference

### DragService

| Property/Method | Type | Description |
|----------------|------|-------------|
| `$state` | `Signal<DragState>` | Reactive signal with current drag state |
| `destroy()` | `() => void` | Cleanup method (called automatically on graph unmount) |

### DragState

```typescript
type DragState = {
  isDragging: boolean;
  components: GraphComponent[];
  componentTypes: Set<string>;
  isMultiple: boolean;
  isHomogeneous: boolean;
};
```

### DragContext

```typescript
type DragContext = {
  sourceEvent: MouseEvent;
  startCoords: [number, number];
  prevCoords: [number, number];
  currentCoords: [number, number];
  components: GraphComponent[];
};
```

### DragDiff

```typescript
type DragDiff = {
  startCoords: [number, number];
  prevCoords: [number, number];
  currentCoords: [number, number];
  diffX: number;
  diffY: number;
  deltaX: number;
  deltaY: number;
};
```

### GraphComponent Drag Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `isDraggable()` | `() => boolean` | Override to enable drag (default: `false`) |
| `handleDragStart()` | `(context: DragContext) => void` | Called when drag starts |
| `handleDrag()` | `(diff: DragDiff, context: DragContext) => void` | Called on each drag frame |
| `handleDragEnd()` | `(context: DragContext) => void` | Called when drag ends |
