# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

A graph visualization library that combines the best of both worlds:
- Canvas for high performance when viewing the full graph
- HTML/React for rich interactions when zoomed in

No more choosing between performance and interactivity. Perfect for large diagrams, flowcharts, and node-based editors.

## Motivation

Modern web applications often require complex visualization and interactivity, but existing solutions typically focus on a single rendering technology:

- **Canvas** offers high performance for complex graphics but is limited in text handling and interactivity.
- **HTML DOM** is convenient for interfaces but less efficient for complex graphics or large numbers of elements.

@gravity-ui/graph solves this by automatically switching between Canvas and HTML based on zoom level:
- **Zoomed Out**: Uses Canvas for efficient rendering of the full graph
- **Medium Zoom**: Shows schematic view with basic interactivity
- **Zoomed In**: Switches to HTML/React components for rich interactions

## How It Works

The library uses a smart rendering system that automatically manages the transition between Canvas and React components:

1. At low zoom levels, everything is rendered on Canvas for performance
2. When zooming in to detailed view, the `BlocksList` component:
   - Tracks camera viewport and scale changes
   - Calculates which blocks are visible in the current viewport (with padding for smooth scrolling)
   - Renders React components only for visible blocks
   - Automatically updates the list when scrolling or zooming
   - Removes React components when zooming out

```typescript
// Example of React components rendering
const MyGraph = () => {
  return (
    <GraphCanvas
      graph={graph}
      renderBlock={(graph, block) => (
        <MyCustomBlockComponent 
          graph={graph} 
          block={block}
        />
      )}
    />
  );
};
```

[Storybook](https://preview.gravity-ui.com/graph/)

## Install

```bash
npm install @gravity-ui/graph
```

## Examples

### React Example

[Detailed React Components Documentation](docs/react/usage.md)

```typescript
import { GraphCanvas, GraphState, GraphBlock, useGraph } from "@gravity-ui/graph";
import React from "react";

const config = {};

export function GraphEditor() {
  const { graph, setEntities, start } = useGraph(config);

  useEffect(() => {
    setEntities({
      blocks: [
        {
          is: "block-action",
          id: "action_1",
          x: -100,
          y: -450,
          width: 126,
          height: 126,
          selected: true,
          name: "Block #1",
          anchors: [],
        },
        {
          id: "action_2",
          is: "block-action",
          x: 253,
          y: 176,
          width: 126,
          height: 126,
          selected: false,
          name: "Block #2",
          anchors: [],
        }
      ],
      connections: [
        {
          sourceBlockId: "action_1",
          targetBlockId: "action_2",
        }
      ]
    });
  }, [setEntities]);

  const renderBlockFn = (graph, block) => {
    return <GraphBlock graph={graph} block={block}>{block.id}</GraphBlock>;
  };

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

### Vanilla JavaScript Example

```javascript
import { Graph } from "@gravity-ui/graph";

// Create container element
const container = document.createElement('div');
container.style.width = '100vw';
container.style.height = '100vh';
container.style.overflow = 'hidden';
document.body.appendChild(container);

// Initialize graph with configuration
const graph = new Graph({
    configurationName: "example",
    blocks: [],
    connections: [],
    settings: {
        canDragCamera: true,
        canZoomCamera: true,
        useBezierConnections: true,
        showConnectionArrows: true
    }
}, container);

// Add blocks and connections
graph.setEntities({
    blocks: [
        {
            is: "block-action",
            id: "block1",
            x: 100,
            y: 100,
            width: 120,
            height: 120,
            name: "Block #1"
        },
        {
            is: "block-action",
            id: "block2",
            x: 300,
            y: 300,
            width: 120,
            height: 120,
            name: "Block #2"
        }
    ],
    connections: [
        {
            sourceBlockId: "block1",
            targetBlockId: "block2"
        }
    ]
});

// Start rendering
graph.start();

// Center the view
graph.zoomTo("center", { padding: 100 });
```

## Live Examples

- [Basic example](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--hundred-blocks)
- [Large scale example](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--five-thousands-blocks)
- [Custom blocks view](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--custom-schematic-block)
- [Bezier connection](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--one-bezier-connection)
- [Connection customization](https://preview.gravity-ui.com/graph/?path=/story/api-updateconnection--default)

## Documentation

### Table of Contents

1. System
   - [Component Lifecycle](docs/system/component-lifecycle.md)
   - [Events](docs/system/events.md) - Event system with AbortController support
   - [Graph Settings](docs/system/graph-settings.md)
   - [Public API](docs/system/public_api.md)
   - [Scheduler System](docs/system/scheduler-system.md)

2. Components
   - [Canvas Graph Component](docs/components/canvas-graph-component.md)
   - [Block Component](docs/components/block-component.md)

3. Rendering
   - [Rendering Mechanism](docs/rendering/rendering-mechanism.md)
   - [Layers](docs/rendering/layers.md) - Layer system with HTML rendering and event handling

4. Blocks and Connections
   - [Block Groups](docs/blocks/groups.md)
   - [Canvas Connection System](docs/connections/canvas-connection-system.md)

## Best Practices

### Event Handling with AbortController

The library uses AbortController for managing event listeners, which simplifies cleanup and prevents memory leaks:

```typescript
// Using AbortController (recommended for multiple event listeners)
const controller = new AbortController();

graph.on("mouseenter", (event) => {
  console.log("Mouse entered:", event.detail);
}, { signal: controller.signal });

graph.on("mouseleave", (event) => {
  console.log("Mouse left:", event.detail);
}, { signal: controller.signal });

// Later, to remove all event listeners at once:
controller.abort();
```

### Layer Event Subscriptions

When creating custom layers, always set up event subscriptions in the `afterInit()` method, not in the constructor:

```typescript
protected afterInit(): void {
  // Subscribe to events using the wrapper methods for automatic cleanup
  this.graphOn("camera-change", this.performRender);
  
  // DOM event listeners with wrapper methods
  if (this.canvas) {
    this.canvasOn("mousedown", this.handleMouseDown);
  }
  
  if (this.html) {
    this.htmlOn("click", this.handleHtmlClick);
  }
  
  if (this.root) {
    this.rootOn("keydown", this.handleRootKeyDown);
  }
  
  // Call parent afterInit to ensure proper initialization
  super.afterInit();
}
```

This ensures that event subscriptions are properly reestablished when a layer is reattached.

### Manual Event Subscriptions

While the wrapper methods (`graphOn`, `htmlOn`, `canvasOn`, `rootOn`) are recommended, you can also manually create event subscriptions using the layer's AbortController:

```typescript
protected afterInit(): void {
  // Manual subscription using the layer's AbortController
  this.canvas.addEventListener("mousedown", this.handleMouseDown, {
    signal: this.eventAbortController.signal
  });
  
  // For graph events
  this.props.graph.on("camera-change", this.performRender, {
    signal: this.eventAbortController.signal
  });
  
  // If you don't use the AbortController signal, you must handle unsubscription manually
  const unsubscribe = this.props.graph.on("block-change", this.handleBlockChange);
  
  // Store the unsubscribe function for later use
  this.unsubscribeFunctions.push(unsubscribe);
  
  // Call parent afterInit to ensure proper initialization
  super.afterInit();
}

protected unmount(): void {
  // Call super.unmount() to trigger the AbortController's abort method
  super.unmount();
  
  // Manually call any stored unsubscribe functions
  this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
  this.unsubscribeFunctions = [];
}
```

Using the wrapper methods is generally preferred as they provide automatic cleanup and error checking, but manual subscriptions give you more flexibility when needed.
