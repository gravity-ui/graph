# Graph Visualization Library

A powerful and flexible library for building interactive, canvas-based graph visualizations with blocks, connections, and advanced rendering capabilities.

## Overview

This library provides a comprehensive system for rendering and interacting with graph-based visualizations. It features a component-based architecture with efficient rendering mechanisms, spatial awareness, and a rich set of interactive capabilities.

## Key Features

- **Component-Based Architecture**: Build complex visualizations using reusable components
- **Efficient Rendering**: Optimized canvas rendering with layering and batching support
- **Spatial Awareness**: HitBox system for efficient interaction and collision detection
- **Connection System**: Flexible system for creating and styling connections between blocks
- **Block Management**: Create, customize, and organize blocks with grouping support
- **Event Handling**: Comprehensive event system for user interactions
- **Lifecycle Management**: Well-defined component lifecycle for predictable behavior

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
```

## Documentation

The documentation is organized into logical sections that cover all aspects of the library:

### Core Concepts

| Section | Description |
|---------|-------------|
| [Component Lifecycle](./system/component-lifecycle.md) | Understanding initialization, update, rendering, and unmounting phases |
| [Rendering Mechanism](./rendering/rendering-mechanism.md) | How the rendering pipeline works and optimization techniques |
| [Event System](./system/events.md) | Event handling, propagation, and custom events |

### Main Components

| Component | Description |
|-----------|-------------|
| [Canvas Graph](./components/canvas-graph-component.md) | Foundation for all visual elements with HitBox system and spatial awareness |
| [Block Component](./components/block-component.md) | Building blocks for graph nodes with customization options |
| [Connections](./connections/canvas-connection-system.md) | System for creating and styling connections between blocks |

### Advanced Features

| Feature | Description |
|---------|-------------|
| [Layer System](./rendering/layers.md) | Managing z-index ordering and layer-specific rendering |
| [Block Groups](./blocks/groups.md) | Automatic and manual grouping of blocks |
| [Scheduler System](./system/scheduler-system.md) | Manages frame scheduling and update prioritization |

### Configuration

| Topic | Description |
|-------|-------------|
| [Graph Settings](./system/graph-settings.md) | Configuration options, colors, layout parameters |
| [Public API](./system/public_api.md) | Methods for graph manipulation and entity management |

## Examples

For more examples and usage scenarios, see the `src/stories` directory in the project repository.