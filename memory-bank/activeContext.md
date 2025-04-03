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

6. **Plugin Independence**: Refactoring the code to clearly separate plugin-specific constants, settings, and colors from the core graph library. This will improve maintainability and create a cleaner architecture with proper separation of concerns.



[2025-04-03 18:21:07] - Refined Graph Settings documentation to include only settings and constants that are actively used in the codebase. Removed unused settings and constants from the documentation to improve clarity and reduce confusion.

[2025-04-03 18:16:30] - Created comprehensive documentation for Graph Settings (`docs/system/graph-settings.md`) and updated the main README.md to properly reference it in the Table of Contents. The documentation includes detailed explanations of configuration options, color customization, and constants, with examples for common use cases.

[2025-04-03 18:36:58] - Restructured the docs/README.md to improve clarity and accessibility. The new documentation structure uses tables for better visual organization, simplifies the quick start example, and provides a more logical grouping of documentation topics. This change addresses the 'Documentation and Examples' focus area by making the library's documentation more approachable for new users.

[2025-04-03 18:45:40] - Improved component lifecycle documentation (docs/system/component-lifecycle.md) with better organization, visual tables, simplified diagrams, clearer explanations, and a more logical flow. The documentation now follows a structured approach that makes the complex component lifecycle system more accessible and easier to understand.

2025-04-03 15:09:16 - Updated with the current focus, recent changes, and open questions based on the library documentation.

## Recent Changes

[2025-04-03 19:03:30] - Improved documentation connectivity by creating an integration document that connects the component lifecycle, rendering mechanism, and scheduler system. Added cross-references between all related documents to create a more comprehensive and navigable documentation structure. This makes it easier for developers to understand how these critical systems interact with each other.

## Recent Changes

[2025-04-03 19:36:52] - Updated camera scaling method in component documentation from `getCameraScale()` to `getCameraBlockScaleLevel()`, which is the correct method for determining rendering detail level. This ensures developers follow the proper API for implementing variable detail components.

[2025-04-03 19:48:39] - Updated GraphComponent documentation with technical implementation details about spatial indexing. Added information about the R-tree spatial index implementation for HitBox management (providing O(log n) lookup complexity) and clarified that component visibility checks are based on testing if a component's hitbox is within the camera's view area for efficient culling.


[2025-04-03 19:44:58] - Updated GraphComponent documentation to better explain mouse event handling capabilities. Expanded from a narrow focus on just drag operations to include all mouse event types and explain how they're different from standard DOM events (world coordinates, hit-testing integration, automatic cleanup).


[2025-04-03 19:39:49] - Corrected technical documentation regarding camera scaling in GraphComponents. The `getCameraBlockScaleLevel()` method returns an enum (ECameraScaleLevel) with values Minimalistic, Schematic, and Detailed - not a numeric value. Documentation now properly shows how to use these enum values rather than numeric comparisons for determining rendering detail levels.



[2025-04-03 19:28:21] - Updated documentation for GraphComponent to align with the correct technical implementation. Removed references to BatchPath2D which isn't connected to the GraphComponent system. Also emphasized the absolute positioning requirement for child components, replacing any suggestions of relative positioning. Both changes make the documentation technically accurate and should prevent developer confusion.


[2025-04-03 19:18:50] - Fixed and enhanced the `canvas-graph-component.md` documentation which was incomplete. The documentation now provides comprehensive guidance on GraphComponent usage, including detailed examples, performance optimization tips, and real-world use cases. This improvement supports the "Documentation and Examples" focus area by making the core GraphComponent system more accessible to developers.


[2025-04-03 19:07:35] - Restructured documentation to eliminate redundancy between component lifecycle, rendering mechanism, and scheduler system documentation. Each file now focuses on its specific domain with clear cross-references to related topics. The integration document serves as a comprehensive guide showing how these systems work together. This should make the documentation more maintainable and easier to understand for developers.