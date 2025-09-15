# @gravity-ui/graph-react

React components and hooks for @gravity-ui/graph library.

## Features

- React components for graph rendering
- Hooks for graph state management
- TypeScript support
- Seamless integration with @gravity-ui/graph

## Installation

```bash
npm install @gravity-ui/graph-react @gravity-ui/graph
```

## Usage

```tsx
import React from 'react';
import { GraphCanvas, useGraph } from '@gravity-ui/graph-react';

function MyGraphComponent() {
  const graph = useGraph(graphConfig);

  return (
    <GraphCanvas 
      graph={graph}
      renderBlock={(block) => <div>{block.id}</div>}
    />
  );
}
```

## Components

- `GraphCanvas` - Main graph rendering component
- `GraphBlock` - React wrapper for blocks
- `GraphBlockAnchor` - Anchor components for connections
- `GraphLayer` - Layer management component

## Hooks

- `useGraph` - Graph instance management
- `useGraphEvent` - Event subscription
- `useLayer` - Layer management
- `useBlockState` - Block state management

## Documentation

For full documentation, please visit the main repository.

## Development

This package is part of the @gravity-ui/graph monorepo and depends on @gravity-ui/graph.

## License

MIT
