# Product Context: @gravity-ui/graph

## Why This Project Exists

The @gravity-ui/graph library was created to address a fundamental challenge in web-based graph visualization: the trade-off between performance and interactivity. Existing solutions typically forced developers to choose between:

1. **Canvas/SVG-based libraries** that offer high performance but limited interactivity and styling options
2. **DOM/React-based libraries** that provide rich interactivity but suffer performance issues with large graphs

@gravity-ui/graph uniquely solves this dilemma by combining both approaches in a single library, automatically switching between rendering technologies based on the current zoom level and context.

## Problems It Solves

### 1. Performance vs. Interactivity Trade-off

Traditional graph visualization libraries force developers to choose between performance and interactivity. @gravity-ui/graph eliminates this trade-off by using:
- Canvas for high-performance rendering when viewing the entire graph
- HTML/React for rich interactions when zoomed in on specific elements

### 2. Complex Graph Visualization

Visualizing complex graphs with thousands of nodes and connections is challenging. The library addresses this through:
- Efficient spatial indexing for hit detection
- Viewport-based rendering optimization
- Batch rendering for similar elements
- Automatic level-of-detail adjustments based on zoom

### 3. Integration Complexity

Integrating graph visualizations into modern React applications can be difficult. The library solves this by:
- Providing React components that seamlessly integrate with the Canvas rendering
- Supporting React hooks for state management
- Enabling custom React components for blocks and UI elements

### 4. Customization Limitations

Many graph libraries offer limited customization options. @gravity-ui/graph addresses this with:
- Extensive theming and styling capabilities
- Support for custom block and connection implementations
- Layer-based architecture for extending functionality
- Plugin system for adding new features

## How It Should Work

### Core Interaction Model

1. **Viewing the Full Graph**
   - When zoomed out, users see the entire graph rendered efficiently on Canvas
   - Blocks appear as simplified shapes with minimal details
   - Connections show as basic lines
   - Performance is prioritized over detail

2. **Exploring the Graph**
   - Users can pan and zoom to navigate the graph
   - As zoom level increases, more details become visible
   - Schematic view shows block labels and basic structure
   - Connections may show directional arrows and labels

3. **Interacting with Specific Elements**
   - When zoomed in sufficiently, blocks transition to React components
   - Rich interactions become available (hover states, buttons, forms)
   - Detailed information is displayed
   - Connections show full styling and interactive elements

### Key Workflows

1. **Graph Creation and Editing**
   - Adding, removing, and modifying blocks
   - Creating and managing connections between blocks
   - Organizing blocks into groups
   - Arranging the graph layout

2. **Navigation and Exploration**
   - Panning and zooming to navigate the graph
   - Selecting and focusing on specific elements
   - Searching and filtering graph elements
   - Collapsing and expanding groups or subgraphs

3. **Interaction and Manipulation**
   - Selecting blocks and connections
   - Dragging blocks to reposition them
   - Resizing and modifying blocks
   - Interacting with block content (buttons, inputs, etc.)

## User Experience Goals

### For End Users

1. **Intuitive Navigation**
   - Smooth, responsive panning and zooming
   - Clear visual hierarchy and organization
   - Consistent interaction patterns
   - Appropriate level of detail at each zoom level

2. **Responsive Interactions**
   - Immediate visual feedback for user actions
   - Smooth animations for transitions
   - Consistent performance regardless of graph size
   - Predictable behavior for selection and manipulation

3. **Visual Clarity**
   - Clear distinction between different types of blocks
   - Easily traceable connections
   - Appropriate use of color, shape, and typography
   - Effective use of space and layout

### For Developers

1. **Intuitive API Design**
   - Consistent patterns and conventions
   - Clear separation of concerns
   - Predictable behavior and side effects
   - Comprehensive documentation and examples

2. **Flexible Customization**
   - Extensive styling and theming options
   - Support for custom block and connection implementations
   - Extension points for adding new functionality
   - Integration with existing React components

3. **Robust Performance**
   - Efficient handling of large graphs
   - Smooth interactions even with complex visualizations
   - Appropriate memory management and cleanup
   - Optimized rendering based on viewport and zoom level

4. **Developer Productivity**
   - Reduced boilerplate code
   - Clear error messages and debugging information
   - Comprehensive examples and documentation
   - Consistent patterns across the API
