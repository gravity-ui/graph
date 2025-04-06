# Graph Visualization Library

A powerful and flexible library for building interactive, canvas-based graph visualizations with blocks, connections, and advanced rendering capabilities.

> **Note:** This is the main documentation for the graph visualization library. For specific topics, please refer to the relevant sections below.

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
import { Graph } from '@gravity-ui/graph';

// Create a graph instance
const graph = new Graph({}, document.getElementById("graph-container"));

// Set initial entities
graph.setEntities({
  blocks: [
    { id: "block1", x: 100, y: 100, width: 120, height: 80, name: "Block 1" },
    { id: "block2", x: 300, y: 200, width: 120, height: 80, name: "Block 2" }
  ],
  connections: [
    { sourceBlockId: "block1", targetBlockId: "block2" }
  ]
});

graph.start();
```

## Documentation Structure

### Core Concepts

| Section | Description | Documentation |
|---------|-------------|---------------|
| Component Lifecycle | Component initialization, update, rendering, and unmounting | [Read More](./system/component-lifecycle.md) |
| Rendering Mechanism | Rendering pipeline and optimization techniques | [Read More](./rendering/rendering-mechanism.md) |
| Event System | Event handling, propagation, and custom events | [Read More](./system/events.md) |

### Main Components

| Component | Description | Documentation |
|-----------|-------------|---------------|
| Canvas Graph | Foundation for visual elements with HitBox system | [Read More](./components/canvas-graph-component.md) |
| Block Component | Building blocks for graph nodes | [Read More](./components/block-component.md) |
| Connections | Connection creation and styling system | [Read More](./connections/canvas-connection-system.md) |

### Advanced Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| Layer System | Z-index ordering and layer-specific rendering | [Read More](./rendering/layers.md) |
| Block Groups | Automatic and manual block grouping | [Read More](./blocks/groups.md) |
| Scheduler System | Frame scheduling and update prioritization | [Read More](./system/scheduler-system.md) |

### Configuration

| Topic | Description | Documentation |
|-------|-------------|---------------|
| Graph Settings | Configuration options and parameters | [Read More](./system/graph-settings.md) |
| Public API | Methods for graph manipulation | [Read More](./system/public_api.md) |

## Examples

For practical examples and usage scenarios, please refer to the following resources:

1. Source Code Examples: See the `src/stories` directory in the project repository
2. Interactive Demos: Available in the Storybook documentation
3. API Examples: Found in each component's documentation

> **Note:** All code examples in the documentation use TypeScript for better type safety and developer experience.