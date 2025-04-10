# Event System

This document describes the event system used in the graph visualization library, based on the DOM [EventTarget API](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) and [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent).

> **Note:** This document is part of a series on the system architecture. See also [Component Lifecycle](./component-lifecycle.md) and [Graph Settings](./graph-settings.md).

## Overview

The event system allows components to respond to user interactions and system changes through a familiar DOM-like API.

```typescript
import { Graph } from "@gravity-ui/graph";

const graph = new Graph(...props);

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

unsubscribe();
```

## Event Types

### Mouse Events

The following mouse events are supported:

| Event | Description | Default Prevention |
|-------|-------------|-------------------|
| `mousedown` | Mouse button pressed down | Prevents browser default |
| `click` | Mouse button released after press | Prevents browser default |
| `mouseenter` | Mouse pointer enters graph area | - |
| `mousemove` | Mouse pointer moves inside graph | - |
| `mouseleave` | Mouse pointer leaves graph area | - |

These events use the `GraphMouseEvent` type:

```typescript
import { EventedComponent } from "@gravity-ui/graph";

interface GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>
```

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

| Event | Description |
|-------|-------------|
| `camera-change` | Fires on camera state changes |

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
