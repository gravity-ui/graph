---
description: React rules
globs: *.tsx,*.jsx
alwaysApply: false
---
# React Development Rules

## General React Guidelines

### Component Structure
- Use functional components with hooks
- Keep components focused and single-responsibility
- Extract reusable logic into custom hooks
- Implement proper cleanup in useEffect when needed

### State Management
- Keep state as close to where it's used as possible
- Use context for truly global state
- Prefer controlled components over uncontrolled
- Use state only for values that trigger re-renders

### Performance Optimization
- Memoize callbacks with useCallback when passed to children
- Use useMemo for expensive computations
- Apply React.memo() for pure components that render often
- Keep render logic simple and performant

### TypeScript Usage
- Define explicit prop types using TypeScript interfaces
- Use proper event typing
- Document complex component behavior
- Leverage TypeScript's type inference when possible

### Error Handling
- Implement ErrorBoundary for error handling
- Handle loading and error states explicitly
- Provide meaningful error messages
- Add fallback UI for error states

### Resource Cleanup
- Clean up subscriptions in useEffect
- Clear timers and intervals
- Remove event listeners
- Dispose of resources properly

### Best Practices
- Use semantic HTML elements
- Implement proper accessibility attributes
- Keep JSX clean and readable
- Write unit tests for components
- Use React.StrictMode in development

## @gravity-ui/graph Specific Rules

### Core Components

#### GraphCanvas
- Use as the main container for graph rendering
- Always provide required props:
  ```tsx
  <GraphCanvas 
    graph={graph}
    renderBlock={renderBlock}
  />
  ```

#### GraphBlock
- Use for wrapping HTML block content
- Component handles automatically:
  - Position synchronization with canvas
  - State management (selection, hover)
  - Layout management
  - Z-index handling
  - CSS variables injection

```tsx
<GraphBlock 
  graph={graph} 
  block={block}
  className="custom-block"
>
  <div>Block content</div>
</GraphBlock>
```

#### GraphBlockAnchor
- Use for rendering connection points on blocks
- Supports two positioning modes:
  1. `fixed` - exact coordinates relative to block
  2. `auto` - automatic positioning based on type (input/output)

```tsx
<GraphBlockAnchor 
  graph={graph} 
  anchor={anchor}
  position="fixed" // or "auto"
>
  {(state) => (
    <div className={state.selected ? 'selected' : ''}>
      {/* Anchor content */}
    </div>
  )}
</GraphBlockAnchor>
```

### Layer Management

#### useLayer Hook
- Use for adding and managing layers:
  ```tsx
  const devToolsLayer = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize: 20,
  });
  ```
- Hook features:
  - Automatic layer initialization and cleanup
  - Props updates handling
  - TypeScript type support
  - Direct layer instance access

### Event Handling

#### useGraphEvent Hook
- Use for subscribing to graph events:
```tsx
useGraphEvent(graph, "connection-created", 
  ({ sourceBlockId, targetBlockId }, event) => {
    // Handle new connection
    // Use event.preventDefault() to cancel
});

useGraphEvent(graph, "blocks-selection-change", 
  ({ changes }) => {
    console.log('Added:', changes.add);
    console.log('Removed:', changes.removed);
});
```

### Styling

#### CSS Variables
- Use CSS variables for component styling:
```css
.custom-block {
  /* Positioning (automatic) */
  --graph-block-geometry-x: 0px;
  --graph-block-geometry-y: 0px;
  --graph-block-geometry-width: 200px;
  --graph-block-geometry-height: 100px;
  --graph-block-z-index: 1;
  
  /* Theme (from graph settings) */
  --graph-block-bg: rgba(37, 27, 37, 1);
  --graph-block-border: rgba(229, 229, 229, 0.2);
  --graph-block-border-selected: rgba(255, 190, 92, 1);
}
```

### Configuration

#### View Configuration
- Configure appearance through viewConfiguration:
```tsx
const config = {
  viewConfiguration: {
    colors: {
      block: {
        background: "rgba(37, 27, 37, 1)",
        border: "rgba(229, 229, 229, 0.2)",
        selectedBorder: "rgba(255, 190, 92, 1)"
      },
      connection: {
        background: "rgba(255, 255, 255, 0.5)",
        selectedBackground: "rgba(234, 201, 74, 1)"
      }
    }
  }
};
```

#### Behavior Settings
- Configure behavior through settings:
```tsx
const config = {
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
    canDragBlocks: true,
    canCreateNewConnections: true,
    showConnectionArrows: true,
    useBezierConnections: true
  }
};
```

### Library-Specific Best Practices

1. **Graph State Management**
   - Use graph's built-in state management for graph-related data
   - Leverage graph events for state updates
   - Keep external state synchronized with graph state

2. **Performance**
   - Use appropriate zoom levels for block rendering
   - Implement proper layer management
   - Optimize connection rendering with BatchPath2D

3. **Type Safety**
   - Use library's built-in types
   - Define explicit types for custom blocks and anchors
   - Leverage type inference from graph context

4. **Resource Management**
   - Clean up graph subscriptions
   - Properly dispose of layers
   - Handle graph lifecycle events

5. **Error Handling**
   - Implement fallbacks for graph rendering errors
   - Handle connection validation errors
   - Provide meaningful error states for blocks 