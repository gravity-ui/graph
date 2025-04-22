# React Components API

## Key Components

### GraphCanvas

The main container component that renders your graph:

```tsx
<GraphCanvas 
  graph={graph}
  renderBlock={renderBlock}
  className="my-graph"
/>
```

### GraphBlock

The `GraphBlock` component is a crucial wrapper that handles the complex interaction between HTML elements and the canvas layer. It's responsible for:

1. **Position Synchronization**: Automatically aligns HTML content with canvas coordinates
2. **State Management**: Handles selection, hover states, and drag interactions
3. **Layout Management**: Maintains proper block dimensions and positioning
4. **Z-index Handling**: Manages proper layering of blocks
5. **CSS Variables**: Injects position and state variables for styling

```tsx
<GraphBlock 
  graph={graph} 
  block={block}
  className="custom-block"
  containerClassName="custom-container"
>
  <div>Your block content here</div>
</GraphBlock>
```

The component automatically inherits styles from graph settings but can be customized using CSS variables:

```css
.custom-block {
  /* Position variables (automatically set by GraphBlock) */
  --graph-block-geometry-x: 0px;
  --graph-block-geometry-y: 0px;
  --graph-block-geometry-width: 200px;
  --graph-block-geometry-height: 100px;
  --graph-block-z-index: 1;
  --graph-block-order: 0;

  /* Theme variables (from graph settings) */
  --graph-block-bg: rgba(37, 27, 37, 1);
  --graph-block-border: rgba(229, 229, 229, 0.2);
  --graph-block-border-selected: rgba(255, 190, 92, 1);

  /* Custom styling */
  background-color: var(--graph-block-bg);
  border: 1px solid var(--graph-block-border);
}

.custom-block.selected {
  border-color: var(--graph-block-border-selected);
}
```

### GraphBlockAnchor

Renders connection points on blocks. The component supports two positioning modes:

1. **fixed** - Anchors are placed at exact coordinates relative to the block:
```tsx
<GraphBlockAnchor 
  graph={graph} 
  anchor={anchor}
  position="fixed"
>
  {(state) => (
    <div className={state.selected ? 'selected' : ''}>
      {/* Anchor visuals */}
    </div>
  )}
</GraphBlockAnchor>
```

2. **auto** - Anchors are automatically positioned based on their type:
```tsx
<GraphBlockAnchor 
  graph={graph} 
  anchor={anchor}
  position="auto"
  // Inputs will be placed on the left, outputs on the right
>
  {(state) => (
    <div className={state.selected ? 'selected' : ''}>
      {/* Anchor visuals */}
    </div>
  )}
</GraphBlockAnchor>
```

Anchor styling also uses CSS variables:
```css
.anchor {
  --graph-block-anchor-bg: rgba(255, 190, 92, 1);
  --graph-block-anchor-border-selected: rgba(255, 190, 92, 1);
}
```

## Graph Configuration

The graph can be extensively configured through the `useGraph` hook. See the [full configuration reference](https://gravity-ui.com/components/graph) for details.

### Layer Management

The `useLayer` hook provides a convenient way to add and manage layers in the graph:

```tsx
import { useLayer } from '@gravity-ui/graph';

function CustomGraph() {
  const { graph } = useGraph();

  // Add and manage a custom layer
  const devToolsLayer = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize: 20,
  });

  // Layer's props will be automatically updated when they change
  const [rulerSize, setRulerSize] = useState(20);
  
  // No need to manually call setProps - useLayer handles this
  const devToolsLayer = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize, // When this changes, layer will be updated
  });

  return <GraphCanvas graph={graph} />;
}
```

The hook:
- Automatically handles layer initialization and cleanup
- Updates layer props when they change
- Provides proper TypeScript types for layer props
- Returns the layer instance for direct access if needed

### View Configuration
```tsx
const config = {
  viewConfiguration: {
    colors: {
      block: {
        background: "rgba(37, 27, 37, 1)",
        border: "rgba(229, 229, 229, 0.2)",
        selectedBorder: "rgba(255, 190, 92, 1)"
      },
      connection: {
        background: "rgba(255, 255, 255, 0.5)",
        selectedBackground: "rgba(234, 201, 74, 1)"
      },
      anchor: {
        background: "rgba(255, 190, 92, 1)"
      },
      canvas: {
        layerBackground: "rgba(22, 13, 27, 1)",
        dots: "rgba(255, 255, 255, 0.2)"
      }
    },
    constants: {
      block: {
        SCALES: [0.1, 0.2, 0.5], // Zoom levels for block rendering
      }
    }
  }
};
```

### Behavior Settings
```tsx
const config = {
  settings: {
    // Camera controls
    canDragCamera: true,
    canZoomCamera: true,
    
    // Block interactions
    canDragBlocks: true,
    canDuplicateBlocks: false,
    canChangeBlockGeometry: 'ALL', // 'NONE' | 'ALL' | 'SELECTED'
    
    // Connection settings
    canCreateNewConnections: true,
    showConnectionArrows: true,
    useBezierConnections: true,
    
    // Visual settings
    scaleFontSize: 1,
    useBlocksAnchors: true,
    showConnectionLabels: false,
    
    // Custom block components
    blockComponents: {
      'action-block': ActionBlockComponent,
      'text-block': TextBlockComponent
    }
  }
};
```

## Event Handling

The library provides a rich set of events you can listen to:

```tsx
import { useGraphEvent } from '@gravity-ui/graph';

// When a new connection is created
useGraphEvent(graph, "connection-created", 
  ({ sourceBlockId, targetBlockId }, event) => {
    // Handle new connection
    // Use event.preventDefault() to cancel if needed
});

// When blocks are selected
useGraphEvent(graph, "blocks-selection-change", 
  ({ changes }) => {
    console.log('Added:', changes.add);
    console.log('Removed:', changes.removed);
});

// When a block is modified
useGraphEvent(graph, "block-change", 
  ({ block }) => {
    // Handle block changes
});
```

## Common Patterns

### Zooming to Content

```tsx
// Zoom to center with padding
graph.zoomTo("center", { padding: 300 });

// Zoom to specific blocks
graph.zoomTo([blockId1, blockId2], { 
  transition: 250 
});
```

### Managing Selection

```tsx
useGraphEvent(graph, "blocks-selection-change", 
  ({ changes }) => {
    const selectedBlocks = changes.add.map(id => 
      graph.rootStore.blocksList.getBlock(id)
    );
    // Update your UI with selected blocks
});
```

### Custom Connection Logic

```tsx
useGraphEvent(graph, "connection-created", 
  (connection, event) => {
    event.preventDefault(); // Prevent default connection
    
    // Apply your own connection logic
    if (validateConnection(connection)) {
      graph.api.addConnection({
        ...connection,
        // Add custom properties
      });
    }
});
```

## Complete Example

Here's a practical example that demonstrates the core features:

```tsx
import React, { useCallback } from 'react';
import { GraphCanvas, GraphBlock, GraphBlockAnchor, useGraph, useGraphEvent, TBlock } from '@gravity-ui/graph';

function BlockComponent({ block, graph }: { block: TBlock; graph: Graph }) {
  return (
    <GraphBlock 
      graph={graph} 
      block={block}
      className="custom-block"
    >
      {/* Block content */}
      <div className="block-content">
        {block.name}
      </div>

      {/* Render anchors */}
      {block.anchors.map(anchor => (
        <GraphBlockAnchor
          key={anchor.id}
          graph={graph}
          anchor={anchor}
          position="fixed"
        >
          {(state) => (
            <div className={`anchor ${state.selected ? 'selected' : ''}`}>
              <div className="anchor-dot" />
              {state.isConnecting && (
                <div className="anchor-label">
                  {anchor.type === 'IN' ? 'Input' : 'Output'}
                </div>
              )}
            </div>
          )}
        </GraphBlockAnchor>
      ))}
    </GraphBlock>
  );
}

function CustomGraph() {
  // Initialize graph
  const { graph, setEntities, start } = useGraph({
    viewConfiguration: {
      colors: {
        block: {
          background: "rgba(37, 27, 37, 1)",
          border: "rgba(229, 229, 229, 0.2)",
          selectedBorder: "rgba(255, 190, 92, 1)",
        },
        connection: {
          background: "rgba(255, 255, 255, 0.5)",
          selectedBackground: "rgba(234, 201, 74, 1)",
        },
        anchor: {
          background: "rgba(255, 190, 92, 1)",
        },
      },
    },
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
      canCreateNewConnections: true,
      useBezierConnections: true,
    },
  });

  // Initialize blocks
  React.useEffect(() => {
    const blocks: TBlock[] = [
      {
        id: 'block1',
        is: 'block',
        name: 'Source',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        selected: false,
        anchors: [
          {
            id: 'out1',
            type: 'OUT',
            x: 200,
            y: 50,
          },
        ],
      },
      {
        id: 'block2',
        is: 'block',
        name: 'Target',
        x: 400,
        y: 100,
        width: 200,
        height: 100,
        selected: false,
        anchors: [
          {
            id: 'in1',
            type: 'IN',
            x: 0,
            y: 50,
          },
        ],
      },
    ];

    setEntities({ blocks });
    start();
    graph.zoomTo("center", { padding: 100 });
  }, []);

  // Handle clicks on blocks
  useGraphEvent(graph, "click", ({ target }) => {
    console.log('Clicked block:', target);
  });

  // Render blocks
  const renderBlock = useCallback((graph, block) => (
    <BlockComponent graph={graph} block={block} />
  ), []);

  return (
    <div className="graph-container">
      <GraphCanvas 
        graph={graph} 
        renderBlock={renderBlock}
        className="custom-graph"
      />
    </div>
  );
}

// Required styles
const styles = `
.custom-graph {
  width: 100%;
  height: 100vh;
}

.custom-block {
  background-color: var(--graph-block-bg);
  border: 1px solid var(--graph-block-border);
  border-radius: 4px;
}

.custom-block.selected {
  border-color: var(--graph-block-border-selected);
}

.block-content {
  padding: 16px;
  color: white;
}

.anchor {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--graph-block-anchor-bg);
  border-radius: 50%;
  cursor: pointer;
}

.anchor.selected {
  border: 2px solid var(--graph-block-anchor-border-selected);
}

.anchor-label {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
`;
```

This example demonstrates:
1. Basic block and anchor setup
2. Connection handling
3. CSS variable usage for styling
4. Proper TypeScript typing using built-in types
5. Event handling

The graph will display:
- Two blocks with input/output anchors
- Interactive connection creation
- Proper styling and hover effects