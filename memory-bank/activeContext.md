[2025-04-03 17:32:38] - The npm library is called `@gravity-ui/graph` and this name should be used for imports in examples.
# Active Context

This file tracks the project's current status, including recent changes, current goals, and open questions.
2025-04-03 14:52:37 - Log of updates made.

## Current Focus

The current focus of the Graph Visualization Library is on:

1. **Component System Enhancement**: Continuing to refine the component-based architecture to ensure flexibility and reusability across different use cases.

2. **Performance Optimization**: Further optimizing the rendering pipeline to handle large graphs efficiently, with particular focus on the BatchPath2D system for connections and the efficient management of component lifecycle.

3. **Developing Custom Block Types**: Expanding the library's capabilities by providing more examples and guidance for creating custom block implementations that leverage the underlying architecture.

4. **Group Management**: Enhancing the block grouping functionality to provide better organization and visual management of complex graphs.

5. **Documentation and Examples**: Improving the documentation and providing more comprehensive examples to demonstrate the library's capabilities and patterns.

## Recent Changes

Recent updates to the Graph Visualization Library include:

1. **Documentation Structure**: The documentation has been organized into clear sections (Components, Connections, System, Rendering, and Blocks) to make it easier to understand the library's architecture.

2. **Connection System Refinement**: The connection system has been enhanced with performance optimizations using the Path2D approach and batch rendering.

3. **Component Lifecycle Documentation**: Detailed explanation of the component lifecycle has been provided to help developers understand and leverage the system effectively.

4. **Block Groups Implementation**: Block grouping functionality has been implemented with support for both automatic and manual group management.

## Open Questions/Issues

Some open questions and issues that need to be addressed:

1. **Group Dragging Implementation**: As noted in the documentation, dragging is not yet implemented properly for fixed area groups. This functionality needs to be improved to support more flexible group interactions.

2. **Performance with Large Graphs**: While the library includes optimizations for handling large numbers of blocks and connections, there may be further optimizations needed for very complex graph scenarios.

3. **Integration with External Libraries**: Better guidance may be needed on how to integrate the Graph Visualization Library with external layout algorithms or visualization tools.

4. **Mobile/Touch Support**: The documentation doesn't explicitly mention touch support or mobile-specific optimizations, which may be an area for future improvement.

5. **Accessibility Considerations**: Ensuring the library provides accessible visualizations, including keyboard navigation and screen reader support, may need further attention.

2025-04-03 15:09:16 - Updated with the current focus, recent changes, and open questions based on the library documentation.