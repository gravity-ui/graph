# Technical Context: @gravity-ui/graph

## Technologies Used

### Core Technologies

1. **TypeScript**
   - The entire library is written in TypeScript for type safety and developer experience
   - Strict typing is used throughout the codebase
   - Interface-based design enables clear contracts between components

2. **Canvas API**
   - HTML5 Canvas is used for high-performance rendering
   - Path2D objects are used for efficient shape rendering and hit detection
   - Canvas context optimizations are applied for better performance

3. **React**
   - React integration is provided for seamless use in React applications
   - Custom hooks (useGraph, useGraphEvent) simplify state management
   - React components wrap Canvas elements for hybrid rendering

4. **CSS**
   - CSS variables are used for theming and styling
   - CSS modules are used for component-specific styling
   - CSS-in-JS is avoided for better performance

### Supporting Technologies

1. **R-tree Spatial Index**
   - Used for efficient spatial queries and hit detection
   - Enables logarithmic lookup times for mouse interactions
   - Optimizes viewport culling for better performance

2. **Signals**
   - Lightweight reactive programming primitives
   - Used for state management and propagation
   - Enables efficient updates with minimal overhead

3. **EventTarget API**
   - Custom event system based on the DOM EventTarget API
   - Supports event bubbling, capturing, and delegation
   - Enables custom event types and handlers

4. **AbortController**
   - Used for managing event listener cleanup
   - Simplifies resource management
   - Prevents memory leaks

## Development Setup

### Build System

The project uses a modern TypeScript-based build system:

1. **TypeScript Compiler**
   - Strict type checking is enabled
   - ES modules are used for better tree-shaking
   - Declaration files are generated for better IDE support

2. **Bundling**
   - ESBuild is used for fast bundling
   - Multiple output formats are supported (ESM, CJS)
   - Tree-shaking is applied to minimize bundle size

3. **Package Management**
   - npm is used for package management
   - Peer dependencies are properly declared
   - Version ranges are carefully managed

### Testing Framework

The project uses a comprehensive testing approach:

1. **Jest**
   - Unit tests for individual components and utilities
   - Integration tests for component interactions
   - Snapshot tests for visual regression

2. **Testing Library**
   - React Testing Library for React component tests
   - User-centric testing approach
   - Accessibility testing

3. **Canvas Testing**
   - Custom utilities for testing Canvas rendering
   - Pixel-based comparison for visual tests
   - Mock Canvas context for unit tests

### Documentation

The project uses a comprehensive documentation approach:

1. **Markdown**
   - Markdown files for static documentation
   - Code examples with syntax highlighting
   - Diagrams using Mermaid

2. **Storybook**
   - Interactive examples and demos
   - Component documentation
   - Visual testing

3. **API Documentation**
   - TypeDoc for API documentation
   - Interface and type definitions
   - Usage examples

### Development Workflow

The project follows a modern development workflow:

1. **Git**
   - Feature branches
   - Pull requests
   - Code reviews

2. **CI/CD**
   - Automated testing
   - Automated builds
   - Automated deployment

3. **Code Quality**
   - ESLint for code linting
   - Prettier for code formatting
   - TypeScript for type checking

## Technical Constraints

### Browser Compatibility

The library targets modern browsers with the following minimum requirements:

1. **Canvas Support**
   - Full support for Canvas API
   - Path2D support
   - OffscreenCanvas support (optional)

2. **JavaScript Features**
   - ES2018+ support
   - Async/await support
   - Modern DOM APIs

3. **CSS Features**
   - CSS Variables support
   - Flexbox support
   - Grid support

### Performance Constraints

The library has the following performance targets:

1. **Rendering Performance**
   - 60fps for graphs with up to 1000 blocks
   - Smooth panning and zooming
   - Efficient memory usage

2. **Initialization Time**
   - Fast initialization (< 100ms for typical graphs)
   - Lazy loading of resources
   - Efficient data structures

3. **Memory Usage**
   - Minimal memory footprint
   - Proper cleanup of resources
   - Efficient caching strategies

### Size Constraints

The library has the following size targets:

1. **Bundle Size**
   - Core bundle < 50KB gzipped
   - Optional features as separate chunks
   - Tree-shakable design

2. **API Surface**
   - Minimal public API surface
   - Consistent naming conventions
   - Clear separation of concerns

### Accessibility Constraints

The library aims to be accessible with the following constraints:

1. **Keyboard Navigation**
   - Support for keyboard navigation
   - Focus management
   - Keyboard shortcuts

2. **Screen Reader Support**
   - Proper ARIA attributes
   - Meaningful text alternatives
   - Semantic structure

3. **Color Contrast**
   - Sufficient color contrast
   - Customizable colors
   - Support for high contrast mode

## Dependencies

### Production Dependencies

1. **Core Dependencies**
   - None - the core library has no external runtime dependencies

2. **Optional Dependencies**
   - React (peer dependency for React integration)
   - React DOM (peer dependency for React integration)

3. **Plugin Dependencies**
   - ELK.js (optional, for automatic layout)
   - Other plugins may have their own dependencies

### Development Dependencies

1. **Build Tools**
   - TypeScript
   - ESBuild
   - Rollup

2. **Testing Tools**
   - Jest
   - React Testing Library
   - Canvas Testing Utilities

3. **Documentation Tools**
   - Storybook
   - TypeDoc
   - Markdown processors

4. **Code Quality Tools**
   - ESLint
   - Prettier
   - TypeScript

## Module Structure

The library is organized into the following module structure:

```
@gravity-ui/graph/
├── core/               # Core functionality
│   ├── component/      # Component system
│   ├── rendering/      # Rendering system
│   ├── events/         # Event system
│   └── utils/          # Utility functions
├── components/         # Built-in components
│   ├── block/          # Block components
│   ├── connection/     # Connection components
│   ├── anchor/         # Anchor components
│   └── group/          # Group components
├── services/           # Services
│   ├── camera/         # Camera service
│   ├── layers/         # Layers service
│   ├── hitTest/        # Hit test service
│   └── scheduler/      # Scheduler service
├── store/              # Data store
│   ├── root/           # Root store
│   ├── block/          # Block store
│   ├── connection/     # Connection store
│   └── group/          # Group store
├── react/              # React integration
│   ├── components/     # React components
│   ├── hooks/          # React hooks
│   └── utils/          # React utilities
└── plugins/            # Optional plugins
    ├── elk/            # Automatic layout
    ├── minimap/        # Minimap
    └── export/         # Export functionality
```

## Build Artifacts

The library produces the following build artifacts:

1. **ESM Bundle**
   - Modern ES modules
   - Tree-shakable
   - TypeScript declarations

2. **CJS Bundle**
   - CommonJS modules
   - Legacy support
   - TypeScript declarations

3. **CSS Files**
   - Core styles
   - Theme styles
   - Component styles

4. **Type Definitions**
   - TypeScript declaration files
   - API documentation
   - Type exports

## Deployment and Distribution

The library is distributed through the following channels:

1. **npm Registry**
   - Published as @gravity-ui/graph
   - Semantic versioning
   - Release notes

2. **CDN**
   - UMD bundle for direct browser usage
   - Minified and gzipped
   - Versioned URLs

3. **Documentation Site**
   - API documentation
   - Examples and demos
   - Tutorials and guides
