# Scheduler System Documentation

This document describes the scheduling system that coordinates component updates in the rendering engine, focusing on the `Scheduler` and `GlobalScheduler` classes.

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

The scheduling system works as follows:

1. Component calls `performRender()` to schedule an update
2. This sets `scheduled` flag in the component's Scheduler instance
3. On the next animation frame, GlobalScheduler calls `performUpdate()` on each registered Scheduler
4. If a Scheduler is scheduled, it calls `update()` to traverse the component tree
5. Tree traversal invokes `iterate()` on each component in the tree
6. Components process their lifecycle methods and potentially request more updates

## Priority Levels

The GlobalScheduler supports multiple priority levels for schedulers:

```mermaid
flowchart TD
    A[GlobalScheduler] --> B[Priority 0 Schedulers]
    A --> C[Priority 1 Schedulers]
    A --> D[Priority 2 Schedulers - Default]
    A --> E[Priority 3 Schedulers]
    A --> F[Priority 4 Schedulers]
    
    B --> G[Updates run in priority order]
    C --> G
    D --> G
    E --> G
    F --> G
```

Lower priority levels (0, 1) are processed before higher levels (3, 4), allowing critical updates to be processed first.

## Tree Traversal

During an update, the Scheduler traverses the component tree in depth-first order:

```mermaid
flowchart TD
    A[Scheduler.update] --> B[root.traverseDown]
    B --> C[Tree._walkDown]
    C --> D{Iterator returns true?}
    D -->|Yes| E[Process children]
    D -->|No| F[Skip children]
    E --> G[Process each child]
    G --> H[child._walkDown]
    H --> C
```

The traversal uses the Z-index ordering of components to determine the order of processing children.

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