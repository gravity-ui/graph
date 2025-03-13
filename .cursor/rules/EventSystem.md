# Cursor Rules for Working with Events in Components

## Overview

This document outlines the rules and best practices for working with events in components within the graph visualization system. The event system is built around the `EventedComponent` class which extends the base `Component` class.

## Core Concepts

1. **EventedComponent**: The base class for components that need to handle events
2. **Event Bubbling**: Events can bubble up through the component hierarchy
3. **Event Listeners**: Components can listen to events from other components
4. **Graph Events**: Global events emitted by the Graph instance

## Rules for Component Event Handling

### 1. Component Creation and Extension

- Always extend `EventedComponent` when creating components that need to handle events:

```typescript
import { EventedComponent } from "../path/to/EventedComponent";

export class MyComponent extends EventedComponent {
  // Component implementation
}
```

- Set the `evented` property to `true` to indicate that the component can handle events:

```typescript
public readonly evented: boolean = true;
```

### 2. Handling Events

- Implement the `handleEvent` method to process events:

```typescript
protected handleEvent(event: Event) {
  switch (event.type) {
    case 'click':
      this.onClick(event);
      break;
    case 'mousedown':
      this.onMouseDown(event);
      break;
    // Handle other events
  }
}
```

- Create specific handler methods for different event types:

```typescript
protected onClick(event: Event) {
  // Handle click event
}

protected onMouseDown(event: Event) {
  // Handle mousedown event
}
```

### 3. Listening to Events

- Use `addEventListener` to listen to events from other components:

```typescript
// Listen to a specific event
const unsubscribe = someComponent.addEventListener('click', this);

// Or listen to a specific event with a callback function
const unsubscribe = someComponent.addEventListener('click', (event) => {
  // Handle event
});
```

- Use `listenEvents` to listen to multiple events at once:

```typescript
// Listen to multiple events
const unsubscribes = someComponent.listenEvents(['click', 'mousedown'], this);
```

- Always store and call the unsubscribe function when the component is unmounted:

```typescript
protected unmount() {
  // Call unsubscribe functions
  this.unsubscribes.forEach(unsubscribe => unsubscribe());
  super.unmount();
}
```

### 4. Dispatching Events

- Use `dispatchEvent` to dispatch events:

```typescript
// Create a custom event
const event = new Event('click');

// Dispatch the event
this.dispatchEvent(event);
```

- For bubbling events, set the `bubbles` property to `true`:

```typescript
// Create a bubbling event
const event = new Event('click', { bubbles: true });

// Dispatch the event
this.dispatchEvent(event);
```

### 5. Event Bubbling

- Events bubble up through the component hierarchy when the `bubbles` property is set to `true`
- Use `event.stopPropagation()` to stop event bubbling:

```typescript
protected handleEvent(event: Event) {
  // Stop event bubbling
  event.stopPropagation();
  
  // Handle event
}
```

### 6. Custom Events and Event Types

- Define custom event types using constants to avoid typos and improve maintainability:

```typescript
// Define event types
export const EVENTS = {
  DRAG_START: 'drag-start',
  DRAG_UPDATE: 'drag-update',
  DRAG_END: 'drag-end',
};
```

- For global graph events, extend the GraphEventsDefinitions interface:

```typescript
// In your component file
declare module "../path/to/graphEvents" {
  interface GraphEventsDefinitions {
    "custom-event-name": (event: CustomEvent<{ data: string }>) => void;
    "another-custom-event": (event: CustomEvent<{ x: number; y: number }>) => void;
  }
}
```

- Emitting graph events using the `emit` method:

```typescript
// Emit a graph event with data
graph.emit("custom-event-name", { 
  data: "Some data to pass with the event" 
});

// Emit another graph event with coordinates
graph.emit("another-custom-event", { 
  x: 10, 
  y: 20 
});
```

- Using `executеDefaultEventAction` for events with default behavior:

```typescript
// Emit an event and execute default action if not prevented
graph.executеDefaultEventAction("block-add-start-from-shadow", 
  { block: block }, 
  () => {
    // This code will only run if event.preventDefault() was not called
    this.copyBlock = block.connectedState;
    // Additional default behavior...
  }
);
```

- Preventing default actions with `preventDefault()`:

```typescript
// Listen to an event and prevent default action in certain conditions
graph.on("block-add-start-from-shadow", (event) => {
  const { block } = event.detail;
  
  // Check some condition
  if (block.isLocked || this.isReadOnly) {
    // Prevent the default action from happening
    event.preventDefault();
    
    // Optionally show a message or perform alternative action
    console.warn("Cannot add block: the block is locked or graph is read-only");
  }
});
```

- Example of defining and using custom graph events:

```typescript
// Define event types in the graphEvents module
declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    "block-add-start-from-shadow": (event: CustomEvent<{ block: Block }>) => void;
    "block-added-from-shadow": (event: CustomEvent<{ block: Block; coord: TPoint }>) => void;
  }
}

// Emit a custom graph event
graph.emit("block-added-from-shadow", {
  block: this.copyBlock.getViewComponent(),
  coord: point,
});

// Listen to a custom graph event
graph.on("block-added-from-shadow", (event) => {
  const { block, coord } = event.detail;
  // Handle the event
});
```

- Combining event prevention with custom logic:

```typescript
// Emit an event and provide fallback behavior if prevented
const event = graph.emit("connection-create", { 
  sourceBlock: source,
  targetBlock: target,
  connectionType: "default"
});

// Check if the event was prevented
if (event.defaultPrevented) {
  // Custom handling for when the default action was prevented
  console.log("Connection creation was prevented by an event handler");
  // Maybe show a notification or try an alternative connection method
} else {
  // The event wasn't prevented, we can proceed with additional actions
  this.highlightNewConnection(source, target);
}
```

- Using component-level events with CustomEvent:

```typescript
// For component-level events (not graph-wide), use CustomEvent directly
const customEvent = new CustomEvent(EVENTS.DRAG_START, { 
  bubbles: true,
  detail: { x: 10, y: 20 }
});

// Dispatch the event on the component
this.dispatchEvent(customEvent);
```

## Rules for Graph Events

### 1. Listening to Graph Events

- Use the `on` method to listen to graph events:

```typescript
// Listen to a graph event
const unsubscribe = graph.on('mousedown', (event) => {
  // Handle event
});
```

- Always store and call the unsubscribe function when the component is unmounted:

```typescript
// Store unsubscribe function
this.unsubscribe = graph.on('mousedown', this.handleMouseDown);

// Call unsubscribe function when unmounting
unmount() {
  this.unsubscribe();
  super.unmount();
}
```

### 2. Emitting Graph Events

- Use the `emit` method to emit graph events:

```typescript
// Emit a graph event
graph.emit('mousedown', { 
  target: this,
  sourceEvent: originalEvent,
  pointerPressed: true
});
```

### 3. Using Graph Events in React Components

- Use the `useGraphEvent` hook to listen to a single graph event:

```typescript
import { useGraphEvent } from './hooks/useGraphEvents';

function MyComponent({ graph }) {
  useGraphEvent(graph, 'mousedown', (detail, event) => {
    // Handle event
  });
  
  return <div>My Component</div>;
}
```

- Use the `useGraphEvents` hook to listen to multiple graph events:

```typescript
import { useGraphEvents } from './hooks/useGraphEvents';

function MyComponent({ graph }) {
  useGraphEvents(graph, {
    onMouseDown: (detail, event) => {
      // Handle mousedown event
    },
    onClick: (detail, event) => {
      // Handle click event
    }
  });
  
  return <div>My Component</div>;
}
```

## Debugging and Troubleshooting Events

### 1. Checking Event Listeners

- To check if a component has event listeners for a specific event type:

```typescript
// Check if a component has listeners for a specific event type
const hasListeners = component._hasListener(component, 'click');
```

- To debug which components are listening to events, you can add logging to the event system:

```typescript
// Add logging to the _fireEvent method
public _fireEvent(cmp: Component, event: Event) {
  const handlers = listeners.get(cmp)?.get?.(event.type);
  
  console.log(`Firing event ${event.type} on component`, cmp);
  console.log(`Handlers:`, handlers);
  
  handlers?.forEach((cb) => {
    if (typeof cb === "function") {
      cb(event);
    } else if (cb instanceof Component && "handleEvent" in cb && typeof cb.handleEvent === "function") {
      cb.handleEvent?.(event);
    }
  });
}
```

### 2. Tracing Event Bubbling

- To trace event bubbling, add logging to the _dipping method:

```typescript
public _dipping(startParent: Component, event: Event) {
  let stopPropagation = false;
  let parent: Component = startParent;
  event.stopPropagation = () => {
    console.log(`Event propagation stopped at`, parent);
    stopPropagation = true;
  };

  do {
    console.log(`Event ${event.type} bubbling to`, parent);
    this._fireEvent(parent, event);
    if (stopPropagation) {
      return false;
    }
    parent = parent.getParent() as Component;
  } while (parent);

  return true;
}
```

### 3. Common Event Issues and Solutions

#### Event Not Firing

If an event is not firing, check:

1. Is the component extending `EventedComponent`?
2. Is the `evented` property set to `true`?
3. Are there any listeners registered for the event type?
4. Is the event being dispatched correctly?

#### Event Bubbling Issues

If event bubbling is not working as expected:

1. Is the `bubbles` property set to `true` when creating the event?
2. Is `stopPropagation()` being called somewhere in the component hierarchy?
3. Is the component hierarchy correctly set up?

#### Memory Leaks

If you're experiencing memory leaks:

1. Are all event listeners being removed when components are unmounted?
2. Are there any circular references between components and event listeners?
3. Are you storing the unsubscribe functions and calling them in the `unmount` method?

#### Performance Issues

If you're experiencing performance issues:

1. Are there too many event listeners?
2. Is event bubbling being overused?
3. Are event handlers doing too much work?

## Best Practices

1. **Clean Up Event Listeners**: Always clean up event listeners when a component is unmounted to prevent memory leaks
2. **Use Type Safety**: Leverage TypeScript to ensure type safety when working with events
3. **Minimize Event Handlers**: Keep the number of event handlers to a minimum to improve performance
4. **Document Event Types**: Document the types of events that a component can emit or handle
5. **Use Event Delegation**: Use event delegation when handling events for multiple child components
6. **Avoid Direct DOM Events**: Prefer using the component event system over direct DOM event listeners

## Common Pitfalls

1. **Forgetting to Clean Up**: Not cleaning up event listeners can lead to memory leaks
2. **Circular Event References**: Be careful not to create circular event references
3. **Overusing Event Bubbling**: Excessive use of event bubbling can lead to performance issues
4. **Not Handling Event Cancellation**: Always check if an event has been cancelled before proceeding
5. **Ignoring Event Types**: Not checking event types can lead to unexpected behavior 