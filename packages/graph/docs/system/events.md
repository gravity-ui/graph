# Event System

This document describes the event system used in the graph visualization library, based on the DOM [EventTarget API](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) and [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent).

> **Note:** This document is part of a series on the system architecture. See also [Component Lifecycle](./component-lifecycle.md) and [Graph Settings](./graph-settings.md).

## Overview

The event system allows components to respond to user interactions and system changes through a familiar DOM-like API.

```typescript
import { Graph } from "@gravity-ui/graph";

const graph = new Graph(...props);

// Using the cleanup function
const unsubscribe = graph.on("mouseenter", (event) => {
  console.log("mouseenter", event.detail);
  console.log('hovered element', event.detail.target);
  console.log('original event', event.detail.sourceEvent);

  event.preventDefault();
  event.stopPropagation();
}, {
  once: true,
  capture: true
});

// Call the cleanup function when done
unsubscribe();

// Using AbortController (recommended for multiple event listeners)
const controller = new AbortController();

graph.on("mouseenter", (event) => {
  console.log("Mouse entered:", event.detail);
}, { signal: controller.signal });

graph.on("mouseleave", (event) => {
  console.log("Mouse left:", event.detail);
}, { signal: controller.signal });

// Later, to remove all event listeners at once:
controller.abort();
```

## Event Types

### Scene lifecycle

`scene-state-change` delivers `{ state }` asynchronously when the scene starts, replaces its contents, switches
renderers or finishes its first draw. Read `graph.scene.state` for the current snapshot. See
[Scene readiness and loading overlays](./scene.md#scene-readiness-and-loading-overlays).

### Mouse Events

The following mouse events are supported:

| Event | Description | Default Prevention |
|-------|-------------|-------------------|
| `mousedown` | Mouse button pressed down | Prevents browser default; stops the camera's pan and the drag |
| `click` | Mouse button released after press | Prevents browser default |
| `mouseenter` | The pointer's target changed: `detail.target` is the new target, `detail.relatedTarget` the old one | Keeps it from the components, whose `hoveredTag` then stays as it was |
| `mouseleave` | The pointer's target changed: `detail.target` is the old target, `detail.relatedTarget` the new one | Keeps it from the components, whose `hoveredTag` then stays as it was |

`mouseenter` and `mouseleave` follow the target, the component under the pointer: they fire at every target change,
not only when the pointer enters or leaves the graph's area. `relatedTarget` is none for the camera (empty space) or
outside the graph. See [Event model](./event-model.md#the-model-events-walk-up-the-component-tree).

These events are `CustomEvent`s. Their `detail` (`UnwrapGraphEventsDetail<"mousedown">`, and the same for the others)
has these fields:

- `target`: the graph component under the pointer, or the camera over empty space.
- `relatedTarget`: on `mouseenter` and `mouseleave` only, the other side of the target change.
- `sourceEvent`: the event GraphLayer dispatched. It is the browser's event for a press, a copy of the browser's
  event for an emulated click (its DOM `target` is `null`), and the hover `CustomEvent` for `mouseenter` and
  `mouseleave`. `getEventTarget(sourceEvent)` returns the target as a graph
  component (`undefined` for the camera).
- `pointerPressed`: whether a mouse button is down.

> **Important:** Preventing these events will block delegation to target components, affecting selection, drag and drop, and other component behaviors.

### Block Events

#### Position Change Events

| Event | Description |
|-------|-------------|
| `block-change` | Fires on block position changes |
| `block-anchor-selection-change` | Fires on anchor selection |
| `blocks-selection-change` | Fires on block selection changes |

#### Drag Events

| Event | Description |
|-------|-------------|
| `block-drag-start` | Fires before a drag event starts |
| `block-drag` | Fires continuously during a drag event |
| `block-drag-end` | Fires when a drag event ends |

### Connection Events

| Event | Description |
|-------|-------------|
| `connection-selection-change` | Fires on connection selection changes |

### Camera Events

| Source | When it fires | Payload | Use for |
|--------|---------------|---------|---------|
| `camera-change` event | Before commit | Proposed `TCameraState` in `event.detail` | Interception, `preventDefault()`, logging intent |
| `graph.$camera` signal | After successful commit | Committed `TCameraState` | Rendering, transforms, derived state, React subscriptions |

```typescript
// Intercept before commit (same pattern as block-change)
graph.on("camera-change", (event) => {
  if (shouldCancel(event.detail)) {
    event.preventDefault();
  }
});

// React to applied state — safe even if another listener cancelled an earlier change
graph.$camera.subscribe((camera) => {
  applyCameraTransform(camera);
});
```

In `Layer` subclasses, override `onCameraChange()` for committed camera updates. The base `Layer` subscribes to `$camera` in `afterInit()`. Use `onGraphEvent("camera-change", …)` only to intercept or cancel a change before commit.

See [Camera Service — Choosing an API](./camera.md#choosing-an-api) for when to use `cameraService`, `$camera`, or `camera-change`.

## Event Cleanup with AbortController

The Graph library supports the [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) API for managing event listeners. This is especially useful for components that need to register multiple event listeners and clean them up efficiently.

```typescript
import { Graph } from "@gravity-ui/graph";

// Create a controller
const controller = new AbortController();

// Register multiple event listeners with the same controller
graph.on("camera-change", handleCameraChange, { signal: controller.signal });
graph.on("blocks-selection-change", handleSelectionChange, { signal: controller.signal });
graph.on("mousedown", handleMouseDown, { signal: controller.signal });

// DOM event listeners can also use the same controller
document.addEventListener("keydown", handleKeyDown, { signal: controller.signal });

// Later, remove all event listeners at once
controller.abort();
```

### Benefits of AbortController

1. **Simplified Cleanup**: Remove multiple event listeners with a single call
2. **Prevents Memory Leaks**: Ensures all event listeners are properly cleaned up
3. **Consistent API**: Works with both graph events and DOM events
4. **Automatic Cleanup**: When used in layers, event listeners are automatically removed when the layer is unmounted

### Using AbortController in Layers

The Layer class in the Graph library uses AbortController internally to manage event listeners and provides a convenient `onGraphEvent` method that automatically includes the AbortController signal:

```typescript
export class MyLayer extends Layer {
  constructor(props) {
    super(props);
    
    // Initialize properties, but DO NOT register event listeners here
  }
  
  /**
   * Called after initialization and when the layer is reattached.
   * This is the proper place to set up event subscriptions using onGraphEvent().
   */
  protected afterInit(): void {
    this.onGraphEvent("blocks-selection-change", this.handleSelectionChange);
    this.onGraphEvent("mousedown", this.handleMouseDown);

    this.getCanvas()?.addEventListener("mousedown", this.handleMouseDown, {
      signal: this.eventAbortController.signal,
    });

    super.afterInit();
  }

  protected onCameraChange(_camera: TCameraState): void {
    this.handleCameraChange();
  }
  
  // No need to manually remove event listeners in unmount
  // They are automatically removed by the AbortController
}
```

### The Layer.onGraphEvent Method

The Layer class provides a convenient wrapper method for `graph.on` that automatically includes the AbortController signal:

```typescript
/**
 * A wrapper for this.props.graph.on that automatically includes the AbortController signal.
 * The method is named onGraphEvent to indicate it's specifically for graph events.
 * This simplifies event subscription and ensures proper cleanup when the layer is unmounted.
 *
 * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
 * This ensures that event subscriptions are properly set up when the layer is reattached.
 * When a layer is unmounted, the AbortController is aborted and a new one is created.
 * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
 * with the new AbortController.
 *
 * @param eventName - The name of the event to subscribe to
 * @param handler - The event handler function
 * @param options - Additional options (optional)
 * @returns The result of graph.on call (an unsubscribe function)
 */
protected onGraphEvent<EventName extends keyof GraphEventsDefinitions, Cb extends GraphEventsDefinitions[EventName]>(
  eventName: EventName,
  handler: Cb,
  options?: Omit<AddEventListenerOptions, "signal">
) {
  return this.props.graph.on(eventName, handler, {
    ...options,
    signal: this.eventAbortController.signal,
  });
}
```

This method simplifies event subscription in layers and ensures proper cleanup when layers are unmounted. It takes the same parameters as `graph.on` except for the signal, which it automatically adds.

## React Integration

The GraphCanvas component in React provides two ways to handle events:

1. Using `onEventName` props for common events
2. Using the `graph` instance (obtained via `useGraph`) and the `on` method for all events

### Common Event Props

The following event callbacks are available as props:

| Prop | Event Type | Description |
|------|------------|-------------|
| `onClick` | `CustomEvent<any>` | Mouse click events |
| `onCameraChange` | `CustomEvent<any>` | Camera state changes |
| `onBlockDragStart` | `CustomEvent<any>` | Block drag initiation |
| `onBlockDrag` | `CustomEvent<any>` | Block dragging |
| `onBlockDragEnd` | `CustomEvent<any>` | Block drag completion |
| `onBlockSelectionChange` | `CustomEvent<SelectionEvent<TBlockId>>` | Block selection changes |
| `onBlockAnchorSelectionChange` | `CustomEvent<any>` | Anchor selection changes |
| `onBlockChange` | `CustomEvent<any>` | Block state changes |
| `onConnectionSelectionChange` | `CustomEvent<SelectionEvent<TConnection>>` | Connection selection changes |

### Example Usage

```typescript
const YourPrettyGraphComponent = () => {
  const onBlockSelectionChange = useCallback(
    (detail: SelectionEvent<TBlockId>, event: CustomEvent<SelectionEvent<TBlockId>>) => {
      console.log('Selected blocks:', detail.list);
      console.log('Recently selected:', detail.changed.add);
      console.log('Recently unselected:', detail.changed.removed);
      event.preventDefault();
    },
    []
  );

  return <GraphCanvas onBlockSelectionChange={onBlockSelectionChange} />;
};
```

## Custom Events

You can extend the graph's event system with custom events using the `emit` method:

```typescript
// Define custom event detail
const customEventDetail = {
  message: 'Custom event triggered',
  timestamp: Date.now()
};

// Emit the custom event
graph.emit('my-custom-event', customEventDetail);
```

### Event Type Definitions

For TypeScript users, here are the common event type definitions:

```typescript
interface SelectionEvent<T> {
  list: T[];
  changed: {
    add: T[];
    removed: T[];
  };
}

interface TCameraState {
  x: number;
  y: number;
  scale: number;
}

interface TBlock {
  id: string;
}

interface TAnchor {
  id: string;
}

type TBlockId = string;
type TConnection = string;
```

> **Note:** When implementing custom events, follow the existing event naming conventions and structure your event detail objects consistently with the built-in events.
