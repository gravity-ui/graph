# Drag System: Smart Dragging with Position Modifiers

## Introduction

The drag system in @gravity-ui/graph is designed to solve a fundamental problem: how to make dragging intuitive, precise, and extensible while working with complex graph structures that can be zoomed, panned, and contain multiple selected elements.

Traditional drag implementations often struggle with:
- **Coordinate space confusion** - mixing screen pixels with world coordinates
- **Inconsistent snapping** - grid alignment that doesn't work across zoom levels
- **Multiple selection complexity** - dragging several blocks while maintaining their relative positions
- **Extensibility limitations** - hard to add new behaviors like anchor magnetism or alignment guides

Our solution introduces a two-component architecture:
- **DragController** - The orchestrator that manages the drag lifecycle
- **DragInfo** - The smart state container that handles coordinate transformations and position modifications

This system automatically handles coordinate space conversions, provides extensible position modification through modifiers, and seamlessly supports both single and multiple entity dragging.

## How DragController Works

DragController acts as the central command center for all drag operations. Think of it as the conductor of an orchestra - it doesn't make the music itself, but coordinates all the participants to create a harmonious experience.

### The Drag Lifecycle

When you start dragging a block, here's what happens behind the scenes:

1. **Initialization Phase**: DragController receives the initial mouse event and configuration
2. **Setup Phase**: It creates a DragInfo instance with all the necessary state and modifiers
3. **Update Phase**: For each mouse movement, it updates DragInfo and calls your drag handlers
4. **Cleanup Phase**: When dragging ends, it cleans up resources and calls final handlers

The key insight is that DragController doesn't just pass raw mouse events to your components. Instead, it enriches the events with computed information about position modifications, coordinate transformations, and movement deltas.

### Configuration: Telling DragController What You Need

DragController is highly configurable through the `DragControllerConfig` object. Let's break down each option:

**positionModifiers** - This is where the magic happens. You can provide an array of functions that can modify the drag position in real-time. For example:
```typescript
positionModifiers: [
  DragModifiers.gridSnap(20),  // Snap to 20px grid
  anchorMagnetism,             // Custom anchor snapping
  alignmentGuides              // Block-to-block alignment
]
```

**context** - This is your way to pass dynamic configuration and data to modifiers. It's like a shared context that all modifiers can read from:
```typescript
context: {
  enableGridSnap: user.preferences.snapToGrid,
  gridSize: layout.cellSize,
  selectedBlocks: selectionManager.getSelectedBlocks(),
  nearbyAnchors: anchorDetector.findNearby(mousePosition, 50)
}
```

**initialEntityPosition** - This is crucial for accurate positioning. It tells DragController where the dragged entity actually starts, not where the mouse cursor is. This distinction is important because you might click anywhere on a block, but the block's position is defined by its top-left corner.

### A Real Example: Setting Up Block Dragging

Here's how you would set up dragging for a block with grid snapping enabled:

```typescript
// In your Blocks component
const startDrag = (event, mainBlock) => {
  dragController.start({
    // Your drag event handlers
    onDragStart: (event, dragInfo) => {
      // Highlight selected blocks, show drag indicators
    },
    onDragUpdate: (event, dragInfo) => {
      // Update block positions using dragInfo
      selectedBlocks.forEach(block => {
        const newPos = dragInfo.applyAdjustedDelta(block.startX, block.startY);
        block.updatePosition(newPos.x, newPos.y);
      });
    },
    beforeUpdate: (dragInfo) => {
      // Choose which position modifier to apply
      if (shiftPressed) {
        dragInfo.selectModifier('gridSnap');
      } else {
        dragInfo.selectByDistance(); // Pick the closest suggestion
      }
    },
    onDragEnd: (event, dragInfo) => {
      // Finalize positions, update state
    }
  }, event, {
    positionModifiers: [DragModifiers.gridSnap(gridSize)],
    context: { 
      enableGridSnap: !event.ctrlKey, // Disable with Ctrl
      selectedBlocks: getSelectedBlocks()
    },
    initialEntityPosition: { 
      x: mainBlock.state.x, 
      y: mainBlock.state.y 
    }
  });
};
```

## Understanding DragInfo: The Smart State Container

DragInfo is where all the computational intelligence of the drag system lives. While DragController orchestrates the process, DragInfo does the heavy lifting of coordinate calculations, position modifications, and state management.

### Why DragInfo Exists

In a complex graph editor, a simple drag operation involves many coordinate systems and calculations:
- Converting between screen pixels and world coordinates
- Handling zoom and pan transformations
- Applying snapping and alignment rules
- Managing multiple selected entities
- Computing movement deltas and velocities

Instead of scattering this logic across different components, DragInfo centralizes all this intelligence in one place, providing a clean API for drag handlers to use.

### The Coordinate Systems Problem

One of the biggest challenges in implementing drag operations is managing different coordinate systems. DragInfo automatically tracks and converts between:

**Screen Coordinates** (`startX`, `lastX`, `startY`, `lastY`):
These are raw pixel coordinates relative to the browser window. This is what you get directly from mouse events. However, these coordinates become useless when the user zooms or pans the graph.

**Camera Coordinates** (`startCameraX`, `lastCameraX`, `startCameraY`, `lastCameraY`):
These are coordinates in the "world space" of your graph. They account for zoom level and pan offset. When you zoom in 2x, a 10-pixel mouse movement translates to a 5-unit movement in camera space. DragInfo automatically performs these calculations using the graph's camera service.

**Entity Coordinates** (`entityStartX`, `entityStartY`, `currentEntityPosition`):
These represent the actual position of the dragged object. This is crucial because the mouse cursor might be anywhere on a block, but the block's position is typically defined by its top-left corner or center point.

### How Position Modification Works

The position modification system is the heart of DragInfo's intelligence. Here's how it works step by step:

**Step 1: Collecting Modifier Suggestions**
When the mouse moves, DragInfo doesn't immediately update the entity position. Instead, it asks all registered position modifiers: "Given the current mouse position, what position would you suggest for the entity?"

Each modifier that is `applicable()` provides a suggestion. For example:
- GridSnap modifier suggests the nearest grid intersection
- Anchor magnetism suggests the position that would align with nearby anchors
- Alignment guides suggest positions that would align with other blocks

**Step 2: Lazy Suggestion Calculation**
Position modification can be computationally expensive (imagine calculating distances to hundreds of anchors). DragInfo uses lazy evaluation - suggestions are only calculated when actually needed, and results are cached.

**Step 3: Modifier Selection**
Multiple modifiers might provide suggestions simultaneously. DragInfo provides several strategies for choosing which one to apply:

- **selectByPriority()**: Choose the modifier with the highest priority value
- **selectByDistance()**: Choose the suggestion closest to the raw mouse position
- **selectByCustom()**: Let your code implement custom selection logic
- **selectModifier(name)**: Directly select a specific modifier

**Step 4: Position Application**
Once a modifier is selected, DragInfo calculates the final entity position and makes it available through `adjustedEntityPosition`.

### Entity vs Mouse Position: A Critical Distinction

Traditional drag implementations often confuse mouse position with entity position. Here's why the distinction matters:

Imagine you have a 100x50 pixel block, and the user clicks at the center of the block to start dragging. The mouse is at the block's center, but the block's coordinate system defines its position by its top-left corner.

**Without this distinction:**
- Mouse moves to (150, 100)
- GridSnap snaps to (160, 100) 
- Block position becomes (160, 100)
- But now the block's center is at (210, 125) - the mouse is no longer at the center!

**With DragInfo's approach:**
- DragInfo calculates the offset between mouse click and entity origin
- Mouse moves to (150, 100)
- Entity position (accounting for offset) would be at (100, 75)
- GridSnap snaps entity to (100, 80)
- Block's center remains properly aligned with the adjusted mouse position

### Delta-based Movement for Multiple Entities

When multiple blocks are selected, DragInfo uses a sophisticated delta-based approach:

1. **Primary Entity**: One block (usually the first clicked) serves as the "primary" entity
2. **Delta Calculation**: DragInfo calculates how much the primary entity has moved: `adjustedEntityPosition - entityStartPosition`
3. **Delta Application**: Each secondary entity applies this same delta to its own starting position

This ensures that:
- All selected blocks move together as a group
- Position modifications (like grid snapping) affect the entire group consistently
- Relative positioning between blocks is preserved

Example:
```typescript
// Primary block starts at (100, 100), moves to (120, 100) due to grid snap
// Delta = (20, 0)

// Secondary block starts at (200, 150)
// Its new position = (200, 150) + (20, 0) = (220, 150)

selectedBlocks.forEach(block => {
  const newPos = dragInfo.applyAdjustedDelta(block.startX, block.startY);
  block.updatePosition(newPos.x, newPos.y);
});
```

## Building Position Modifiers: Making Dragging Intelligent

Position modifiers are the secret sauce that transforms basic mouse movements into intelligent, context-aware positioning. They're small, focused functions that can suggest alternative positions for your dragged entities.

### The Philosophy Behind Modifiers

The key insight behind position modifiers is separation of concerns. Instead of hardcoding snapping logic into your drag handlers, you define modifiers as independent, composable functions. This approach offers several benefits:

1. **Reusability**: A grid snapping modifier works for blocks, connections, and any other draggable entity
2. **Composability**: You can combine multiple modifiers (grid + anchor + alignment) and let the system choose the best suggestion
3. **Testability**: Each modifier is a pure function that's easy to test in isolation
4. **Extensibility**: Adding new behaviors doesn't require changing existing code

### Anatomy of a Position Modifier

Every position modifier implements the `PositionModifier` interface with four key properties:

**name** - A unique string identifier. This is used for debugging, logging, and direct modifier selection. Choose descriptive names like "gridSnap", "anchorMagnetism", or "blockAlignment".

**priority** - A numeric value that determines which modifier wins when multiple modifiers compete. Higher numbers = higher priority. This is useful for scenarios like "anchor snapping should always override grid snapping".

**applicable(position, dragInfo, context)** - A function that determines whether this modifier should even be considered. This is your chance to implement conditional logic:
- Only apply grid snapping when the user isn't holding Ctrl
- Only suggest anchor magnetism when there are anchors within 50 pixels
- Only activate alignment guides when multiple blocks are visible

**suggest(position, dragInfo, context)** - The core function that calculates the modified position. It receives the current entity position and returns a new position suggestion.

### How the Built-in GridSnap Works

Let's examine the gridSnap modifier to understand how modifiers work in practice:

```typescript
gridSnap: (gridSize = 20) => ({
  name: 'gridSnap',
  priority: 5,
  
  applicable: (pos, dragInfo, ctx) => {
    // Don't snap during micro-movements (prevents jitter)
    if (dragInfo.isMicroDrag()) return false;
    
    // Check if grid snapping is enabled in context
    if (ctx.enableGridSnap === false) return false;
    
    return true;
  },
  
  suggest: (pos, dragInfo, ctx) => {
    // Allow context to override grid size
    const effectiveGridSize = (ctx.gridSize as number) || gridSize;
    
    // Calculate nearest grid intersection
    const snappedX = Math.round(pos.x / effectiveGridSize) * effectiveGridSize;
    const snappedY = Math.round(pos.y / effectiveGridSize) * effectiveGridSize;
    
    return new Point(snappedX, snappedY);
  }
})
```

Notice how the modifier is implemented as a factory function. This allows you to create multiple grid snap modifiers with different grid sizes, while still maintaining the same interface.

### Creating Your Own Modifiers

Let's walk through creating a more complex modifier - anchor magnetism. This modifier snaps blocks to nearby connection anchors:

```typescript
const anchorMagnetism: PositionModifier = {
  name: 'anchorMagnetism',
  priority: 10, // Higher priority than grid snapping
  
  applicable: (pos, dragInfo, ctx) => {
    // Only apply if we're not doing micro-movements
    if (dragInfo.isMicroDrag()) return false;
    
    // Only apply if there are anchors in the context
    const anchors = ctx.nearbyAnchors as Anchor[];
    return anchors && anchors.length > 0;
  },
  
  suggest: (pos, dragInfo, ctx) => {
    const anchors = ctx.nearbyAnchors as Anchor[];
    const magnetDistance = ctx.magnetDistance as number || 30;
    
    // Find the closest anchor within magnet distance
    let closestAnchor = null;
    let closestDistance = magnetDistance;
    
    for (const anchor of anchors) {
      const distance = Math.sqrt(
        Math.pow(pos.x - anchor.x, 2) + 
        Math.pow(pos.y - anchor.y, 2)
      );
      
      if (distance < closestDistance) {
        closestAnchor = anchor;
        closestDistance = distance;
      }
    }
    
    // If we found a nearby anchor, snap to it
    if (closestAnchor) {
      return new Point(closestAnchor.x, closestAnchor.y);
    }
    
    // No snapping suggestion
    return pos;
  }
};
```

### Context: Sharing Data Between Components and Modifiers

The context system is how you pass dynamic data and configuration to your modifiers. It's a simple object that gets passed to all modifier functions, allowing you to:

**Pass Configuration Data:**
```typescript
context: {
  enableGridSnap: userPreferences.snapToGrid,
  gridSize: 25,
  magnetDistance: 40
}
```

**Share Runtime Data:**
```typescript
context: {
  selectedBlocks: selectionManager.getSelected(),
  nearbyAnchors: anchorDetector.findNearby(mousePos, 100),
  allBlocks: graph.blocks.getAll(),
  cameraZoom: graph.camera.getZoom()
}
```

**Provide Component References:**
```typescript
context: {
  graph: this.context.graph,
  layer: this.layer,
  hitTester: this.hitTester
}
```

The beauty of the context system is that it's completely flexible. Different modifiers can look for different properties in the context, and you can add new data without breaking existing modifiers.

### Advanced Modifier Patterns

**Conditional Modifiers:**
Sometimes you want modifiers that only activate under specific conditions:

```typescript
const shiftGridSnap = {
  name: 'shiftGridSnap',
  priority: 8,
  applicable: (pos, dragInfo, ctx) => {
    // Only active when Shift is pressed
    return ctx.shiftPressed && !dragInfo.isMicroDrag();
  },
  suggest: (pos, dragInfo, ctx) => {
    // Snap to larger grid when shift is pressed
    const largeGridSize = 100;
    return new Point(
      Math.round(pos.x / largeGridSize) * largeGridSize,
      Math.round(pos.y / largeGridSize) * largeGridSize
    );
  }
};
```

**Multi-axis Modifiers:**
Some modifiers might want to snap only horizontally or vertically:

```typescript
const horizontalAlignment = {
  name: 'horizontalAlignment',
  priority: 7,
  applicable: (pos, dragInfo, ctx) => {
    const nearbyBlocks = ctx.nearbyBlocks as Block[];
    return nearbyBlocks && nearbyBlocks.length > 0;
  },
  suggest: (pos, dragInfo, ctx) => {
    const nearbyBlocks = ctx.nearbyBlocks as Block[];
    
    // Find blocks with similar Y coordinates
    const alignmentCandidates = nearbyBlocks.filter(block => 
      Math.abs(block.y - pos.y) < 10
    );
    
    if (alignmentCandidates.length > 0) {
      // Suggest aligning Y coordinate with the first candidate
      return new Point(pos.x, alignmentCandidates[0].y);
    }
    
    return pos;
  }
};
```

## Handling Multiple Selected Entities

One of the most challenging aspects of implementing a drag system is handling multiple selected entities. Users expect to be able to select several blocks and drag them as a cohesive group, while maintaining their relative positions and applying consistent modifications.

### The Challenge of Group Dragging

When dragging a single block, the solution is straightforward: calculate the new position and apply it. But with multiple blocks, several questions arise:

1. **Which block determines the snapping behavior?** If you have 5 selected blocks, and grid snapping is enabled, which block's position gets snapped to the grid?

2. **How do you maintain relative positioning?** If blocks were initially 50 pixels apart, they should remain 50 pixels apart after dragging, even with position modifications.

3. **How do you handle conflicts?** What if one block would snap to a grid intersection, but doing so would cause another block to move outside the visible area?

### Our Solution: Primary Entity + Delta Propagation

The drag system solves these challenges using a "primary entity" approach:

**Step 1: Designate a Primary Entity**
When dragging begins, one of the selected entities (typically the one that was clicked) becomes the "primary entity". This entity's position is used for all position modification calculations.

**Step 2: Calculate the Primary Entity's Movement**
The system applies all position modifiers to the primary entity, calculating where it should move to. This gives us both:
- The raw movement delta (how far the mouse moved)
- The adjusted movement delta (after applying snapping, alignment, etc.)

**Step 3: Propagate the Delta to Secondary Entities**
All other selected entities apply the same adjusted delta to their own starting positions. This ensures they move together as a cohesive group.

### API: Single vs Multiple Entity Patterns

The drag system provides two different API patterns depending on your use case:

**For Single Entity Dragging:**
```typescript
onDragUpdate: (event, dragInfo) => {
  // Get the final adjusted position directly
  const newPos = dragInfo.adjustedEntityPosition;
  entity.updatePosition(newPos.x, newPos.y);
}
```

This is perfect when you're only dragging one entity. The `adjustedEntityPosition` gives you the final position after all modifications have been applied.

**For Multiple Entity Dragging:**
```typescript
onDragUpdate: (event, dragInfo) => {
  selectedEntities.forEach(entity => {
    // Apply the adjusted delta to each entity's starting position
    const newPos = dragInfo.applyAdjustedDelta(entity.startX, entity.startY);
    entity.updatePosition(newPos.x, newPos.y);
  });
}
```

Here, `applyAdjustedDelta()` takes the starting position of each entity and applies the same movement delta that was calculated for the primary entity.

### A Detailed Example

Let's trace through a real example to see how this works:

**Initial Setup:**
- Block A (primary): starts at (100, 100)
- Block B: starts at (250, 150)  
- Block C: starts at (200, 50)
- Grid snapping is enabled with 20px grid size

**User Drags 15 pixels to the right:**
1. Raw mouse movement: +15 pixels horizontally
2. Primary entity (Block A) would move to (115, 100)
3. Grid snapping modifies this to (120, 100) - nearest grid intersection
4. Adjusted delta = (120, 100) - (100, 100) = (20, 0)

**Delta Applied to All Blocks:**
- Block A: (100, 100) + (20, 0) = (120, 100)
- Block B: (250, 150) + (20, 0) = (270, 150)  
- Block C: (200, 50) + (20, 0) = (220, 50)

**Result:**
All blocks moved together, maintaining their relative positions, and the entire group was snapped to the grid based on the primary entity's final position.

### Advanced Scenarios

**Modifier Selection for Groups:**
When multiple modifiers are available, the selection logic (`selectByPriority`, `selectByDistance`, etc.) operates on the primary entity's position. The chosen modifier then affects the entire group.

**Context Sharing:**
The context object can include information about all selected entities, allowing modifiers to make group-aware decisions:

```typescript
context: {
  selectedBlocks: [blockA, blockB, blockC],
  groupBounds: calculateBounds(selectedBlocks),
  groupCenter: calculateCenter(selectedBlocks)
}
```

**Boundary Checking:**
You might want to implement modifiers that prevent the group from moving outside certain boundaries:

```typescript
const boundaryModifier = {
  name: 'boundaryCheck',
  priority: 15, // High priority
  applicable: (pos, dragInfo, ctx) => true,
  suggest: (pos, dragInfo, ctx) => {
    const groupBounds = ctx.groupBounds;
    const adjustedBounds = calculateGroupBoundsAtPosition(pos, groupBounds);
    
    if (adjustedBounds.right > canvasWidth) {
      pos.x -= (adjustedBounds.right - canvasWidth);
    }
    if (adjustedBounds.bottom > canvasHeight) {
      pos.y -= (adjustedBounds.bottom - canvasHeight);
    }
    
    return pos;
  }
};
```

## Understanding the Context System

The context system is the communication bridge between your application and the position modifiers. It allows you to pass dynamic data, configuration, and component references to modifiers without tightly coupling them to your specific implementation.

### Why Context Matters

Without a context system, position modifiers would be isolated functions with no knowledge of your application's state. They wouldn't know:
- Whether grid snapping is currently enabled in your UI
- What other blocks exist that could be used for alignment
- What the current zoom level is
- Whether certain keyboard modifiers are pressed
- What the user's preferences are

Context solves this by providing a generic, extensible way to share this information.

### Built-in Context Properties

DragInfo automatically includes several useful properties in the context:

**graph** - Reference to the main Graph instance, giving modifiers access to camera, layers, and services

**currentPosition** - The current mouse position in camera space (accounts for zoom/pan)

**currentEntityPosition** - The current position of the dragged entity (after offset calculations)

**entityStartPosition** - The initial position of the dragged entity

**Custom Context Properties** - Any additional data you provide when starting the drag

### Designing Context for Your Use Cases

The key to effective context design is thinking about what data your modifiers need to make intelligent decisions. Here are some common patterns:

**User Preferences:**
```typescript
context: {
  snapToGrid: userSettings.snapToGrid,
  gridSize: userSettings.gridSize,
  magnetism: userSettings.enableMagnetism,
  showAlignmentGuides: userSettings.showGuides
}
```

**Keyboard Modifiers:**
```typescript
context: {
  shiftPressed: event.shiftKey,
  ctrlPressed: event.ctrlKey,
  altPressed: event.altKey
}
```

**Spatial Data:**
```typescript
context: {
  allBlocks: graph.blocks.getAll(),
  visibleBlocks: viewport.getVisibleBlocks(),
  nearbyAnchors: anchorService.findNearby(mousePos, 100),
  canvasBounds: { width: canvas.width, height: canvas.height }
}
```

**Selection State:**
```typescript
context: {
  selectedBlocks: selectionManager.getSelected(),
  isMultiSelect: selectionManager.count() > 1,
  primaryBlock: selectionManager.getPrimary()
}
```

### Dynamic Context Updates

Context can be recalculated on each mouse movement if needed. This is useful for data that changes during the drag operation:

```typescript
onDragUpdate: (event, dragInfo) => {
  // Update context with fresh data
  const updatedContext = {
    nearbyAnchors: anchorService.findNearby(dragInfo.currentPosition, 50),
    visibleBlocks: viewport.getVisibleBlocks()
  };
  
  // The modifier system will use the updated context
  dragInfo.updateContext(updatedContext);
}
```

## Real-world Use Cases and Implementation Patterns

The drag system's flexibility allows it to handle a wide variety of interaction patterns. Here are some common use cases and how to implement them:

### Precise Grid Snapping

Grid snapping is essential for creating clean, aligned layouts. The built-in gridSnap modifier handles this, but you can customize its behavior:

```typescript
// Basic grid snapping
positionModifiers: [DragModifiers.gridSnap(20)]

// Dynamic grid size based on zoom level
context: {
  gridSize: Math.max(10, 20 / camera.zoom) // Larger grid when zoomed out
}

// Conditional grid snapping
context: {
  enableGridSnap: !event.ctrlKey // Disable when Ctrl is held
}
```

### Magnetic Anchor Snapping

When creating connections, you want blocks to snap to nearby anchor points:

```typescript
const anchorMagnetism = {
  name: 'anchorMagnetism',
  priority: 10,
  applicable: (pos, dragInfo, ctx) => {
    return ctx.nearbyAnchors && ctx.nearbyAnchors.length > 0;
  },
  suggest: (pos, dragInfo, ctx) => {
    const magnetDistance = 25;
    const closest = findClosestAnchor(pos, ctx.nearbyAnchors, magnetDistance);
    return closest ? new Point(closest.x, closest.y) : pos;
  }
};

// Update nearby anchors during drag
context: {
  nearbyAnchors: anchorService.findWithinRadius(currentPos, 50)
}
```

### Visual Alignment Guides

Alignment guides help users line up blocks with each other:

```typescript
const alignmentGuides = {
  name: 'alignment',
  priority: 8,
  applicable: (pos, dragInfo, ctx) => {
    return ctx.otherBlocks && ctx.otherBlocks.length > 0;
  },
  suggest: (pos, dragInfo, ctx) => {
    const tolerance = 5;
    
    // Check for horizontal alignment
    for (const block of ctx.otherBlocks) {
      if (Math.abs(pos.y - block.y) < tolerance) {
        return new Point(pos.x, block.y); // Snap to same Y
      }
      if (Math.abs(pos.y - (block.y + block.height)) < tolerance) {
        return new Point(pos.x, block.y + block.height); // Snap to bottom edge
      }
    }
    
    // Check for vertical alignment
    for (const block of ctx.otherBlocks) {
      if (Math.abs(pos.x - block.x) < tolerance) {
        return new Point(block.x, pos.y); // Snap to same X
      }
    }
    
    return pos;
  }
};
```

### Boundary Constraints

Prevent blocks from being dragged outside the canvas or into restricted areas:

```typescript
const boundaryConstraint = {
  name: 'boundary',
  priority: 20, // High priority - always enforce
  applicable: () => true,
  suggest: (pos, dragInfo, ctx) => {
    const bounds = ctx.canvasBounds;
    const blockSize = ctx.blockSize || { width: 100, height: 50 };
    
    return new Point(
      Math.max(0, Math.min(pos.x, bounds.width - blockSize.width)),
      Math.max(0, Math.min(pos.y, bounds.height - blockSize.height))
    );
  }
};
```

### Keyboard-modified Behavior

Different modifier keys can change snapping behavior:

```typescript
// In beforeUpdate handler
beforeUpdate: (dragInfo) => {
  if (dragInfo.context.shiftPressed) {
    // Shift = constrain to single axis
    dragInfo.selectModifier('axisConstraint');
  } else if (dragInfo.context.ctrlPressed) {
    // Ctrl = disable all snapping
    dragInfo.selectDefault();
  } else {
    // Normal mode = use closest suggestion
    dragInfo.selectByDistance();
  }
}
```

### Velocity-based Interactions

Use movement speed to trigger different behaviors:

```typescript
const velocityModifier = {
  name: 'velocity',
  priority: 5,
  applicable: (pos, dragInfo, ctx) => {
    return dragInfo.velocity > 500; // Fast movement
  },
  suggest: (pos, dragInfo, ctx) => {
    // During fast movement, disable precise snapping
    // to allow fluid motion
    return pos;
  }
};
```

## Integration with Graph Components

The drag system is designed to integrate seamlessly with existing graph components. Here's how different parts of the system work together:

### Block Component Integration

Individual block components participate in the drag system by implementing drag handlers. Each block receives enriched dragInfo and can respond appropriately:

```typescript
class Block extends Component {
  onDragUpdate(event: MouseEvent, dragInfo: DragInfo) {
    // For multiple selection, apply delta to this block's start position
    const newPos = dragInfo.applyAdjustedDelta(
      this.startDragCoords[0], 
      this.startDragCoords[1]
    );
    
    // Update block position with snapping/alignment applied
    this.updatePosition(newPos.x, newPos.y);
    
    // Trigger any visual feedback
    this.showPositionPreview(newPos);
  }
  
  onDragEnd(event: MouseEvent, dragInfo: DragInfo) {
    // Finalize position and clear any temporary visual indicators
    this.finalizePosition();
    this.hidePositionPreview();
  }
}
```

The key insight is that individual blocks don't need to know about snapping logic, coordinate transformations, or multiple selection. They simply apply the computed delta to their starting position.

### Layer Integration for Visual Feedback

Rendering layers can access drag state to provide visual feedback like grid overlays, alignment guides, or drop zones:

```typescript
class AlignmentGuidesLayer extends Layer {
  render(ctx: CanvasRenderingContext2D) {
    if (!this.graph.dragController.isDragging) return;
    
    const dragInfo = this.graph.dragController.dragInfo;
    
    // Show alignment lines when alignment modifier is active
    if (dragInfo.isModified('alignment')) {
      this.renderAlignmentGuides(ctx, dragInfo);
    }
    
    // Show grid when grid snapping is active
    if (dragInfo.isModified('gridSnap')) {
      this.renderGrid(ctx, dragInfo.context.gridSize);
    }
  }
  
  renderAlignmentGuides(ctx: CanvasRenderingContext2D, dragInfo: DragInfo) {
    // Draw helper lines showing alignment with other blocks
    const guides = this.calculateAlignmentGuides(dragInfo);
    guides.forEach(guide => this.drawGuideLine(ctx, guide));
  }
}
```

### Service Integration

Camera and other services provide essential coordinate transformation capabilities:

```typescript
// DragInfo automatically uses camera service for coordinate transformations
class DragInfo {
  get startCameraX(): number {
    if (!this._startCameraPoint) {
      // Convert screen coordinates to camera space
      this._startCameraPoint = this.graph.getPointInCameraSpace(this.initialEvent);
    }
    return this._startCameraPoint.x;
  }
}
```

This ensures that drag operations work correctly regardless of zoom level or pan position.

## Performance Optimization and Best Practices

The drag system is designed for high performance during interactive dragging. Here are the key optimizations and how to use them effectively:

### Lazy Evaluation Strategy

Many drag calculations are expensive and might not be needed every frame. The system uses lazy evaluation extensively:

**Coordinate Transformations:**
```typescript
// Camera space coordinates are only calculated when first accessed
get lastCameraX(): number {
  if (!this._currentCameraPoint) {
    this._currentCameraPoint = this.graph.getPointInCameraSpace(this.lastEvent);
  }
  return this._currentCameraPoint.x;
}
```

**Modifier Suggestions:**
```typescript
// Position suggestions are only calculated when the modifier is applicable
const suggestion = {
  name: modifier.name,
  priority: modifier.priority,
  getSuggestedPosition: () => {
    // Lazy evaluation - only calculated when accessed
    if (!this.cachedPosition) {
      this.cachedPosition = modifier.suggest(pos, dragInfo, context);
    }
    return this.cachedPosition;
  }
};
```

### Micro-drag Detection

Small mouse movements (micro-drags) are filtered out to prevent jittery behavior:

```typescript
// Built into DragInfo
isMicroDrag(): boolean {
  const threshold = 3; // pixels
  return this.distance < threshold;
}

// Used by modifiers to avoid unnecessary snapping
applicable: (pos, dragInfo, ctx) => {
  if (dragInfo.isMicroDrag()) return false; // Skip snapping for tiny movements
  return true;
}
```

### Efficient Context Updates

Context updates can be expensive if done inefficiently. Best practices:

```typescript
// Good: Update only changed properties
const updatedContext = {
  ...existingContext,
  nearbyAnchors: newAnchors // Only update what changed
};

// Avoid: Recalculating everything every frame
const expensiveContext = {
  allBlocks: graph.blocks.getAll(), // Expensive!
  allConnections: graph.connections.getAll(), // Expensive!
  // ... computed every mouse move
};
```

### Memory Management

The drag system minimizes object creation during drag operations:

```typescript
// Reuse Point objects where possible
const reusablePoint = new Point(0, 0);

suggest: (pos, dragInfo, ctx) => {
  // Modify existing object instead of creating new one
  reusablePoint.x = Math.round(pos.x / gridSize) * gridSize;
  reusablePoint.y = Math.round(pos.y / gridSize) * gridSize;
  return reusablePoint;
}
```

## Complete API Reference

### DragController

**Methods:**
```typescript
start(handler: DragHandler, event: MouseEvent, config?: DragControllerConfig): void
// Begins a drag operation with the given handler and configuration

update(event: MouseEvent): void  
// Processes a mouse move event during dragging

end(event: MouseEvent): void
// Completes the drag operation and cleans up resources

get isDragging(): boolean
// Returns true if a drag operation is currently active

get dragInfo(): DragInfo | null
// Returns the current DragInfo instance, or null if not dragging
```

**Configuration (DragControllerConfig):**
```typescript
interface DragControllerConfig {
  positionModifiers?: PositionModifier[];  // Array of position modification functions
  context?: Record<string, unknown>;       // Custom data passed to modifiers
  initialEntityPosition?: { x: number; y: number }; // Starting position of dragged entity
}
```

### DragInfo

**Position Properties:**
```typescript
// Screen coordinates (raw pixel values)
readonly startX: number;           // Initial mouse X position
readonly startY: number;           // Initial mouse Y position  
readonly lastX: number;            // Current mouse X position
readonly lastY: number;            // Current mouse Y position

// Camera coordinates (world space, accounting for zoom/pan)
readonly startCameraX: number;     // Initial mouse position in camera space
readonly startCameraY: number;
readonly lastCameraX: number;      // Current mouse position in camera space
readonly lastCameraY: number;

// Entity coordinates (position of dragged object)
readonly entityStartX: number;     // Initial entity X position
readonly entityStartY: number;     // Initial entity Y position
readonly currentEntityPosition: Point; // Current entity position (before modifications)
readonly adjustedEntityPosition: Point; // Final entity position (after modifications)
```

**Movement Calculations:**
```typescript
readonly worldDelta: { x: number; y: number };        // Raw movement delta
readonly adjustedWorldDelta: { x: number; y: number }; // Movement delta with modifications
readonly distance: number;                             // Total distance moved
readonly velocity: number;                             // Current movement velocity
readonly duration: number;                             // Time since drag started
```

**Modifier Management:**
```typescript
analyzeSuggestions(): void;                    // Generate suggestions from all applicable modifiers
selectByPriority(): void;                      // Choose modifier with highest priority
selectByDistance(): void;                      // Choose modifier with closest suggestion
selectByCustom(fn: SelectionFunction): void;   // Use custom selection logic
selectModifier(name: string): void;            // Directly select a specific modifier
selectDefault(): void;                         // Use no modifications (raw position)

isApplicable(modifierName: string): boolean;   // Check if a modifier is currently applicable
isModified(modifierName?: string): boolean;    // Check if any/specific modifier is active
```

**Position Application:**
```typescript
applyAdjustedDelta(startX: number, startY: number): { x: number; y: number };
// Apply the adjusted movement delta to any starting position
// Essential for multiple entity dragging
```

**Context Management:**
```typescript
updateContext(newContext: Record<string, unknown>): void;
// Update the custom context during drag operation
// Merges new context with existing data and invalidates cache

readonly context: DragContext;                // Access to context data
```

**Utility Methods:**
```typescript
isMicroDrag(): boolean;                        // True if movement is below threshold
```

### Position Modifiers

**Interface:**
```typescript
interface PositionModifier {
  name: string;                                              // Unique identifier
  priority: number;                                          // Conflict resolution priority
  applicable(pos: Point, dragInfo: DragInfo, ctx: DragContext): boolean; // Availability check
  suggest(pos: Point, dragInfo: DragInfo, ctx: DragContext): Point;       // Position calculation
}
```

**Built-in Factory:**
```typescript
DragModifiers.gridSnap(gridSize?: number): PositionModifier;
// Creates a grid snapping modifier with the specified grid size
```

**Context Interface:**
```typescript
interface DragContext {
  graph: Graph;                          // Graph instance reference
  currentPosition: Point;                // Current mouse position in camera space
  currentEntityPosition: Point;          // Current entity position
  entityStartPosition: Point | null;     // Initial entity position
  [key: string]: unknown;               // Custom context properties
}
```

This comprehensive API allows for flexible, performant drag implementations that can handle everything from simple block movement to complex multi-entity operations with sophisticated snapping and alignment behaviors.