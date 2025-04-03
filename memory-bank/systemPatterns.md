# System Patterns

This file documents recurring patterns and standards used in the project.
It is optional, but recommended to be updated as the project evolves.
2025-04-03 14:52:51 - Log of updates made.

## Coding Patterns

### Component Lifecycle Pattern
The library implements a comprehensive component lifecycle with specific hooks at different stages:
- **Initialization Phase**: constructor → willMount
- **Rendering Phase**: willIterate → willRender → render → didRender
- **Children Update Phase**: willUpdateChildren → updateChildren → didUpdateChildren
- **Completion Phase**: didIterate
- **Unmounting Phase**: unmount

### State and Props Management Pattern
Components manage their state and props using a two-phase approach:
- **Request Phase**: `setState` or `setProps` stores the next state/props in a temporary buffer
- **Apply Phase**: During `checkData`, the buffered changes are applied to the actual state/props
This approach allows for batching multiple state/props updates into a single render cycle.

### BatchPath2D Pattern for Rendering
The library uses a batching system for rendering similar elements:
- Elements with the same visual properties are batched together
- Each group only requires one style setup (color, line width, etc.)
- This dramatically reduces the number of state changes in the canvas context

## Architectural Patterns

### Component-Based Architecture
The library uses a component-based architecture where:
- **GraphComponent** - Base component for all visual elements
- **Block Component** - For rendering and interacting with graph nodes
- **Connection System** - Framework for rendering connections between blocks
- **Layers System** - For managing the z-index and rendering order of components

### Connection System Architecture
The connection system follows a hierarchical structure:
- **BaseConnection** - Foundation class for connections
- **BlockConnection** - Optimized rendering with Path2D
- **CustomConnections** - Specialized connection types like MultipointConnection

### Tree-Based Component Hierarchy
Components are organized in a hierarchical tree structure:
- Parent-child relationships managed by the Tree class
- Z-index based ordering of children
- Traversal methods for walking the tree efficiently

### Group Management Pattern
The library provides two ways to manage block groups:
1. **Automatic Groups** - Groups update automatically based on block properties
2. **Manual Groups** - Direct control over groups, useful for user-created groups

## Testing Patterns

### Performance Optimization Patterns
- **Control Rendering with Lifecycle Flags**:
  ```typescript
  protected propsChanged(nextProps) {
    // Only render if relevant props have changed
    this.shouldRender = nextProps.value !== this.props.value;
  }
  ```

- **Z-Index Management for Layering**:
  ```typescript
  // Set z-index for proper rendering order
  this.zIndex = 5; // Higher z-index components render on top
  ```

- **Batch State Updates**:
  ```typescript
  // Batch updates in one call
  this.setState({ value: 1, count: 2 });
  ```

### Component Creation Best Practices
- **Use Component.create Instead of Direct Instantiation**:
  ```typescript
  // Correct - Use static create method
  MyComponent.create(props, { key: 'unique-key' })
  ```

- **Only Create Children in updateChildren Method**:
  ```typescript
  protected updateChildren() {
    return [
      ChildComponent.create({ value: this.state.value }, { key: 'child1' })
    ];
  }
  ```

2025-04-03 14:59:24 - Added an overview of the Graph class from graph.ts, detailing its components and functionality.
2025-04-03 15:08:53 - Updated with detailed patterns derived from the library documentation, including component lifecycle, state management, rendering architecture, and best practices.