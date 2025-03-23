# Graph React Component Library

## Overview

The Graph React Component Library provides a React wrapper for a powerful graph visualization and manipulation library. It enables developers to easily create interactive node-based editors, flow diagrams, and other graph-based interfaces in React applications.

## Installation

```bash
npm install @gravity-ui/graph
```

## Core Components

### GraphCanvas

The primary component for displaying and interacting with the graph.

```tsx
import { GraphCanvas, useGraph } from '@gravity-ui/graph';

function MyGraph() {
  const { graph, setEntities, start } = useGraph({
    viewConfiguration: {
      colors: { ... },
      constants: { ... }
    },
    settings: { ... }
  });

  // Initialize the graph
  useEffect(() => {
    setEntities({ blocks: [...], connections: [...] });
    start(); // Start the graph after setting entities
  }, []);

  // Render blocks with custom components
  // Note: This function receives the graph and block object as parameters
  const renderBlockFn = (graph, block) => (
    <GraphBlock graph={graph} block={block}>
      {/* Custom content */}
    </GraphBlock>
  );

  return <GraphCanvas graph={graph} renderBlock={renderBlockFn} className="my-graph" />;
}
```

### GraphBlock

A fundamental component that properly positions block content on the canvas. It ensures that HTML elements and canvas rendering are correctly aligned at the same position, which is essential for the graph's visual integrity and interaction behavior.

```tsx
<GraphBlock 
  graph={graph} 
  block={block}
  className="custom-block-class"
  containerClassName="custom-container-class"
>
  <div>Custom Block Content</div>
</GraphBlock>
```

The `GraphBlock` component is responsible for:

1. **Position Synchronization**: Maintains proper alignment between DOM elements and underlying canvas coordinates
2. **Visual State Management**: Handles selection states, hover effects, and other visual feedback
3. **Layout Coordination**: Ensures block dimensions are properly applied and maintained
4. **Z-index Management**: Manages stacking order of blocks for proper layering
5. **CSS Variable Injection**: Sets position-related CSS variables for styling and animations

It's strongly recommended to always use `GraphBlock` as the base component for any custom block rendering, rather than creating your own positioning mechanism. This component handles the complex alignment between the Canvas rendering layer and React's DOM elements.

### GraphBlockAnchor

A specialized component for rendering connection points (anchors) on blocks. Anchors are the interactive points where connections begin and end.

```tsx
<GraphBlockAnchor
  graph={graph}
  anchor={anchor}
  position="fixed"
  className="custom-anchor-class"
>
  {(anchorState) => (
    <div className={anchorState.selected ? "selected" : ""}>
      {/* Custom anchor content */}
    </div>
  )}
</GraphBlockAnchor>
```

The `GraphBlockAnchor` component is responsible for:

1. **Connection Point Visualization**: Renders the visual representation of connection points
2. **Interaction Handling**: Manages drag interactions for creating new connections
3. **State Management**: Tracks and visualizes selection and hover states
4. **Type Differentiation**: Provides visual distinction between input and output anchors
5. **Position Maintenance**: Ensures anchors are positioned correctly relative to their parent block

Anchors are typically defined in the block data structure and should be rendered as part of the `renderBlock` function. The `position` prop determines how anchors are positioned:

- `"fixed"`: Anchors are positioned at exact coordinates relative to the block
- `"auto"`: Anchors are positioned automatically based on their type and block layout

The render prop pattern (`{(anchorState) => ...}`) gives you access to the anchor's current state, allowing for dynamic styling based on selection, hover, or connection status.

## Hooks

### useGraph

The main hook for creating and managing a graph instance.

```tsx
const { 
  graph,          // The Graph instance
  api,            // Graph API
  setSettings,    // Update graph settings
  start,          // Start the graph
  stop,           // Stop the graph
  setViewConfiguration, // Update colors and constants
  addLayer,       // Add a custom layer
  setEntities,    // Set blocks and connections
  updateEntities, // Update blocks and connections
  zoomTo,         // Zoom to specific elements
} = useGraph({
  name: "MyGraph",
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
    // Other settings...
  },
  viewConfiguration: {
    colors: { ... },
    constants: { ... }
  }
});
```

### useGraphEvent

A hook for subscribing to graph events.

```tsx
useGraphEvent(graph, "block-change", ({ block }) => {
  // Handle block changes
});

useGraphEvent(graph, "blocks-selection-change", ({ changes, list }) => {
  // Handle selection changes
});

useGraphEvent(graph, "connection-created", ({ sourceBlockId, sourceAnchorId, targetBlockId, targetAnchorId }, event) => {
  // Handle connection creation
  event.preventDefault(); // Optionally prevent default behavior
});
```

## Events

The library provides a rich event system to respond to user interactions:

- `click`: Canvas click events
- `onCameraChange`: Camera position/zoom changes
- `onBlockDragStart`, `onBlockDrag`, `onBlockDragEnd`: Block dragging events
- `onBlockSelectionChange`: Block selection changes
- `onBlockAnchorSelectionChange`: Anchor selection changes
- `onBlockChange`: Block property changes
- `onConnectionSelectionChange`: Connection selection changes
- `onStateChanged`: Graph state changes

## Block Rendering Mechanism

The rendering mechanism in the Graph library is optimized for performance:

1. **Viewport-Based Rendering**: Only blocks within the current viewport (plus a threshold area) are rendered.
2. **Scale-Level Dependent**: Blocks are only rendered at `ECameraScaleLevel.Detailed` zoom level.
3. **Block State Management**: Blocks are wrapped in a `BlockState` object that contains reactive state.

The `renderBlock` function can be implemented in two ways:

```tsx
// Basic implementation
const renderBlockFn = (graph, block) => (
  <GraphBlock graph={graph} block={block}>
    {/* Custom content */}
  </GraphBlock>
);

// Advanced implementation with access to BlockState
const renderBlockFn = (graph, block, blockState) => (
  <GraphBlock graph={graph} block={block}>
    {/* Custom content using blockState for reactive properties */}
  </GraphBlock>
);
```

## Complete Example

Here's a complete example showing how to create a simple graph editor:

```tsx
import React, { useEffect } from 'react';
import { 
  GraphCanvas, 
  GraphBlock, 
  GraphBlockAnchor, 
  useGraph, 
  useGraphEvent,
  GraphState 
} from '@gravity-ui/graph';

function GraphEditor() {
  // Initialize graph with configuration
  const { graph, setEntities, start } = useGraph({
    viewConfiguration: {
      colors: {
        block: {
          background: "rgba(37, 27, 37, 1)",
          border: "rgba(229, 229, 229, 0.2)",
          selectedBorder: "rgba(255, 190, 92, 1)",
        },
        // More color configurations...
      },
    },
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
      canCreateNewConnections: true,
      useBezierConnections: true,
      // More settings...
    },
  });

  // Set initial blocks and connections
  useEffect(() => {
    setEntities({ 
      blocks: [
        {
          is: "block-action",
          id: "block-1",
          x: -100,
          y: -100,
          width: 200,
          height: 100,
          name: "Block #1",
          anchors: [
            {
              id: "anchor-1",
              type: "OUT",
              x: 200,
              y: 50,
            }
          ]
        },
        {
          is: "block-action",
          id: "block-2",
          x: 200,
          y: 100,
          width: 200,
          height: 100,
          name: "Block #2",
          anchors: [
            {
              id: "anchor-2",
              type: "IN",
              x: 0,
              y: 50,
            }
          ]
        }
      ], 
      connections: [
        {
          sourceBlockId: "block-1",
          sourceAnchorId: "anchor-1",
          targetBlockId: "block-2",
          targetAnchorId: "anchor-2",
        }
      ] 
    });
  }, [setEntities]);

  // Render blocks with custom components
  // This function receives graph and block as parameters
  const renderBlockFn = (graph, block) => (
    <>
      <GraphBlock graph={graph} block={block}>
        <div className="block-header">{block.name}</div>
        <div className="block-content">{block.content}</div>
        {block.anchors.map(anchor => (
            <GraphBlockAnchor 
            key={anchor.id} 
            graph={graph} 
            anchor={anchor} 
            position="fixed"
            />
        ))}
      </GraphBlock>
    </>
  );

  return (
    <GraphCanvas 
      graph={graph} 
      renderBlock={renderBlockFn}
      onStateChanged={({ state }) => {
        if (state === GraphState.ATTACHED) {
          start();
          graph.zoomTo("center", { padding: 300 });
        }
      }}
    />
  );
}
```

## Advanced Features

The Graph React Component library supports:

1. **Custom Block Rendering**: Create blocks with complex UI using regular React components
2. **Dynamic Block Creation**: Create new blocks when dropping connections
3. **Selection Management**: Select and manipulate multiple blocks simultaneously
4. **Zoom and Pan Controls**: Easily navigate large graphs
5. **Custom Connection Styles**: Configure connection appearance and behavior
6. **Theming**: Customize colors and visual appearance
7. **Performance Optimization**: Handles large graphs with thousands of nodes efficiently
   - Only renders blocks within the viewport
   - Uses scale-dependent rendering
   - Debounces update operations

## Best Practices

1. **Use the hooks system**: The hooks provide a clean and efficient way to interact with the graph
2. **Custom rendering**: Leverage the renderBlock function for block customization
   - Keep renderBlock implementations simple and focused on UI
   - Handle anchors within the renderBlock function when needed
3. **Lifecycle management**: Initialize the graph properly
   - Set entities before starting the graph
   - Use onStateChanged to detect when the graph is ready
4. **Event handling**: Use event handlers to respond to user interactions
5. **State management**: Let the graph manage its own state, but integrate with your application's state when needed
6. **Lazy loading**: For large graphs, the library automatically handles viewport-based rendering 