# Migration Guide: v0.x → v1.x

## What's Changed

The major architectural change in v1.x is the **extraction of React from the core library**. This creates a cleaner separation between:

- **Core Library** (`@gravity-ui/graph`) - Canvas rendering, graph logic, no framework dependencies
- **React Components** (`@gravity-ui/graph/react`) - React-specific hooks and components
- **Optional Layers** - Some advanced layers are now separate optional imports

## Quick Migration Checklist

- [ ] Update imports to separate core and React components
- [ ] Ensure React is in your project's dependencies  
- [ ] Migrate from `GraphComponent` to `GraphCanvas` + `useGraph`
- [ ] Update layer imports (ConnectionLayer, NewBlockLayer, useLayer hook)

## New Import Structure

### Before (v0.x)
```typescript
import { 
  Graph, 
  GraphCanvas, 
  useGraph, 
  useGraphEvent, 
  TGraphConfig 
} from "@gravity-ui/graph";
```

### After (v1.x)
```typescript
// Core functionality (no React dependency)
import { 
  Graph, 
  TGraphConfig,
  EAnchorType,
  Layer
} from "@gravity-ui/graph";

// React components (requires React)
import { 
  GraphCanvas, 
  useGraph, 
  useGraphEvent 
} from "@gravity-ui/graph/react";

// Optional layers (import only if needed)
import { ConnectionLayer, NewBlockLayer } from "@gravity-ui/graph";
```

## 🎨 Layer System Changes

In v1.x, the layer system has been optimized:

- **Built-in Optional Layers**: `ConnectionLayer` and `NewBlockLayer` are now optional imports instead of being automatically included
- **React Layer Hooks**: `useLayer` hook moved to `@gravity-ui/graph/react`
- **Benefits**: Smaller core bundle size, tree-shaking friendly

### Available Layers

| Layer | Purpose | Import Path |
|-------|---------|-------------|
| `ConnectionLayer` | Drag-to-connect functionality between blocks/anchors | `@gravity-ui/graph` |
| `NewBlockLayer` | Alt+drag block duplication | `@gravity-ui/graph` |
| Custom layers | User-defined layers with `useLayer` hook | N/A |

## 🔧 Step-by-Step Migration

### Step 1: Update Your Imports

**What moves to `/react`:**
- All React components: `GraphCanvas`, `GraphBlock`, `GraphBlockAnchor`  
- All React hooks: `useGraph`, `useGraphEvent`, `useGraphEvents`, `useLayer`, `useElk`
- React-specific types: `TRenderBlockFn`, `GraphProps`, `TGraphEventCallbacks`

**What stays in core:**
- Graph class and configuration: `Graph`, `TGraphConfig`
- Enums: `EAnchorType`, `EBlockType`, etc.
- Canvas components: `Block`, `Connection`, `Layer`
- Store types: `BlockState`, `ConnectionState`

### Step 2: Check Dependencies

Ensure React is in your `package.json`:

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@gravity-ui/graph": "^1.0.0"
  }
}
```

### Step 3: Migrate Component Usage

#### Old Pattern (Deprecated)
```typescript
const graphRef = useRef<Graph>();

<GraphComponent 
  config={config}
  graphRef={graphRef}
  renderBlockFn={renderBlock}
  onStateChanged={onStateChanged}
/>
```

#### New Pattern (Recommended)
```typescript
const { graph, setEntities, start } = useGraph(config);

useEffect(() => {
  setEntities({ blocks, connections });
  start();
}, [setEntities, start, blocks, connections]);

<GraphCanvas 
  graph={graph}
  renderBlock={renderBlock}
  onStateChanged={onStateChanged}
/>
```

### Step 4: Import Optional Layers

Some advanced layers are now optional imports to keep the core library lightweight:

#### ConnectionLayer (for drag-to-connect functionality)
```typescript
// Before (automatically included)
// No explicit import needed

// After (explicit import required)
import { ConnectionLayer } from "@gravity-ui/graph";

const { graph } = useGraph();

// Add layer with configuration
graph.addLayer(ConnectionLayer, {
  createIcon: {
    path: "M7 0.75C7.41421...",
    width: 14,
    height: 14,
    viewWidth: 14,
    viewHeight: 14,
  },
  isConnectionAllowed: (sourceComponent) => {
    return sourceComponent instanceof AnchorState;
  }
});
```

#### NewBlockLayer (for Alt+drag block duplication)
```typescript
// Before (automatically included)
// No explicit import needed

// After (explicit import required)
import { NewBlockLayer } from "@gravity-ui/graph";

const { graph } = useGraph();

// Add layer with configuration
graph.addLayer(NewBlockLayer, {
  ghostBackground: "rgba(255, 255, 255, 0.3)",
  isDuplicateAllowed: (block) => {
    return block.type !== "special-block";
  }
});
```

## 📋 Migration Examples

### Basic Graph Setup

#### Before
```typescript
import { Graph, GraphComponent, useRef } from "@gravity-ui/graph";

function MyApp() {
  const graphRef = useRef<Graph>();
  
  return (
    <GraphComponent
      config={{
        blocks: [...],
        connections: [...]
      }}
      graphRef={graphRef}
      renderBlockFn={renderBlock}
    />
  );
}
```

#### After
```typescript
import { Graph } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph/react";

function MyApp() {
  const { graph, setEntities, start } = useGraph({
    settings: { /* graph settings */ }
  });

  useEffect(() => {
    setEntities({
      blocks: [...],
      connections: [...]
    });
    start();
  }, [setEntities, start]);
  
  return (
    <GraphCanvas
      graph={graph}
      renderBlock={renderBlock}
    />
  );
}
```

### Event Handling

#### Before
```typescript
import { useGraphEvent } from "@gravity-ui/graph";

// Usage remains the same
useGraphEvent(graph, "block-drag-end", (detail, event) => {
  console.log("Block moved:", detail);
});
```

#### After
```typescript
import { useGraphEvent } from "@gravity-ui/graph/react";

// Usage remains exactly the same
useGraphEvent(graph, "block-drag-end", (detail, event) => {
  console.log("Block moved:", detail);
});
```

### Custom Layers (Using useLayer Hook)

#### Before
```typescript
import { useLayer } from "@gravity-ui/graph";

const customLayer = useLayer(graph, CustomLayer, { 
  prop1: "value1" 
});
```

#### After
```typescript
import { useLayer } from "@gravity-ui/graph/react";

const customLayer = useLayer(graph, CustomLayer, { 
  prop1: "value1" 
});
```

### Built-in Optional Layers

#### Before
```typescript
// ConnectionLayer and NewBlockLayer were automatically available
// No imports needed - they were part of the core
```

#### After
```typescript
// Import specific layers you need
import { ConnectionLayer, NewBlockLayer } from "@gravity-ui/graph";

// Add layers explicitly when needed
graph.addLayer(ConnectionLayer, {
  // Connection creation configuration
});

graph.addLayer(NewBlockLayer, {
  // Block duplication configuration
});
```

## ⚠️ Breaking Changes Summary

| What Changed | Old Code | New Code |
|--------------|----------|----------|
| React imports | `import { useGraph } from "@gravity-ui/graph"` | `import { useGraph } from "@gravity-ui/graph/react"` |
| GraphComponent | `<GraphComponent />` | `<GraphCanvas />` + `useGraph` hook |
| Built-in layers | Automatically included | Import explicitly from `@gravity-ui/graph` |
| useLayer hook | `@gravity-ui/graph` | `@gravity-ui/graph/react` |
