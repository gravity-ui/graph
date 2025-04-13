# Project Brief: @gravity-ui/graph

## Overview

@gravity-ui/graph is a sophisticated graph visualization library designed to combine high performance with rich interactivity. The library uniquely solves the common trade-off between performance and interactivity by automatically switching between Canvas and HTML/React based on zoom level:

- **Zoomed Out**: Uses Canvas for efficient rendering of the full graph
- **Medium Zoom**: Shows schematic view with basic interactivity
- **Zoomed In**: Switches to HTML/React components for rich interactions

## Core Requirements

1. **Performance**
   - Handle large graphs with thousands of nodes and connections
   - Maintain smooth interactions even with complex visualizations
   - Optimize rendering based on viewport and zoom level

2. **Flexibility**
   - Support both Canvas and React rendering
   - Allow custom block and connection styling
   - Enable extension through layers and plugins

3. **Interactivity**
   - Provide rich interaction capabilities (selection, dragging, connecting)
   - Support custom event handling
   - Enable responsive user interfaces within blocks

4. **Developer Experience**
   - Offer clear, consistent APIs
   - Provide comprehensive documentation
   - Include examples and storybook demonstrations

## Target Use Cases

1. **Node-based Editors**: For visual programming, workflow design, and process automation
2. **Diagrams and Flowcharts**: For system architecture, process flows, and organizational charts
3. **Data Visualization**: For network graphs, dependency trees, and relationship maps
4. **Interactive Applications**: For mind mapping, concept mapping, and planning tools

## Technical Goals

1. **Rendering System**
   - Implement a layered rendering approach with z-index support
   - Create a component lifecycle that integrates with the rendering pipeline
   - Support different levels of detail based on zoom level

2. **Event System**
   - Develop a robust event system based on DOM EventTarget API
   - Support event bubbling, capturing, and delegation
   - Enable custom event types and handlers

3. **Component Architecture**
   - Design a flexible component hierarchy
   - Support both Canvas and React components
   - Enable custom component implementations

4. **Performance Optimizations**
   - Implement spatial indexing for efficient hit testing
   - Use batch rendering for similar elements
   - Apply visibility culling based on viewport

## Success Criteria

1. **Performance Metrics**
   - Smooth rendering of 1000+ blocks at 60fps
   - Responsive interactions with minimal latency
   - Efficient memory usage with proper cleanup

2. **API Usability**
   - Intuitive API design with consistent patterns
   - Comprehensive documentation with examples
   - Clear extension points for customization

3. **Feature Completeness**
   - Support for blocks, connections, anchors, and groups
   - Comprehensive event handling
   - Flexible styling and theming
   - Integration with React applications

4. **Quality Assurance**
   - Comprehensive test coverage
   - Browser compatibility
   - Accessibility considerations
