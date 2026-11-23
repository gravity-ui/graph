# React Components API

In v2, React integration is provided by `@gravity-ui/graph-react`. Use the matching core package and load both stylesheets
in the application entrypoint:

```ts
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
```

## Import Structure

The library separates core functionality from React components:

```typescript
// Core functionality (no React dependency)
import { Graph } from "@gravity-ui/graph";

// React components (requires React)
import { GraphCanvas, GraphBlock, GraphBlockAnchor, useGraph, useGraphEvent } from "@gravity-ui/graph-react";

// Public component styles
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
```

## Architecture

The core scene draws blocks, anchors and built-in connections with Canvas 2D by default. To use WebGL2, pass
`settings: { renderer: "webgl" }` to `useGraph`. Both use the same geometry for drawing and picking.
`GraphCanvas` mounts a React layer for visible HTML block views at the detailed zoom level. Connections stay in
the scene when blocks switch to HTML. See the [scene guide](../system/scene.md).

## Key Components

### GraphCanvas

The main container component that renders your graph:

```tsx
import { GraphCanvas } from "@gravity-ui/graph-react";

<GraphCanvas 
  graph={graph}
  renderBlock={renderBlock}
  className="my-graph"
  blockListClassName="custom-blocks-container"
  reactLayerRef={reactLayerRef}
/>
```

#### Props

- **`graph`** (required): The Graph instance to render
- **`renderBlock`** (optional): Function to render custom block components
- **`className`** (optional): CSS class for the main container
- **`blockListClassName`** (optional): CSS class applied to the blocks container layer
- **`reactLayerRef`** (optional): Ref to access the ReactLayer instance directly
- **Event callbacks**: All graph event callbacks can be passed as props

### GraphBlock

The `GraphBlock` component is a crucial wrapper that handles the complex interaction between HTML elements and the canvas layer. It's responsible for:

1. **Position Synchronization**: Automatically aligns HTML content with canvas coordinates
2. **State Management**: Handles selection, hover states, and drag interactions
3. **Layout Management**: Maintains proper block dimensions and positioning
4. **Z-index Handling**: Manages proper layering of blocks
5. **CSS Variables**: Injects position and state variables for styling

```tsx
import { GraphBlock } from "@gravity-ui/graph-react";

<GraphBlock 
  graph={graph} 
  block={block}
  className="custom-block"
  containerClassName="custom-container"
>
  <div>Your block content here</div>
</GraphBlock>
```

`GraphBlock` and `GraphBlockAnchor` add a `graph-tag-<name>` class for each entity tag and expose resolved part
colors as CSS variables. Custom wrappers can read the same values with `useEntityStyle`. See
[tags and styles](../system/tags-and-styles.md).

The block wrapper also has geometry and theme variables:

```css
.custom-block {
  /* Position variables (automatically set by GraphBlock) */
  --graph-block-geometry-x: 0px;
  --graph-block-geometry-y: 0px;
  --graph-block-geometry-width: 200px;
  --graph-block-geometry-height: 100px;

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

The container's stacking is not a CSS variable: `GraphBlock` writes its `style.zIndex` as `zIndex + order` from the
block's `$viewState`, where `order` is the block's rank in scene order among the blocks React shows. A container that
has just mounted gets its rank with the next graph frame.

#### The handover to HTML

`GraphBlock` hands its block over to HTML once React has rendered it, while the scene is at the detailed level: from
then on the scene stops drawing the block, its anchors and its child components. It calls the block's
`delegateRender()` (see [The handover to HTML](../components/block-component.md#the-handover-to-html)).

- `autoHideCanvas` (default `true`) hands the block over as soon as its HTML has mounted.
- `autoHideCanvas={false} canvasVisible={!ready}` keeps the scene drawing until the view is ready.
- `autoHideCanvas={false}` without `canvasVisible` keeps the scene drawing; the view still holds the block.

```tsx
import React, { useEffect, useState } from "react";

import type { Graph, TBlock } from "@gravity-ui/graph";
import { GraphBlock } from "@gravity-ui/graph-react";

function LoadingBlock({ graph, block }: { graph: Graph; block: TBlock }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 400); // data arrives
    return () => window.clearTimeout(timer);
  }, []);
  // The scene draws the block until its HTML has something to show.
  return (
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible={!ready}>
      {ready ? block.name : "Loading…"}
    </GraphBlock>
  );
}
```

ReactLayer switches its HTML at the end of the graph frame, so zooming out draws the canvas blocks in the frame that
hides the HTML. A stopped graph does not switch it. While a view holds its block at the detailed level, the block, its
anchors and its child components are hit there, drawn in the scene or not, unless a class's `static hitLevels` leaves
the detailed level out (see [Hit levels](../system/event-model.md#hit-levels)). Clicks on the HTML reach the graph's
events with the component under the pointer as the target: a click on an anchor's HTML is the graph's `click` on that
anchor (`getEventTarget(detail.sourceEvent)` returns it).

When the level becomes detailed, the blocks list holds the pointer's target until its views have mounted (at most
three graph frames), so an anchor under a still pointer is not dropped and taken back. A `GraphBlock` rendered
outside `GraphCanvas`'s blocks list, or a view that mounts later than that, can move the target once: one extra
`mouseleave` and `mouseenter`.

### GraphBlockAnchor

Render each anchor in the HTML block view to keep it visible after the scene hands the block over to HTML.
With `position="absolute"`, the component centers itself on the anchor's graph position relative to the block.
The position follows the anchor's port when its scene component is absent. With `position="fixed"`, the anchor
participates in the HTML layout and the application controls its placement.
The HTML anchor uses the styles of the anchor class selected by its block, including when `useBlocksAnchors`
is off and the block has no Canvas anchor components.

```tsx
<GraphBlock graph={graph} block={block}>
  {block.name}
  {block.anchors?.map((anchor) => (
    <GraphBlockAnchor key={anchor.id} graph={graph} anchor={anchor} position="absolute" />
  ))}
</GraphBlock>
```

Anchor styling also uses CSS variables:
```css
.anchor {
  --graph-block-anchor-bg: rgba(255, 190, 92, 1);
  --graph-block-anchor-border-selected: rgba(255, 190, 92, 1);
  --graph-block-anchor-width: 20px;
  --graph-block-anchor-height: 20px;
}
```

## React Hooks

The library provides a comprehensive set of React hooks for working with the graph:

| Hook | Description |
|------|-------------|
| `useGraph` | Create and manage a Graph instance |
| `useGraphEvent` | Subscribe to a single graph event |
| `useGraphEvents` | Subscribe to multiple graph events |
| `useLayer` | Add and manage layers |
| `useBlockState` | Subscribe to block state changes |
| `useBlockViewState` | Get block view component |
| `useBlockAnchorState` | Subscribe to anchor state changes |
| `useSignal` | Subscribe to signal values |
| `useComputedSignal` | Create computed signals |
| `useSignalEffect` | Run effects on signal changes |
| `useSignalLayoutEffect` | Run layout effects on signal changes (before paint) |
| `useSchedulerDebounce` | Create debounced function with frame timing |
| `useSchedulerThrottle` | Create throttled function with frame timing |
| `useScheduledTask` | Schedule task for frame-based execution |
| `useSceneChange` | React to camera, scene level and hit-test geometry changes |
| `useEntityStyle` | Read tag classes and resolved part colors for an HTML view |

For detailed documentation of all hooks, see [React Hooks Reference](hooks.md).

### Quick Example

```tsx
import { ECanDrag } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent, useBlockState } from "@gravity-ui/graph-react";

function MyGraph() {
  const { graph, setEntities, start } = useGraph({
    settings: { canDrag: ECanDrag.ALL },
  });

  // Subscribe to events
  useGraphEvent(graph, "block-change", ({ block }) => {
    console.log("Block changed:", block);
  });

  // Track block state
  const blockState = useBlockState(graph, "block-1");

  return <GraphCanvas graph={graph} />;
}
```

## Graph Configuration

The graph can be extensively configured through the `useGraph` hook. See the [graph settings reference](../system/graph-settings.md) for details.

## Declarative Components

In addition to the imperative `useLayer` hook, the library provides declarative React components for working with layers and HTML overlays.

### GraphLayer

The `GraphLayer` component provides a declarative way to add existing Layer classes to the graph:

```tsx
import { GraphLayer, GraphCanvas, useGraph } from '@gravity-ui/graph-react';
import { DevToolsLayer } from '@gravity-ui/graph-devtools';
import '@gravity-ui/graph-devtools/styles.css';

function MyGraph() {
  const { graph, setEntities, start } = useGraph({});

  React.useEffect(() => {
    if (graph) {
      setEntities({ blocks: [...], connections: [...] });
      start();
    }
  }, [graph]);

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock}>
      <GraphLayer 
        layer={DevToolsLayer}
        props={{
          showRuler: true,
          showCrosshair: true,
          rulerSize: 20,
          rulerBackgroundColor: "rgba(0, 0, 0, 0.8)",
          crosshairColor: "rgba(255, 0, 0, 0.8)",
        }}
      />
    </GraphCanvas>
  );
}
```

### GraphPortal

The `GraphPortal` component allows creating HTML layers without writing separate Layer classes:

```tsx
import { GraphPortal, GraphCanvas, useGraph } from '@gravity-ui/graph-react';

function MyGraph() {
  const { graph, setEntities, start } = useGraph({});
  const [counter, setCounter] = useState(0);

  React.useEffect(() => {
    if (graph) {
      setEntities({ blocks: [...], connections: [...] });
      start();
    }
  }, [graph]);

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock}>
      <GraphPortal zIndex={200}>
        <div style={{ 
          position: 'absolute', 
          top: 20, 
          right: 20,
          background: 'white',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
        }}>
          <h3>Custom UI</h3>
          <button onClick={() => setCounter(c => c + 1)}>
            Counter: {counter}
          </button>
        </div>
      </GraphPortal>
    </GraphCanvas>
  );
}
```

For more detailed information about declarative components, see the [dedicated documentation](declarative-components.md).

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
    canDrag: ECanDrag.ALL, // ECanDrag.NONE | ECanDrag.ONLY_SELECTED
    
    // Connection settings
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
import { useGraphEvent } from '@gravity-ui/graph-react';

// When a new connection is created (requires ConnectionEditingLayer from @gravity-ui/graph-connection-editing)
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

### Validating a connection

With `ConnectionEditingLayer` attached, let the layer write valid connections in the addressing mode used by
their endpoints. To reject a connection, cancel its creation event.

```tsx
useGraphEvent(graph, "connection-created", (connection, event) => {
  if (!validateConnection(connection)) event.preventDefault();
});
```

## Complete Example

Here's a practical example that demonstrates the core features:

```tsx
import React, { useCallback } from 'react';
import { Graph, type TBlock } from '@gravity-ui/graph';
import { GraphCanvas, GraphBlock, GraphBlockAnchor, useGraph, useGraphEvent } from '@gravity-ui/graph-react';

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
      {block.anchors?.map(anchor => (
        <GraphBlockAnchor
          key={anchor.id}
          graph={graph}
          anchor={anchor}
          position="absolute"
          className="anchor"
        />
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
    settings: { renderer: "webgl" },
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
        anchors: [
          {
            id: 'out1',
            blockId: 'block1',
            type: 'OUT',
            index: 0,
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
        anchors: [
          {
            id: 'in1',
            blockId: 'block2',
            type: 'IN',
            index: 0,
          },
        ],
      },
    ];

    setEntities({
      blocks,
      connections: [{
        id: 'edge',
        sourceBlockId: 'block1',
        sourceAnchorId: 'out1',
        targetBlockId: 'block2',
        targetAnchorId: 'in1',
      }],
    });
    start();
    graph.runAfterGraphReady(() => graph.zoomTo("center", { padding: 100 }));
  }, [graph, setEntities, start]);

  // Handle clicks on blocks
  useGraphEvent(graph, "click", ({ target }) => {
    console.log('Clicked block:', target);
  });

  // Render blocks
  const renderBlock = useCallback((graph: Graph, block: TBlock) => (
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

```

Apply these styles in the application stylesheet.

```css
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
  --graph-block-anchor-width: 12px;
  --graph-block-anchor-height: 12px;
  position: absolute;
  background: var(--graph-block-anchor-bg);
  border-radius: 50%;
  cursor: pointer;
}

.anchor.graph-block-anchor-selected {
  border: 2px solid var(--graph-block-anchor-border-selected);
}
```

This example demonstrates:
1. Basic block and anchor setup
2. Connection handling
3. CSS variable usage for styling
4. Proper TypeScript typing using built-in types
5. Event handling

The graph will display:
- Two blocks with input/output anchors
- A Bézier connection between the two anchors
- Proper styling and hover effects
