# Rendering Mechanism Documentation

This document provides a detailed explanation of the rendering mechanism implemented in the library, focusing on the Component and CoreComponent classes and their lifecycles.

> **Note:** This document is part of a series on the rendering architecture. See also [Component Lifecycle](../system/component-lifecycle.md), [Scheduler System](../system/scheduler-system.md), and the integration document [Component Rendering and Lifecycle Integration](../system/component-rendering-lifecycle.md).

## Architecture Overview

The rendering mechanism is built upon a hierarchical tree structure with the following key components:

1. **Tree** - The base hierarchical structure that manages parent-child relationships with z-index ordering
2. **TreeCulling** - Coordinates preparation, viewport selection, and painting for a configured tree root
3. **CoreComponent** - The fundamental component class that implements tree traversal and child management
4. **Component** - Extends CoreComponent to add lifecycle hooks and state management
5. **Scheduler** - Manages the timing of updates and traversal of the component tree

## Component Structure

### Tree Class

The `Tree` class provides the foundational hierarchy structure with:
- Parent-child relationship management
- Z-index based ordering of children
- Traversal methods for walking the tree
- Own world-space bounds and per-node lifecycle state

### TreeCulling Class

Each configured tree root owns one `TreeCulling` coordinator with a shared tile index. A frame has
three steps:

1. **Requested work.** The root, new nodes and nodes that requested an update through
   `performRender()` prepare first, ancestors before descendants. Their data, children and geometry are
   final before anything paints, including when they are offscreen.
2. **Visibility.** When the viewport contains every indexed bound, every eligible node is visible.
   Otherwise visibility is kept between frames: a camera move rechecks only nodes in the parts of the
   previous and current viewports outside each other, plus nodes whose bounds changed. After a
   structural change the coordinator runs one complete selection, through tiles or a linear bounds scan
   for dense views. Bounds reach the tile index once per frame, right before publication.
3. **Painting.** One pass over the cached local paint order calls `iterate(prepared, visible)` for
   visible and already prepared nodes. `prepared` tells the node whether its update already ran in this
   frame; a clean visible node applies its own pending work inside `iterate()` right before it paints.
   `visible` is the tree's paint decision; a component may still veto painting. Clean offscreen nodes
   receive no call, and their visible descendants are still reached through them.

A frame therefore costs the visible nodes plus the work that changed. Hooks that run before painting
read live visibility from current bounds; during painting `isVisible()` returns the frame's decision.

Structure that a node changes while painting (for example children it adds or moves from `render()`) is
painted from the next frame. A child-traversal veto returned from painting suppresses descendants in that
frame and is decided again by the node's preparation before the next publication. Prepared descendants
of a vetoed branch complete without painting.

Connection batches do not depend on per-item visibility: each chunk is skipped when its items' bounds
are outside the viewport, see [Batch Rendering](../connections/batch-rendering.md).

This coordination does not own a drawing context: layers and component render methods retain their
existing responsibilities.

### CoreComponent Class

`CoreComponent` is the base component class that:
- Implements the `ITree` interface
- Manages the tree structure for components
- Handles the creation, updating, and removal of child components
- Provides the basic update and render architecture

### Component Class

`Component` extends `CoreComponent` to add:
- State management
- Comprehensive lifecycle hooks
- Control flags for rendering optimization
- More fine-grained control over the rendering process

### Scheduler

The `Scheduler` orchestrates the rendering process by:
- Managing request animation frame (rAF) timing
- Traversing the component tree
- Triggering component iterations
- Providing global and component-level scheduling

## Rendering Pipeline

The rendering process follows these steps:

1. Component state/props update via `setState`/`setProps`
2. `performRender()` schedules an update through the `Scheduler`
3. On the next animation frame, `Scheduler` traverses the component tree
4. The tree's culling coordinator prepares new and requested components and their ancestors
5. The coordinator publishes viewport visibility, rechecking only what the camera move or changed bounds affect
6. `iterate()` updates and paints visible components; prepared offscreen components complete their update; clean offscreen nodes are skipped
7. The process repeats for each animation frame when changes occur

## Component Lifecycle

The rendering mechanism relies on component lifecycle methods to manage the rendering process. The lifecycle methods are documented in detail in [Component Lifecycle](../system/component-lifecycle.md).

Key integration points between the rendering system and component lifecycle:

- Components use `render()` to produce visual output
- Component trees are traversed in z-index order
- Visual output is coordinated through the `iterate()` method
- State/props changes trigger rendering through `performRender()`

See [Component Rendering and Lifecycle Integration](../system/component-rendering-lifecycle.md) for a comprehensive view of how these systems interact.

## State and Props Management

Components manage their state and props using a buffered approach:

1. When `setState` or `setProps` is called, changes are stored in a temporary buffer (`__data`)
2. The component schedules a render update via `performRender()`
3. On the next animation frame, the buffered changes are applied to the actual state/props during the `checkData()` method
4. Lifecycle callbacks like `propsChanged()` and `stateChanged()` are triggered as needed

This approach allows for batching multiple state/props updates into a single render cycle, improving performance.

For more details on this process, see [Component Lifecycle](../system/component-lifecycle.md).

## Z-Index Management

The z-index system uses a **two-tier stacking model** that separates component *type* priority from visual *stacking order* within the same type.

### Tier 1: zIndex — Component Type Priority

`zIndex` encodes the architectural importance of a component class. Different component types are assigned different base values:
- Blocks have a higher `DEFAULT_Z_INDEX` than connections
- Connections render above group backgrounds
- When two components of different types overlap, the one with the higher `zIndex` always wins, regardless of render order

This value is set per component class in `graphConfig.ts` and changed via `updateZIndex()` (e.g., when a block is selected or dragged, its zIndex is incremented to rise above its unselected peers).

### Tier 2: renderOrder — Visual Stacking Within a Type

`renderOrder` determines stacking *within the same zIndex tier*. Tree assigns every child's order
when rebuilding its parent's sorted child cache, including children outside the viewport.

`Tree.updateZIndex()` moves a child between its parent's z-index groups; `updateChildZIndex()`
re-inserts it at the end of its current group. Group insertion order determines stacking within a tier.

This means drag-and-drop and selection automatically bring the interacted block to the front of its z-group without any extra bookkeeping.

### Hit Testing

`HitTest.testHitBox()` sorts candidates by both criteria (descending — highest = topmost):
1. First by `zIndex` (type priority)
2. Then by `renderOrder` (within-type visual stacking)

The first element of the returned array is the component the user most likely intended to interact with.

### Summary

| Criterion | Controls | Set by |
|---|---|---|
| `zIndex` | Which component *type* wins | `updateZIndex()`, class constant |
| `renderOrder` | Which instance wins *within its type* | Scheduler traversal order + `updateChildZIndex()` |

## Integration with Animation

The rendering mechanism integrates with the browser's animation frame:

1. GlobalScheduler manages requestAnimationFrame
2. Component updates are scheduled within animation frames
3. Multiple schedulers can be registered with different priorities
4. The system aims to complete updates within the 16ms frame budget

## API Overview

### CoreComponent API

- `constructor(props, parent)` - Create a component instance
- `performRender()` - Schedule a render update
- `setContext(context)` - Update the context
- `prepareUpdate()` - Apply pending data and reconcile children; the tree calls it before painting for requested and new components
- `iterate(prepared, visible)` - Run the component's frame: update unless `prepared`, paint if `visible` and not vetoed
- `isInViewport()` - Read the tree's spatial visibility: the frame's decision while painting, current bounds otherwise
- `static create(props, options)` - Factory method
- `static mount(Component, props)` - Mount a component as root
- `static unmount(instance)` - Unmount a component

### Component API

- `setState(state)` - Update component state
- `setProps(props)` - Update component props
- Additional lifecycle hooks:
  - `willMount()` - Before first iteration
  - `willRender()` - Before rendering
  - `didRender()` - After rendering
  - `willIterate()` - Before iteration
  - `didIterate()` - After iteration
  - `willUpdateChildren()` - Before updating children
  - `didUpdateChildren()` - After updating children
  - `propsChanged(nextProps)` - When props change
  - `stateChanged(nextState)` - When state changes
  
  ## Related Documentation
  
  - [Component Lifecycle](../system/component-lifecycle.md) - In-depth details about component lifecycle methods
  - [Scheduler System](../system/scheduler-system.md) - Explanation of the scheduling and update system
  - [Component Rendering and Lifecycle Integration](../system/component-rendering-lifecycle.md) - Comprehensive guide showing how these systems work together
