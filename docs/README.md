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
import { Graph, Block } from '@gravity-ui/graph';

// Create a graph instance
const graph = new Graph({
  container: document.getElementById('graph-container'),
  width: 800,
  height: 600
});

// Add some blocks
const block1 = graph.addBlock({
  x: 100, 
  y: 100, 
  width: 120, 
  height: 80,
  name: "Block 1"
});

const block2 = graph.addBlock({
  x: 300, 
  y: 200, 
  width: 120, 
  height: 80,
  label: "Block 2"
});

// Connect the blocks
graph.addConnection({
  source: { blockId: block1, anchorId: 'output' },
  target: { blockId: block2, anchorId: 'input' }
});

// Update entities as needed
graph.updateEntities({
  blocks: [{ id: block1, label: 'Updated Block Name' }]
});
```

## Documentation

### Components

The library is built around a component-based architecture:

- [Canvas Graph Component](./components/canvas-graph-component.md) - The foundation for all visual elements
- [Block Component](./components/block-component.md) - For rendering and interacting with graph nodes

### Connections

- [Canvas Connection System](./connections/canvas-connection-system.md) - Framework for rendering and interacting with connections

### System

- [Component Lifecycle](./system/component-lifecycle.md) - Detailed explanation of component lifecycle
- [Events](./system/events.md) - Event handling mechanisms
- [Public API](./system/public_api.md) - Methods for interacting with the graph
- [Scheduler System](./system/scheduler-system.md) - Manages component updates and rendering

### Rendering

- [Rendering Mechanism](./rendering/rendering-mechanism.md) - Details of the rendering pipeline
- [Layers](./rendering/layers.md) - Layer-based rendering system

### Blocks

- [Groups](./blocks/groups.md) - Working with block groups for organization

## Table of Contents

### Components
- [Canvas Graph Component](./components/canvas-graph-component.md)
  - Foundation for all visual elements
  - HitBox system
  - Spatial awareness
  - Event handling

- [Block Component](./components/block-component.md)
  - Block architecture
  - Rendering blocks
  - Block states and controllers
  - Customization options

### Connections
- [Canvas Connection System](./connections/canvas-connection-system.md)
  - Connection architecture
  - Path rendering
  - Connection styling
  - Interaction handling

### System
- [Component Lifecycle](./system/component-lifecycle.md)
  - Initialization phase
  - Update cycle
  - Rendering pipeline
  - Unmounting process

- [Events](./system/events.md)
  - Event handling
  - Event propagation
  - Custom events

- [Public API](./system/public_api.md)
  - Graph manipulation methods
  - Configuration options
  - Entity management

- [Scheduler System](./system/scheduler-system.md)
  - Frame scheduling
  - Performance optimization
  - Update prioritization

### Rendering
- [Rendering Mechanism](./rendering/rendering-mechanism.md)
  - Component structure
  - Rendering pipeline
  - Optimization techniques

- [Layers](./rendering/layers.md)
  - Layer management
  - Z-index ordering
  - Layer-specific rendering

### Blocks
- [Groups](./blocks/groups.md)
  - Automatic grouping
  - Manual group management
  - Group styling and behavior