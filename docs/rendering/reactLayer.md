# ReactLayer

The ReactLayer is a specialized layer that enables React component rendering within the graph. It serves as a bridge between the core canvas-based rendering system and React's component-based UI.

## Purpose

The ReactLayer addresses several key challenges:

1. **Separation of Concerns**: Isolates React-specific code from the core library
2. **Framework Agnosticism**: Allows the core library to be used without React dependencies
3. **Performance Optimization**: Enables efficient rendering by only creating React components when needed
4. **Extensibility**: Provides a pattern for supporting other UI frameworks (Vue, Angular, etc.)

## Usage

### Basic Usage with GraphCanvas

In most cases, you won't need to interact with ReactLayer directly. The GraphCanvas component automatically creates and manages a ReactLayer:

```tsx
import { GraphCanvas } from '@gravity-ui/graph/react-components';

function MyGraph() {
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
}
```

### Advanced Usage

For more advanced scenarios, you can create and manage a ReactLayer directly:

```tsx
import { ReactLayer } from '@gravity-ui/graph/react-components';
import { createPortal } from 'react-dom';

function MyCustomGraph() {
  const [reactLayer, setReactLayer] = useState(null);
  
  useEffect(() => {
    // Create ReactLayer
    const layer = graph.addLayer(ReactLayer, {});
    setReactLayer(layer);
    
    return () => {
      // Clean up
      graph.detachLayer(layer);
    };
  }, [graph]);
  
  // Render React components through the layer
  return reactLayer ? (
    reactLayer.renderPortal((graph, block) => (
      <MyCustomBlockComponent graph={graph} block={block} />
    ))
  ) : null;
}
```

## API Reference

### Constructor

```typescript
constructor(props: TReactLayerProps)
```

#### Parameters

- `props`: Layer properties
  - `camera`: Camera service instance
  - `root`: Root HTML element
  - Other standard Layer properties

### Methods

#### renderPortal

```typescript
renderPortal(renderBlock: <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element): React.ReactPortal | null
```

Renders React components inside the layer's HTML element using React Portal.

##### Parameters

- `renderBlock`: Function that renders a block component
  - `graphObject`: Graph instance
  - `block`: Block data
  - Returns: React element

##### Returns

- React Portal or null if the HTML element is not available

## Implementation Details

The ReactLayer creates an HTML element that serves as the container for React components. This element is transformed according to camera movements to ensure proper positioning of React components relative to canvas elements.

When the camera zooms in to a detailed view, the BlocksList component calculates which blocks are visible in the current viewport and renders React components only for those blocks. This approach significantly improves performance by minimizing the number of React components in the DOM.

## Integration with GraphCanvas

The GraphCanvas component creates a ReactLayer and manages its lifecycle:

1. When GraphCanvas mounts, it creates a ReactLayer
2. It passes the renderBlock function to the ReactLayer
3. When GraphCanvas unmounts, it detaches the ReactLayer

This integration provides a seamless experience for React developers while maintaining the separation of concerns between the core library and React-specific code.
