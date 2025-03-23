# Block Component Documentation

The Block component is the fundamental building block for rendering graph nodes in the visualization system. This document describes the Block component's structure, behavior, events, and how to extend it with custom implementations.

## Block Architecture

The Block component extends the GraphComponent class and provides the base functionality for rendering and interacting with graph blocks (nodes).

```mermaid
classDiagram
    GraphComponent <|-- Block
    Block <|-- CustomBlock
    Block -- BlockState
    Block -- BlockController
    Block -- GraphLayer
    
    class GraphComponent {
        +props
        +state
        +context
        +iterate()
        +render()
    }
    
    class Block {
        +static IS: string
        +isBlock: boolean
        +connectedState: BlockState
        +blockController: BlockController
        +$viewState: Signal
        +getGeometry()
        +updatePosition()
        +handleEvent()
        +getAnchorPosition()
        +renderBody()
        +renderSchematicView()
        +renderDetailedView()
    }
    
    class BlockState {
        +$state: Signal
        +$anchors: Signal
        +$geometry: Signal
        +updateXY()
        +setViewComponent()
    }
    
    class BlockController {
        +handleEvent()
        +onDragStart()
        +onDragUpdate()
        +onDragEnd()
    }
```

## Core Properties and Types

### TBlock Interface

The basic data structure for a block:

```typescript
type TBlock<T extends Record<string, unknown> = {}> = {
  id: TBlockId;              // Unique identifier
  is: string;                // Block type identifier
  x: number;                 // X coordinate
  y: number;                 // Y coordinate
  group?: string;            // Optional group identifier
  width: number;             // Width of the block
  height: number;            // Height of the block
  selected: boolean;         // Selection state
  name: string;              // Display name
  anchors: TAnchor[];        // Connection points
  settings?: TBlockSettings; // Additional settings
  meta?: T;                  // Custom metadata
};
```

### Block Component Properties

```typescript
type TBlockProps = {
  id: TBlockId;  // ID of the block to render
  font: string;  // Font to use for text rendering
};
```

### Block Component State

The Block component maintains several internal state properties:

- `connectedState`: Connection to the block's data in the store
- `shouldRenderText`: Controls text rendering
- `shouldRenderHtml`: Controls HTML overlay rendering
- `raised`: Indicates if the block is raised (higher z-index)
- `hidden`: Controls visibility of the block

## Lifecycle and Rendering

The Block component follows the standard component lifecycle, with additional specific behaviors:

1. **Initialization**:
   - Constructor subscribes to the block's data in the store
   - Sets up event listeners for drag events

2. **Rendering Pipeline**:
   - `willRender()` - Prepares the block for rendering
   - `render()` - Main rendering method, delegates to view-specific methods
   - `renderBody()` - Renders the main body of the block
   - `renderSchematicView()` - Renders the block in schematic (simplified) view
   - `renderDetailedView()` - Renders the block in detailed view

3. **Children Management**:
   - `updateChildren()` - Creates anchor components for the block

4. **State Management**:
   - `stateChanged()` - Handles changes to the block's state
   - `updatePosition()` - Updates the block's position

## Events and Interactions

The Block component handles several events:

### Drag Events

```mermaid
sequenceDiagram
    participant User
    participant Block
    participant BlockController
    participant Store
    
    User->>Block: Mouse Down
    Block->>BlockController: onDragStart()
    BlockController->>Block: Emit "block-drag-start"
    User->>Block: Mouse Move
    Block->>BlockController: onDragUpdate()
    BlockController->>Block: Calculate next position
    Block->>Block: applyNextPosition()
    Block->>Store: Update position
    Block->>Block: Emit "block-drag"
    User->>Block: Mouse Up
    Block->>BlockController: onDragEnd()
    Block->>Block: Emit "block-drag-end"
```

### Event Types

The Block component defines these custom events:

1. **block-drag-start** - Fired when a block drag operation begins
2. **block-drag** - Fired continuously during block dragging
3. **block-drag-end** - Fired when a block drag operation ends

## Anchors

Anchors are connection points on blocks that allow creating connections between blocks.

```mermaid
flowchart TD
    A[Block] --> B[Anchors]
    B --> C[Input Anchors]
    B --> D[Output Anchors]
    C --> E[Connection point]
    D --> F[Connection point]
```

The Block component provides methods to manage anchors:

- `getAnchorPosition()` - Gets the position of an anchor
- `getConnectionPoint()` - Gets a connection point for in/out directions
- `renderAnchor()` - Renders an anchor at a specific position

## Customizing Block Appearance

The Block component provides several methods that can be overridden to customize appearance:

1. **renderStroke(color)** - Renders the block's border
2. **renderBody(ctx)** - Renders the block's main body
3. **renderSchematicView(ctx)** - Renders the simplified view
4. **renderDetailedView(ctx)** - Renders the detailed view
5. **renderText(text, ctx, options)** - Renders text within the block

## Extending Block with Custom Implementations

To create a custom block type, extend the Block class and override the rendering methods:

```typescript
class CustomBlock extends Block {
  // Override rendering methods to customize appearance
  protected renderBody(ctx: CanvasRenderingContext2D) {
    // Custom rendering code
    ctx.fillStyle = "blue";
    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    
    // Call the base implementation if needed
    // super.renderBody(ctx);
  }
  
  // Override behavior methods to customize interactions
  protected onDragStart(event: MouseEvent) {
    // Custom drag start handling
    console.log("Custom drag start");
    
    // Call the base implementation
    super.onDragStart(event);
  }
}
```

## Configuring Graph to Use Custom Blocks

To use custom block implementations in a graph, you need to register them in the graph configuration:

```typescript
// Define a custom block type
class MySpecialBlock extends Block {
  protected renderSchematicView(ctx: CanvasRenderingContext2D) {
    // Custom rendering logic
    ctx.fillStyle = "#FFD700"; // Gold color
    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [10]);
    ctx.fill();
    
    // Render text
    if (this.shouldRenderText) {
      ctx.fillStyle = "#000";
      this.renderText(this.state.name);
    }
  }
}

// Define a unique identifier for this block type
const SPECIAL_BLOCK_TYPE = "special-block";

// Create graph configuration with custom block
const graphConfig: TGraphConfig = {
  blocks: [
    {
      id: "block1",
      is: SPECIAL_BLOCK_TYPE, // Use the custom block type
      x: 100,
      y: 200,
      width: 180,
      height: 120,
      name: "My Special Block",
      selected: false,
      anchors: [
        // Define anchors for the block
        { id: "input1", type: EAnchorType.INPUT, point: [0, 0.5] },
        { id: "output1", type: EAnchorType.OUTPUT, point: [1, 0.5] }
      ]
    }
  ],
  settings: {
    // Register the custom block implementation
    blockComponents: {
      [SPECIAL_BLOCK_TYPE]: MySpecialBlock
    }
  }
};

// Create the graph with the custom configuration
const graph = new Graph(graphConfig, rootElement);
```

## Complete Example of a Custom Block

Here's a complete example of creating and using a custom block:

```typescript
import { Block, CanvasBlock, TGraphConfig, EAnchorType } from "graph-library";

// 1. Define a custom block class
class RoundedBlock extends CanvasBlock {
  // Override the stroke rendering
  protected renderStroke(color: string) {
    this.context.ctx.lineWidth = Math.round(3 / this.context.camera.getCameraScale());
    this.context.ctx.strokeStyle = color;
    this.context.ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [15]);
    this.context.ctx.stroke();
  }

  // Override the schematic view rendering
  public override renderSchematicView() {
    const ctx = this.context.ctx;
    
    // Fill with custom color
    ctx.fillStyle = "#E6F7FF";
    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [15]);
    ctx.fill();
    
    // Stroke
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0077CC";
    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, [15]);
    ctx.stroke();

    // Render text
    if (this.shouldRenderText) {
      ctx.fillStyle = "#003366";
      ctx.textAlign = "center";
      this.renderText(this.state.name);
    }
    
    // Render selection highlight
    if (this.state.selected) {
      this.renderStroke(this.context.colors.block.selectedBorder);
    }
  }
}

// 2. Define a unique type for the block
const ROUNDED_BLOCK_TYPE = "rounded-block";

// 3. Create graph configuration that uses the custom block
export const customBlockGraphConfig: TGraphConfig = {
  configurationName: "custom-blocks-example",
  blocks: [
    {
      id: "block1",
      is: ROUNDED_BLOCK_TYPE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      name: "Rounded Block 1",
      selected: false,
      anchors: [
        { id: "in1", type: EAnchorType.INPUT, point: [0, 0.3] },
        { id: "in2", type: EAnchorType.INPUT, point: [0, 0.7] },
        { id: "out", type: EAnchorType.OUTPUT, point: [1, 0.5] }
      ]
    },
    {
      id: "block2",
      is: ROUNDED_BLOCK_TYPE,
      x: 400,
      y: 200,
      width: 200,
      height: 150,
      name: "Rounded Block 2",
      selected: false,
      anchors: [
        { id: "in", type: EAnchorType.INPUT, point: [0, 0.5] },
        { id: "out1", type: EAnchorType.OUTPUT, point: [1, 0.3] },
        { id: "out2", type: EAnchorType.OUTPUT, point: [1, 0.7] }
      ]
    }
  ],
  connections: [
    {
      id: "conn1",
      from: { block: "block1", anchor: "out" },
      to: { block: "block2", anchor: "in" }
    }
  ],
  settings: {
    blockComponents: {
      // Register the custom block implementation
      [ROUNDED_BLOCK_TYPE]: RoundedBlock
    }
  }
};

// 4. Create the graph with the custom blocks
const graph = new Graph(customBlockGraphConfig, document.getElementById("graph-container"));
```

## Best Practices for Custom Blocks

When creating custom block implementations, follow these best practices:

1. **Respect Camera Scale**: 
   ```typescript
   // Scale line widths based on camera zoom
   ctx.lineWidth = Math.round(2 / this.context.camera.getCameraScale());
   ```

2. **Use Theme Colors**:
   ```typescript
   // Use colors from graph theme
   ctx.fillStyle = this.context.colors.block.background;
   ctx.strokeStyle = this.context.colors.block.border;
   ```

3. **Handle Selection State**:
   ```typescript
   if (this.state.selected) {
     // Custom selection visualization
     this.renderStroke(this.context.colors.block.selectedBorder);
   }
   ```

4. **Optimize Rendering**:
   ```typescript
   // Only render text when needed
   if (this.shouldRenderText && this.context.camera.getCameraScale() > 0.5) {
     this.renderText(this.state.name);
   }
   ```

5. **Don't Transform Coordinates**:
   ```typescript
   // Incorrect - don't transform coordinates manually
   // const worldX = originalX * transform.scale + transform.x;
   
   // Correct - use original coordinates
   ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
   ```

6. **Consider Performance**:
   ```typescript
   // Optimize for performance with complex custom blocks
   protected willRender() {
     // Only update complex calculations when needed
     if (this.needsRecalculation) {
       this.calculateGeometry();
       this.needsRecalculation = false;
     }
   }
   ```

7. **Support Different View Modes**:
   ```typescript
   // Implement both schematic and detailed views
   public renderSchematicView(ctx: CanvasRenderingContext2D) {
     // Simplified rendering for schematic view
   }
   
   public renderDetailedView(ctx: CanvasRenderingContext2D) {
     // More detailed rendering for close-up view
   }
   ```

## Handling State and Props Changes

The Block component provides lifecycle methods to respond to changes in state and props. By overriding these methods, custom blocks can optimize rendering and perform specific actions when data changes.

### Responding to State Changes

```typescript
class OptimizedBlock extends Block {
  protected stateChanged(nextState: TBlock): void {
    // Check what changed in the state
    if (nextState.selected !== this.state.selected) {
      // Handle selection state change
      console.log(`Block ${this.state.id} selection changed to ${nextState.selected}`);
      
      // Raise block z-index when selected
      this.zIndex = nextState.selected ? 
        this.context.constants.block.DEFAULT_Z_INDEX + 1 : 
        this.context.constants.block.DEFAULT_Z_INDEX;
    }
    
    if (nextState.name !== this.state.name) {
      // Handle name change
      console.log(`Block name changed from "${this.state.name}" to "${nextState.name}"`);
      
      // Only trigger a render if text-related properties change
      this.shouldRender = true;
    } else if (nextState.x !== this.state.x || nextState.y !== this.state.y) {
      // Handle position change
      console.log(`Block position changed to (${nextState.x}, ${nextState.y})`);
      
      // Update hit box for interaction
      this.updateHitBox(nextState);
    } else {
      // Skip render for other property changes
      this.shouldRender = false;
    }
    
    // Always call parent method after your custom logic
    super.stateChanged(nextState);
  }
}
```

### Custom Property Change Detection

```typescript
class DataAwareBlock extends Block<TBlock & { data: { value: number } }> {
  private prevValue: number;
  private valueChanged: boolean = false;
  
  protected willMount() {
    this.prevValue = this.state.data?.value;
  }
  
  protected stateChanged(nextState: TBlock & { data: { value: number } }): void {
    // Check if the value property in data has changed
    if (nextState.data?.value !== this.prevValue) {
      this.valueChanged = true;
      this.prevValue = nextState.data?.value;
      
      // Calculate visual properties based on the new value
      const normalizedValue = Math.min(Math.max(nextState.data.value / 100, 0), 1);
      this.cachedFillColor = `rgba(0, ${Math.round(normalizedValue * 255)}, 0, 0.8)`;
    } else {
      this.valueChanged = false;
    }
    
    super.stateChanged(nextState);
  }
  
  protected renderSchematicView(ctx: CanvasRenderingContext2D) {
    // Use the cached color calculated during stateChanged
    ctx.fillStyle = this.cachedFillColor || this.context.colors.block.background;
    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    
    // Add a visual indicator when the value has just changed
    if (this.valueChanged) {
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(
        this.state.x + this.state.width - 10, 
        this.state.y + 10, 
        5, 
        0, 
        Math.PI * 2
      );
      ctx.fill();
    }
    
    // Render text
    if (this.shouldRenderText) {
      ctx.fillStyle = this.context.colors.block.text;
      this.renderText(`${this.state.name}: ${this.state.data?.value}`);
    }
  }
}
```

### Advanced State Diffing for Optimizing Renders

```typescript
class HighPerformanceBlock extends Block<TBlock & { 
  complexData: { 
    items: Array<{ id: string; value: number }> 
  } 
}> {
  // Cache for expensive calculations
  private calculatedLayout: Record<string, { x: number; y: number; width: number; height: number }> = {};
  private needsRecalculation = true;
  
  protected stateChanged(nextState: TBlock & { 
    complexData: { 
      items: Array<{ id: string; value: number }> 
    } 
  }): void {
    // First check if we have a structural change in the items
    const currentItems = this.state.complexData?.items || [];
    const nextItems = nextState.complexData?.items || [];
    
    if (currentItems.length !== nextItems.length) {
      // Item count changed - need full recalculation
      this.needsRecalculation = true;
    } else {
      // Check if any item values changed
      const hasChanges = nextItems.some((newItem, index) => {
        const currentItem = currentItems[index];
        return newItem.id !== currentItem.id || newItem.value !== currentItem.value;
      });
      
      if (hasChanges) {
        // We have changes in items - need recalculation
        this.needsRecalculation = true;
      }
    }
    
    // Check if position or size changed
    if (
      nextState.x !== this.state.x || 
      nextState.y !== this.state.y ||
      nextState.width !== this.state.width ||
      nextState.height !== this.state.height
    ) {
      // Container dimensions changed - need recalculation
      this.needsRecalculation = true;
    }
    
    super.stateChanged(nextState);
  }
  
  protected willRender() {
    super.willRender();
    
    // Perform expensive calculations only when needed
    if (this.needsRecalculation) {
      this.calculateInternalLayout();
      this.needsRecalculation = false;
    }
  }
  
  private calculateInternalLayout() {
    // Expensive calculation for internal element positions
    const items = this.state.complexData?.items || [];
    const padding = 10;
    const itemHeight = 30;
    const availableWidth = this.state.width - (padding * 2);
    
    this.calculatedLayout = {};
    
    items.forEach((item, index) => {
      this.calculatedLayout[item.id] = {
        x: this.state.x + padding,
        y: this.state.y + padding + (index * (itemHeight + 5)),
        width: availableWidth,
        height: itemHeight
      };
    });
  }
  
  protected renderSchematicView(ctx: CanvasRenderingContext2D) {
    // Render main container
    ctx.fillStyle = this.context.colors.block.background;
    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    
    // Render each item using pre-calculated layout
    const items = this.state.complexData?.items || [];
    items.forEach(item => {
      const layout = this.calculatedLayout[item.id];
      if (layout) {
        // Render item background
        ctx.fillStyle = `rgba(0, 0, 255, ${item.value / 100})`;
        ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
        
        // Render item text
        if (this.shouldRenderText) {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.font = this.props.font;
          ctx.fillText(
            `${item.id}: ${item.value}`, 
            layout.x + 5, 
            layout.y + layout.height/2 + 5
          );
        }
      }
    });
    
    // Render border
    ctx.strokeStyle = this.state.selected ? 
      this.context.colors.block.selectedBorder : 
      this.context.colors.block.border;
    ctx.strokeRect(this.state.x, this.state.y, this.state.width, this.state.height);
  }
} 