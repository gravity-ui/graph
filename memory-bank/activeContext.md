# Active Context: @gravity-ui/graph

## Current Work Focus

The current focus of the @gravity-ui/graph project is on understanding the existing codebase, documenting the architecture and patterns, and establishing a solid foundation for future development. This includes:

1. **Documentation Improvement**
   - Creating comprehensive memory bank documentation
   - Understanding the core architecture and design patterns
   - Mapping out component relationships and interactions

2. **Architecture Analysis**
   - Analyzing the layered architecture of the library
   - Understanding the component lifecycle and rendering pipeline
   - Exploring the event system and data flow

3. **Feature Exploration**
   - Understanding the hybrid rendering approach (Canvas + React)
   - Exploring the scale-dependent rendering system
   - Investigating the spatial indexing and hit detection system

## Recent Changes

Recent code changes include:

1. **Enhanced Event Handling in Layers**
   - Added new wrapper methods for DOM event handling in the Layer class:
     - `htmlOn`: For adding event listeners to the HTML element of the layer
     - `canvasOn`: For adding event listeners to the canvas element of the layer
     - `rootOn`: For adding event listeners to the root element of the layer
   - Updated existing layers to use these wrapper methods
   - Ensured all event subscriptions are set up in the `afterInit()` method
   - Improved cleanup by using AbortController for all event listeners

2. **Documentation Updates**
   - Updated docs/rendering/layers.md to document the new wrapper methods
   - Updated layer-rules.mdc and event-model-rules.mdc to reflect the new event handling approach
   - Added examples of using the new wrapper methods

3. **Code Refactoring**
   - Refactored GraphLayer to use the new rootOn method
   - Refactored BlockGroups to move event subscriptions to afterInit
   - Refactored MiniMapLayer to use the new canvasOn method

## Next Steps

The immediate next steps for the project are:

1. **Complete Documentation**
   - Finalize the memory bank documentation
   - Create additional context files as needed
   - Ensure all core concepts are properly documented

2. **Explore Implementation Details**
   - Dive deeper into the component implementation
   - Understand the rendering optimization techniques
   - Explore the event handling system in detail

3. **Identify Improvement Areas**
   - Look for potential performance optimizations
   - Identify areas for API improvements
   - Consider additional features or enhancements

## Active Decisions and Considerations

### 1. Documentation Structure

**Decision**: Create a comprehensive memory bank with six core files:
- projectbrief.md - Core requirements and goals
- productContext.md - Why the project exists and problems it solves
- systemPatterns.md - System architecture and design patterns
- techContext.md - Technologies used and technical constraints
- activeContext.md - Current work focus and next steps
- progress.md - Current status and known issues

**Rationale**: This structure provides a clear separation of concerns and makes it easy to find specific information. It also follows the recommended memory bank structure from the .clinerules file.

### 2. Architecture Documentation Approach

**Decision**: Document the architecture using a combination of text descriptions, code examples, and Mermaid diagrams.

**Rationale**: This approach provides a comprehensive understanding of the architecture from different perspectives. Text descriptions explain the concepts, code examples show the implementation, and diagrams visualize the relationships.

### 3. Component Relationship Mapping

**Decision**: Map out the relationships between components using class diagrams and sequence diagrams.

**Rationale**: Understanding the relationships between components is crucial for working with the library. Class diagrams show the static structure, while sequence diagrams show the dynamic interactions.

### 4. Event Model Documentation

**Decision**: Document the event model with a focus on the custom event system based on the DOM EventTarget API.

**Rationale**: The event system is a core part of the library's architecture and is used extensively for communication between components. Understanding this system is crucial for working with the library.

## Important Patterns and Preferences

### 1. Component Lifecycle

The library uses a comprehensive component lifecycle with hooks for different stages:
- Initialization: Constructor and willMount
- Rendering: willRender, render, didRender
- Updates: willIterate, didIterate
- Children Management: willUpdateChildren, updateChildren, didUpdateChildren
- Cleanup: unmount

This lifecycle is similar to React's lifecycle but with additional hooks for the rendering pipeline.

### 2. Layer System and HTML Rendering

The library uses a layered rendering approach with different types of layers:

- **Layer Base Class**: The `Layer` class in `src/services/Layer.ts` is the foundation for all rendering layers. It can create both Canvas and HTML elements.
  
- **HTML Rendering**: There is no dedicated "HTMLLayer" class. Instead, HTML rendering is handled by setting the `html` property in the Layer constructor options with `transformByCameraPosition: true`. This adds the "layer-with-camera" class and subscribes to camera state changes.

- **Layer Attachment/Detachment**: Layers can be attached to and detached from the DOM. When a layer is detached, its event listeners are removed. When reattached, the `afterInit()` method is called to set up event listeners again.

- **GraphLayer**: The `GraphLayer` class in `src/components/canvas/layers/graphLayer/GraphLayer.ts` is a key layer that handles both Canvas and HTML rendering. It creates an HTML element with `transformByCameraPosition: true`.

- **React Integration**: React components are rendered into the HTML element of the GraphLayer using `createPortal` in `GraphCanvas.tsx`.

```typescript
// Example of Layer creation with HTML element
constructor(props: TGraphLayerProps) {
  super({
    canvas: {
      zIndex: 2,
      respectPixelRatio: true,
      classNames: ["no-user-select"],
    },
    html: {
      zIndex: 3,
      classNames: ["no-user-select"],
      transformByCameraPosition: true, // This enables HTML rendering with camera transformation
    },
    ...props,
  });
}
```

### 3. Event Handling with AbortController

The library uses AbortController for managing event listeners, which simplifies cleanup and prevents memory leaks. This is particularly important for components that may be created and destroyed frequently.

```typescript
// Example of using AbortController for event cleanup
protected graphOn<EventName extends keyof GraphEventsDefinitions, Cb extends GraphEventsDefinitions[EventName]>(
  eventName: EventName,
  handler: Cb,
  options?: Omit<AddEventListenerOptions, "signal">
) {
  return this.props.graph.on(eventName, handler, {
    ...options,
    signal: this.eventAbortController.signal,
  });
}
```

**Important**: Event subscriptions should always be set up in the `afterInit()` method, not in the constructor. This ensures that subscriptions are properly reestablished when a layer is reattached.

### 4. Scale-Dependent Rendering

The library uses scale-dependent rendering to optimize performance, with different levels of detail based on zoom level:
- Minimalistic: Simple shapes for far-away viewing
- Schematic: Basic structure and labels for medium zoom
- Detailed: Full details for close-up viewing with React components

This approach balances performance and visual detail based on what the user can actually see at different zoom levels.

```typescript
// Example of scale-dependent rendering in BlocksList.tsx
useGraphEvent(graphObject, "camera-change", ({ scale }) => {
  if (graphObject.cameraService.getCameraBlockScaleLevel(scale) !== ECameraScaleLevel.Detailed) {
    setRenderAllowed(false);
    return;
  }
  setRenderAllowed(true);
  scheduleListUpdate();
});
```

### 5. Spatial Indexing for Hit Detection

The library uses spatial indexing (R-tree) for efficient hit detection, which enables logarithmic lookup times for mouse interactions. This is crucial for performance when dealing with large graphs.

### 6. Batch Rendering for Similar Elements

The library uses batch rendering for similar elements (like connections) to minimize context switching and improve performance. This is particularly important for large graphs with many connections.

### 7. Block Positioning in HTML Mode

Blocks are positioned in HTML mode using CSS variables and transforms:

- **Block Container**: The `.graph-block-container` class uses `transform: translate3d()` with CSS variables for positioning.
  
- **CSS Variables**: Block position is set using CSS variables like `--graph-block-geometry-x` and `--graph-block-geometry-y`.

- **Camera Transform**: The HTML layer applies a matrix transform based on camera state to position all blocks correctly.

```typescript
// Setting CSS variables for block positioning in Block.tsx
useLayoutEffect(() => {
  setCssProps(containerRef.current, {
    "--graph-block-geometry-x": `${block.x}px`,
    "--graph-block-geometry-y": `${block.y}px`,
    "--graph-block-geometry-width": `${block.width}px`,
    "--graph-block-geometry-height": `${block.height}px`,
  });
}, [block.x, block.y, block.width, block.height, containerRef]);
```

## Learnings and Project Insights

### 1. Hybrid Rendering Approach

The library's hybrid rendering approach (Canvas + React) is a clever solution to the performance vs. interactivity trade-off. By using Canvas for high-performance rendering of the entire graph and React for rich interactions when zoomed in, the library provides the best of both worlds.

### 2. Component-Based Architecture

The library's component-based architecture, inspired by React, provides a familiar programming model and enables complex component composition. This makes the library easy to understand for developers familiar with React.

### 3. Event System Based on DOM EventTarget API

The library's event system, based on the DOM EventTarget API, provides a familiar and powerful way to handle events. This approach enables event bubbling, capturing, and delegation, which are crucial for complex interactions.

### 4. Performance Optimization Techniques

The library uses several performance optimization techniques, including:
- Spatial indexing for efficient hit detection
- Viewport-based rendering optimization
- Batch rendering for similar elements
- Scale-dependent rendering

These techniques enable the library to handle large graphs with thousands of nodes and connections while maintaining smooth interactions.
