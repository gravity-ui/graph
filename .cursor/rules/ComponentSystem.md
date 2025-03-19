# Component System Rules

## Overview
The `/src/lib` directory contains core library components for the graph system. Only items explicitly exported in `index.ts` should be used by external components.

## Exported Components
The following components are explicitly exported and available for use outside this directory:

1. `Component` - A class that extends CoreComponent with state management capabilities
2. `CoreComponent` - The base component class that implements the tree structure
3. `Scheduler` and related exports - Handles component update scheduling

## Usage Guidelines

### DO:
- Import only from the index file: `import { Component, CoreComponent } from 'src/lib'`
- Use the Component class as the base class for your custom components
- Use CoreComponent only when you need direct access to the core functionality
- Use the Scheduler for managing component updates

### DON'T:
- Import directly from individual files within the lib directory
- Modify the exported classes directly
- Access internal properties prefixed with `__` or marked as `protected`
- Import or use any non-exported utilities or helper functions

## Internal Files
The following files are for internal use only and should not be imported directly:

- `Tree.ts` - Tree data structure implementation
- `Tree.spec.ts` - Tests for the Tree implementation
- `tshelpers.ts` - TypeScript helper utilities
- `utils.ts` - Internal utility functions

## Performance Considerations
- Minimize state changes to prevent unnecessary renders
- Use the scheduler efficiently to manage component updates
- Be mindful of the component tree structure for optimal traversal 