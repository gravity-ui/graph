# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

> [Migration Guide from 0.x to 1.x →](docs/migration-guides/v0-to-v1.md)

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
2. When zooming in to detailed view, the `GraphCanvas` component:
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
import React, { useEffect } from "react";
import type { Graph, TBlock } from "@gravity-ui/graph";
import { EAnchorType, GraphState } from "@gravity-ui/graph";
import { GraphCanvas, GraphBlock, useGraph } from "@gravity-ui/graph/react";

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
          anchors: [
            {
              id: "out1",
              blockId: "action_1",
              type: EAnchorType.OUT,
              index: 0,
            },
          ],
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
          anchors: [
            {
              id: "in1",
              blockId: "action_2",
              type: EAnchorType.IN,
              index: 0,
            },
          ],
        },
      ],
      connections: [
        {
          sourceBlockId: "action_1",
          sourceAnchorId: "out1",
          targetBlockId: "action_2",
          targetAnchorId: "in1",
        },
      ],
    });
  }, [setEntities]);

  const renderBlockFn = (graph: Graph, block: TBlock) => {
    return (
      <GraphBlock graph={graph} block={block}>
        {block.id}
      </GraphBlock>
    );
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
            name: "Block #1",
            anchors: [
                {
                    id: "out1",
                    blockId: "block1",
                    type: EAnchorType.OUT,
                    index: 0
                }
            ]
        },
        {
            is: "block-action",
            id: "block2",
            x: 300,
            y: 300,
            width: 120,
            height: 120,
            name: "Block #2",
            anchors: [
                {
                    id: "in1",
                    blockId: "block2",
                    type: EAnchorType.IN,
                    index: 0
                }
            ]
        }
    ],
    connections: [
        {
            sourceBlockId: "block1",
            sourceAnchorId: "out1",
            targetBlockId: "block2",
            targetAnchorId: "in1"
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
   - [Events](docs/system/events.md)
   - [Graph Settings](docs/system/graph-settings.md)
   - [Public API](docs/system/public_api.md)
   - [Scheduler System](docs/system/scheduler-system.md)

2. Components
   - [Canvas Graph Component](docs/components/canvas-graph-component.md)
   - [Block Component](docs/components/block-component.md)
   - [Anchors](docs/components/anchors.md)

3. Rendering
   - [Rendering Mechanism](docs/rendering/rendering-mechanism.md)
   - [Layers](docs/rendering/layers.md)

4. Blocks and Connections
   - [Block Groups](docs/blocks/groups.md)
   - [Canvas Connection System](docs/connections/canvas-connection-system.md)
