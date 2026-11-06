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

Each configured tree root owns one `TreeCulling` coordinator with a shared tile index. It prepares
visible, new, and dirty nodes, publishes their final visibility, and then runs painting in local
z-index order. Components and batch paths use the same published selection. A dirty offscreen
component still applies data, reconciles children, and reports geometry; its paint hooks are skipped.

Geometry changes update the spatial index without invalidating cached hierarchy or paint order.
Membership, sibling order, and traversal permissions invalidate those caches separately. When the
viewport contains all indexed bounds, the coordinator reuses the full traversal order; otherwise it
selects candidates from tiles or a linear bounds scan for dense views.

Dense partial views reuse a cached registration order and parent positions. Exact selection marks
identify visible nodes; their unprepared ancestors are included when needed, so this path still skips clean
offscreen branches. Structural changes during preparation fall back to the ordinary ancestor-aware
walk and repeat selection before painting. Partial preparation retains registration order with
required ancestors first, independently of paint z-order, including children attached later.

The coordinator reuses exact selection while geometry, structure, and viewport edges remain unchanged,
including checking for invalidation from synchronous visibility callbacks. Published visibility also carries
its ancestry revision, avoiding repeated eligibility checks during painting until structure changes.
The active registry is updated only when membership changes, including the first registration of a
new node whose initial visibility is already true.

This coordination does not own a drawing context: layers and component render methods retain their
existing responsibilities. An explicit child-traversal veto still suppresses descendants, including
when a parent sets it during painting; already prepared descendants then complete without painting.

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
4. The tree's culling coordinator calls `prepareUpdate()` on visible, new, or dirty components and their ancestors
5. Components apply data and reconcile children before the tree resolves final viewport membership
6. `iterate()` paints visible components and completes prepared updates; clean offscreen nodes are skipped
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
- `prepareUpdate()` - Apply pending data and reconcile children before painting
- `iterate()` - Paint eligible components and complete the update
- `isInViewport()` - Read the tree's current spatial visibility decision
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
