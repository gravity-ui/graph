---
description: Graph structure and architecture rules
globs: 
alwaysApply: false
---

## Graph Architecture
This file contains rules and information about the architecture of the graph library:

- The graph is built on a layered architecture
- Canvas is used for high performance rendering
- React components are used for detailed interaction
- The system automatically switches between rendering modes 

# Project Structure
- src/ - source code
  - api/ - API for interacting with the graph
  - components/ - Canvas components
    - canvas/ - contains blocks, connections, anchors and layers for rendering
  - lib/ - helper libraries
  - plugins/ - custom layers and related utilities (previously called plugins)
  - react-component/ - React wrappers for Canvas components
  - services/ - services, including camera, layers, etc.
  - store/ - graph state storage
  - stories/ - examples of component usage for Storybook
  - utils/ - utility functions
- docs/ - project documentation
- .storybook/ - Storybook configuration

# Extension Pattern
- The primary mechanism for extending graph functionality (adding visuals, interactions) is by creating **Custom Layers**.
- Custom layers should extend the base `Layer` class (`src/services/Layer.ts`).
- Layers are added to the graph either via the `layers` array in `TGraphConfig` during initialization, or dynamically using `graph.addLayer()`.
- There is **no separate base `Plugin` class**. Functionality previously considered "plugins" should be implemented as Layers and potentially related services or components, typically residing in the `src/plugins/` directory. 