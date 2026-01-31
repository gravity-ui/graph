# Declarative Components

The `@gravity-ui/graph` library provides declarative React components that simplify working with graph layers and HTML overlays.

## Overview

Instead of using imperative hooks like `useLayer`, you can now use declarative components that automatically manage layer lifecycle and provide a more React-like development experience.

## GraphLayer

The `GraphLayer` component provides a declarative way to add existing Layer classes to the graph.

### Basic Usage

```tsx
import { GraphLayer, GraphCanvas, useGraph } from '@gravity-ui/graph/react';
import { DevToolsLayer } from '@gravity-ui/graph/plugins';

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
        showRuler={true}
        showCrosshair={true}
        rulerSize={20}
        rulerBackgroundColor="rgba(0, 0, 0, 0.8)"
        crosshairColor="rgba(255, 0, 0, 0.8)"
      />
    </GraphCanvas>
  );
}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `layer` | `Constructor<Layer>` | Layer class constructor |
| `...layerProps` | `LayerProps` | Any properties supported by the layer class |

### Accessing Layer Instance

Use a ref to access the layer instance and call its methods:

```tsx
function MyGraph() {
  const layerRef = useRef<DevToolsLayer>(null);

  const toggleLayer = () => {
    if (layerRef.current) {
      layerRef.current.setVisible(!layerRef.current.isVisible());
    }
  };

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock}>
      <GraphLayer 
        ref={layerRef}
        layer={DevToolsLayer}
        showRuler={true}
      />
      <button onClick={toggleLayer}>
        Toggle DevTools
      </button>
    </GraphCanvas>
  );
}
```

## GraphPortal

The `GraphPortal` component allows creating HTML layers without writing separate Layer classes. It uses React Portal to render content in a graph layer.

### Basic Usage

```tsx
import { GraphPortal, GraphCanvas, useGraph } from '@gravity-ui/graph/react';

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

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | - | Additional CSS classes for the layer |
| `zIndex` | `number` | `100` | Z-index for the HTML layer element |
| `transformByCameraPosition` | `boolean` | `false` | Whether HTML element should follow camera position |
| `children` | `ReactNode \| (layer, graph) => ReactNode` | - | Content to render or render function |

### Render Prop Pattern

For advanced usage, you can use the render prop pattern to access the layer instance and graph:

```tsx
<GraphPortal>
  {(layer, graph) => (
    <div style={{ position: 'absolute', top: 10, left: 10 }}>
      <button onClick={() => layer.hide()}>
        Hide Layer
      </button>
      <div>
        Graph has {graph.api.getBlocks().length} blocks
      </div>
      <button onClick={() => graph.zoomTo('center', { padding: 200 })}>
        Center Graph
      </button>
    </div>
  )}
</GraphPortal>
```

### Styling

The portal content is positioned absolutely within the graph container. Use standard CSS positioning:

```tsx
<GraphPortal>
  <div style={{
    position: 'absolute',
    top: '20px',
    right: '20px',
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 1000
  }}>
    Custom UI Content
  </div>
</GraphPortal>
```

## Combined Usage

You can combine both components in the same graph:

```tsx
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
      {/* DevTools via GraphLayer */}
      <GraphLayer 
        layer={DevToolsLayer} 
        showRuler={true} 
        showCrosshair={false} 
        rulerSize={15} 
      />

      {/* Info panel via GraphPortal */}
      <GraphPortal zIndex={300}>
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(34, 139, 34, 0.9)',
          color: 'white',
          padding: '12px',
          borderRadius: '6px'
        }}>
          ✅ GraphLayer: DevTools active<br />
          ✅ GraphPortal: Info panel
        </div>
      </GraphPortal>

      {/* Action menu with render prop */}
      <GraphPortal zIndex={250}>
        {(layer) => (
          <div style={{
            position: 'absolute',
            top: 20,
            left: 20,
            background: 'white',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            borderRadius: '8px',
            padding: '16px'
          }}>
            <h4>Actions</h4>
            <button onClick={() => graph.zoomTo('center', { padding: 200 })}>
              Center
            </button>
            <button onClick={() => layer.hide()}>
              Hide panel
            </button>
          </div>
        )}
      </GraphPortal>
    </GraphCanvas>
  );
}
```

## When to Use

### Use GraphLayer when:
- You have an existing Layer class
- You want to use the layer's built-in functionality
- You need access to layer methods through refs
- You're migrating from imperative `useLayer` usage

### Use GraphPortal when:
- You need simple HTML overlays
- You don't want to create a custom Layer class
- You need dynamic content rendering
- You want to use React components in the overlay

## Performance Considerations

- Both components automatically clean up when unmounted
- GraphPortal only renders when the graph is ready
- GraphLayer efficiently manages layer lifecycle
- Use appropriate z-index values to control rendering order

## Migration from useLayer

If you're currently using `useLayer`, you can easily migrate to `GraphLayer`. For detailed information about all available hooks, see [React Hooks Reference](hooks.md).

```tsx
// Before (imperative)
const devTools = useLayer(graph, DevToolsLayer, {
  showRuler: true,
  rulerSize: 20
});

// After (declarative)
<GraphLayer 
  layer={DevToolsLayer}
  showRuler={true}
  rulerSize={20}
/>
```

The declarative approach provides better integration with React's component lifecycle and makes your code more readable and maintainable.

