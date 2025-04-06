# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

A powerful and flexible library for building interactive, canvas-based graph visualizations with blocks, connections, and advanced rendering capabilities.

> **Note:** This is the main documentation for the graph visualization library. For specific topics, please refer to the relevant sections below.

[Storybook](https://preview.gravity-ui.com/graph/)

## Install and Setup

```bash
npm install @gravity-ui/graph
```

## Overview

This library provides a comprehensive system for rendering and interacting with graph-based visualizations. It features a component-based architecture with efficient rendering mechanisms, spatial awareness, and a rich set of interactive capabilities.

## Key Features

| Feature | Description |
|---------|-------------|
| Component Architecture | Build complex visualizations using reusable components |
| Efficient Rendering | Optimized canvas rendering with layering and batching support |
| Spatial Awareness | HitBox system for efficient interaction and collision detection |
| Connection System | Flexible system for creating and styling connections between blocks |
| Block Management | Create, customize, and organize blocks with grouping support |
| Event Handling | Comprehensive event system for user interactions |
| Lifecycle Management | Well-defined component lifecycle for predictable behavior |

## Quick Start

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

## Examples

- [Basic example](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--hundred-blocks)
- [Large scale example](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--five-thousands-blocks)
- [Custom blocks view](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--custom-schematic-block)
- [Bezier connection](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--one-bezier-connection)
- [Connection customization](https://preview.gravity-ui.com/graph/?path=/story/api-updateconnection--default)

## Documentation

### Core Concepts

| Section | Description | Documentation |
|---------|-------------|---------------|
| Component Lifecycle | Component initialization, update, rendering, and unmounting | [Read More](docs/system/component-lifecycle.md) |
| Rendering Mechanism | Rendering pipeline and optimization techniques | [Read More](docs/rendering/rendering-mechanism.md) |
| Event System | Event handling, propagation, and custom events | [Read More](docs/system/events.md) |

### Main Components

| Component | Description | Documentation |
|-----------|-------------|---------------|
| Canvas Graph | Foundation for visual elements with HitBox system | [Read More](docs/components/canvas-graph-component.md) |
| Block Component | Building blocks for graph nodes | [Read More](docs/components/block-component.md) |
| Connections | Connection creation and styling system | [Read More](docs/connections/canvas-connection-system.md) |

### Advanced Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| Layer System | Z-index ordering and layer-specific rendering | [Read More](docs/rendering/layers.md) |
| Block Groups | Automatic and manual block grouping | [Read More](docs/blocks/groups.md) |
| Scheduler System | Frame scheduling and update prioritization | [Read More](docs/system/scheduler-system.md) |

### Configuration

| Topic | Description | Documentation |
|-------|-------------|---------------|
| Graph Settings | Configuration options and parameters | [Read More](docs/system/graph-settings.md) |
| Public API | Methods for graph manipulation | [Read More](docs/system/public_api.md) |

> **Note:** All code examples in the documentation use TypeScript for better type safety and developer experience.
