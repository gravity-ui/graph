# Scheduler System Documentation

This document describes the scheduling system that coordinates component updates in the rendering engine, focusing on the `Scheduler` and `GlobalScheduler` classes.

> **Note:** This document is part of a series on the rendering architecture. See also [Component Lifecycle](./component-lifecycle.md), [Rendering Mechanism](../rendering/rendering-mechanism.md), and the integration document [Component Rendering and Lifecycle Integration](./component-rendering-lifecycle.md).

## Scheduler Architecture

The scheduling system consists of two main classes:

1. **GlobalScheduler** - Manages the animation frame loop and coordinates multiple schedulers
2. **Scheduler** - Manages updates for a specific component tree

```mermaid
classDiagram
    GlobalScheduler <-- Scheduler
    Scheduler -- Tree
    Tree -- ITree
    CoreComponent ..|> ITree
    Component --|> CoreComponent
    
    class GlobalScheduler {
        -schedulers: IScheduler[][]
        -_cAFID: number
        +addScheduler(scheduler, index)
        +removeScheduler(scheduler, index)
        +start()
        +stop()
        +tick()
        +performUpdate()
    }
    
    class Scheduler {
        -scheduled: boolean
        -root: Tree
        +setRoot(root)
        +start()
        +stop()
        +update()
        +iterator(node)
        +scheduleUpdate()
        +performUpdate()
    }
    
    class Tree {
        +data: ITree
        +traverseDown(iterator)
    }
    
    class ITree {
        <<interface>>
        +iterate(): boolean
    }
    
    class CoreComponent {
        +iterate()
    }
    
    class Component {
        +iterate()
    }
```

## Animation Frame Integration

The scheduler system integrates with the browser's requestAnimationFrame API (or setTimeout in non-browser environments):

```mermaid
sequenceDiagram
    participant Browser
    participant GlobalScheduler
    participant Scheduler
    participant Component
    
    Browser->>GlobalScheduler: requestAnimationFrame
    GlobalScheduler->>GlobalScheduler: tick()
    GlobalScheduler->>GlobalScheduler: performUpdate()
    GlobalScheduler->>Scheduler: performUpdate()
    Scheduler->>Scheduler: update()
    Scheduler->>Tree: traverseDown(iterator)
    Tree->>Component: iterate()
    Component->>Component: process lifecycle
    Browser->>GlobalScheduler: requestAnimationFrame (next frame)
```

## Update Scheduling

The scheduling system coordinates when component updates happen:

1. Component calls `performRender()` to schedule an update
2. This sets a `scheduled` flag in the Scheduler
3. On the next animation frame, GlobalScheduler triggers updates for all scheduled components
4. The Scheduler traverses the component tree in a depth-first order
5. Each component's `iterate()` method is called during traversal
6. Components can control whether their children are processed by returning true/false from `iterate()`

## Priority Levels

The GlobalScheduler supports multiple priority levels (0-4):

- Lower priority levels (0, 1) are processed before higher levels (3, 4)
- This allows critical updates to be processed first
- Default priority is 2
- Multiple schedulers can exist at different priority levels

## Tree Traversal

The traversal process follows these rules:

- Components are visited in depth-first order
- Children are ordered by z-index for proper rendering layering
- Component's `iterate()` return value controls whether children are processed
- This allows for efficient partial updates of the tree

For detailed flow diagrams showing these processes, see [Component Rendering and Lifecycle Integration](./component-rendering-lifecycle.md).

## Scheduler Lifecycle

```mermaid
flowchart TD
    A[New Scheduler] --> B[Constructor]
    B --> C[Register with GlobalScheduler]
    C --> D[Wait for updates]
    D --> E{Is scheduled?}
    E -->|Yes| F[Update tree]
    E -->|No| G[Wait for next frame]
    G --> D
    F --> H[Reset scheduled flag]
    H --> G
    
    I[Component calls scheduleUpdate] --> J[Set scheduled flag]
    J --> E
```

## Code Examples

### Basic Scheduler Usage

```typescript
// Create a scheduler
const scheduler = new Scheduler();

// Set the root component
const rootComponent = CoreComponent.mount(MyRootComponent, props);
scheduler.setRoot(rootComponent.__comp.treeNode);

// Start the scheduler
scheduler.start();

// Later, stop the scheduler when done
scheduler.stop();
```

### Component Integration with Scheduler

```typescript
class MyComponent extends Component {
  public updateValue(newValue) {
    this.setState({ value: newValue });
    // This calls performRender() which schedules an update
  }
  
  protected render() {
    // This will be called during the next animation frame
    console.log('Rendering with value:', this.state.value);
  }
}
```

### Using Multiple Schedulers with Different Priority Levels

```typescript
// Create two schedulers with different priority levels
const highPriorityScheduler = new Scheduler();
const lowPriorityScheduler = new Scheduler();

// Add the schedulers to the global scheduler with different priority levels
globalScheduler.addScheduler(highPriorityScheduler, 0); // High priority
globalScheduler.addScheduler(lowPriorityScheduler, 4); // Low priority

// Start the global scheduler
globalScheduler.start();

// Assign different components to the schedulers
highPriorityScheduler.setRoot(highPriorityRootComponent.__comp.treeNode);
lowPriorityScheduler.setRoot(lowPriorityRootComponent.__comp.treeNode);
```

## Optimizing Performance

The scheduling system is designed for optimal performance:

1. Updates are batched per animation frame
2. Multiple state/props changes trigger only one render per frame
3. Z-index ordering allows for efficient rendering of visual components
4. The system only traverses branches that need updating (when components return `false` from `iterate()`)
5. Multiple schedulers can be used for different update frequencies

## Handling Browser Environment Differences

The system adapts to different environments:

```typescript
// For browser environments
const rAF = window.requestAnimationFrame;
const cAF = window.cancelAnimationFrame;
const getNow = window.performance.now.bind(window.performance);

// For non-browser environments
const rAF = (fn) => global.setTimeout(fn, 16);
const cAF = global.clearTimeout;
const getNow = global.Date.now.bind(global.Date);
```

This allows the scheduler to work in both browser and non-browser JavaScript environments.

## Interaction with Component Lifecycle

The scheduler system interacts with component lifecycle as follows:

```mermaid
sequenceDiagram
    participant C as Component
    participant S as Scheduler
    participant G as GlobalScheduler
    
    C->>C: setState/setProps
    C->>S: performRender()
    S->>S: Set scheduled flag
    G->>S: Animation frame triggers performUpdate()
    S->>C: Tree traversal causes iterate()
    C->>C: Process lifecycle (checkData, render, etc.)
    C->>C: Update complete
    S->>S: Reset scheduled flag
```

## Global Scheduler Instance

The system provides a global scheduler instance for convenience:

```typescript
export const globalScheduler = new GlobalScheduler();
export const scheduler = globalScheduler;
```

This allows components to share a single scheduler instance and animation frame loop.

## Debugging the Scheduler

Debugging issues with the scheduler can be challenging, but there are several techniques you can use to identify and resolve problems:

1. **Logging**: Add console logs to the `performUpdate()` and `iterate()` methods to track the order in which components are being updated. This can help you identify performance bottlenecks or unexpected update patterns.
2. **Performance Profiling**: Use the browser's performance profiling tools to identify areas where the scheduler is spending the most time. This can help you pinpoint inefficient components or rendering logic.
3. **Breakpoints**: Set breakpoints in the scheduler's code to step through the update process and examine the state of components and the scheduler itself.
4. **Visualizations**: Create visualizations to track the number of updates per frame, the time spent in each phase of the update process, and the number of components being processed. This can help you identify trends and patterns that might not be apparent from logging or profiling alone.

## Related Documentation

- [Component Lifecycle](./component-lifecycle.md) - In-depth details about component lifecycle methods
- [Rendering Mechanism](../rendering/rendering-mechanism.md) - Architectural details of the rendering system
- [Component Rendering and Lifecycle Integration](./component-rendering-lifecycle.md) - Comprehensive guide showing how these systems work together