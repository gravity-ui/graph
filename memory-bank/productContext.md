# Product Context

This file provides a high-level overview of the project and the expected product that will be created. Initially it is based upon projectBrief.md (if provided) and all other available project-related information in the working directory. This file is intended to be updated as the project evolves, and should be used to inform all other modes of the project's goals and context.
2025-04-03 14:52:22 - Log of updates made will be appended as footnotes to the end of this file.

## Project Goal

The Graph Visualization Library is a powerful and flexible library for building interactive, canvas-based graph visualizations with blocks, connections, and advanced rendering capabilities. It aims to provide developers with a comprehensive system for rendering and interacting with graph-based visualizations, featuring efficient rendering mechanisms, spatial awareness, and a rich set of interactive capabilities.

## Key Features

- **Component-Based Architecture**: Build complex visualizations using reusable components
- **Efficient Rendering**: Optimized canvas rendering with layering and batching support
- **Spatial Awareness**: HitBox system for efficient interaction and collision detection
- **Connection System**: Flexible system for creating and styling connections between blocks
- **Block Management**: Create, customize, and organize blocks with grouping support
- **Event Handling**: Comprehensive event system for user interactions
- **Lifecycle Management**: Well-defined component lifecycle for predictable behavior

## Overall Architecture

The rendering mechanism is built upon a hierarchical tree structure with the following key components:

1. **Tree** - The base hierarchical structure that manages parent-child relationships with z-index ordering
2. **CoreComponent** - The fundamental component class that implements tree traversal and child management
3. **Component** - Extends CoreComponent to add lifecycle hooks and state management
4. **Scheduler** - Manages the timing of updates and traversal of the component tree

The library implements a sophisticated rendering pipeline that ensures efficient updates and rendering:
1. Component state/props update via `setState`/`setProps`
2. `performRender()` schedules an update through the `Scheduler`
3. On the next animation frame, `Scheduler` traverses the component tree
4. Each component's `iterate()` method is called
5. Components process their data and execute their lifecycle methods
6. Child components are created, updated, or removed as needed
7. The process repeats for each animation frame when changes occur

2025-04-03 14:56:10 - Added details about graph configurations and stress tests from GraphEditor.stories.tsx.
2025-04-03 15:08:30 - Updated with comprehensive information from the documentation about the library's purpose, key features, and overall architecture.