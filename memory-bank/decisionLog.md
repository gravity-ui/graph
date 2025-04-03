# Decision Log

This file records architectural and implementation decisions using a list format.
2025-04-03 14:52:47 - Log of updates made.

## [2025-04-03 15:09:34] - Component-Based Architecture Implementation

### Decision
Implement a component-based architecture with a hierarchical tree structure as the foundation of the Graph Visualization Library.

### Rationale
- **Reusability**: Components can be reused across different parts of the graph
- **Encapsulation**: Each component encapsulates its own behavior and rendering logic
- **Modularity**: Different aspects of the graph can be developed and tested independently
- **Flexibility**: Custom components can be created to extend the library's capabilities
- **Maintainability**: Well-defined component boundaries make the code easier to maintain

### Implementation Details
- Created a base `CoreComponent` class that implements the `ITree` interface
- Extended `CoreComponent` to create the `Component` class with additional lifecycle hooks
- Implemented specific component types like `Block` and `Connection` 
- Used factory methods (`Component.create`) for standardized component creation
- Managed parent-child relationships through the tree structure

## [2025-04-03 15:09:34] - Batch Rendering System for Connections

### Decision
Implement a BatchPath2D rendering system to optimize the rendering of connections, especially for graphs with large numbers of connections.

### Rationale
- **Performance**: Traditional canvas rendering can be expensive when many similar elements need to be drawn
- **Reduced Context Switching**: Setting canvas context properties (stroke styles, fill styles, etc.) is computationally expensive
- **Simplicity**: Developers shouldn't need to optimize basic rendering operations manually
- **Memory Efficiency**: Path2D objects are memory-efficient compared to other approaches

### Implementation Details
- Created the `BatchPath2D` system to group similar elements
- Implemented automatic grouping based on visual properties
- Added z-index support for proper layering of elements
- Created the `Path2DRenderInstance` interface for custom path implementations
- Integrated the batch system with the standard component lifecycle

## [2025-04-03 15:09:34] - Two-Phase State/Props Management

### Decision
Implement a two-phase approach for state and props management in components.

### Rationale
- **Performance**: Batching multiple state/props updates into a single render cycle is more efficient
- **Consistency**: Changes to state and props should be applied consistently and predictably
- **Developer Experience**: Developers should be able to call `setState`/`setProps` multiple times without worrying about intermediate renders

### Implementation Details
- Implemented buffer storage for pending state/props changes in the `__data` property
- Created the `checkData` method to apply buffered changes during iteration
- Added `propsChanged` and `stateChanged` lifecycle hooks for fine-grained control
- Integrated with the component lifecycle to ensure changes are applied at the correct time

## [2025-04-03 15:09:34] - Block Groups Implementation

### Decision
Implement both automatic and manual approaches for block grouping.

### Rationale
- **Flexibility**: Different use cases require different approaches to grouping
- **User Experience**: Some applications need automatic grouping based on properties, while others need manual user control
- **Performance**: Automatic grouping can be more efficient for large numbers of blocks
- **Simplicity**: Manual grouping provides more direct control for simpler use cases

### Implementation Details
- Created the `BlockGroups` component for base grouping functionality
- Implemented `BlockGroups.withBlockGrouping` for automatic grouping based on custom logic
- Added support for group styling and behavior configuration
- Included methods for manual group management (`setGroups`, `updateGroups`)
- Added support for custom group components through inheritance