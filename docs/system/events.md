## Graph Events

To respond to graph events, we have implemented an event system based on the DOM [EventTarget API](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) and [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent).

```typescript
import { Graph } from "@/graph";

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

### Events

#### Mouse Events

*   `mousedown`: Fires when a mouse button is pressed down on the graph. Prevents default browser behavior.
*   `click`: Fires when a mouse button is released on the graph after a press. Prevents default browser behavior.
*   `mouseenter`: Fires when the mouse pointer enters the graph.
*   `mousemove`: Fires when the mouse pointer is moving inside the graph.
*   `mouseleave`: Fires when the mouse pointer leaves the graph.

These events have a type of `GraphMouseEvent`, with possible targets of `Block`, `Connection`, `Anchor`, or `Camera`. If the event fires when the cursor is not over any element, the target will be the `Camera`.

```typescript
import { EventedComponent } from "@/lib/Component";

interface GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>

graph.on('click', (event: GraphMouseEvent) => {
  console.log('clicked element', event.detail.target);
  console.log('original event', event.detail.sourceEvent);
  console.log('prevent click on element', event.preventDefault());
});
```

Preventing these events will prevent the event from being delegated to the target component, thus preventing selection, drag and drop, and other behaviors implemented on the components.

#### Block Events

`block-change`: Fires when a block's position changes.
```typescript
interface TBlock {
  id: string;
}

graph.on('block-change', (event: CustomEvent<{ block: TBlock }>) => {
  console.log('Changed block', event.detail.block);
});
```

`block-anchor-selection-change`: Fires when a user selects a block's anchor.

**IMPORTANT**: Multiple anchor selection is not currently supported, so this event will only fire for one anchor.

```typescript
interface TAnchor {
  id: string;
}

graph.on('block-anchor-selection-change', (event: CustomEvent<{ anchor: TAnchor }>) => {
  console.log('selected anchor', event.detail.anchor);
});
```

`blocks-selection-change`: Fires when blocks are selected or unselected.

```typescript
interface SelectionEvent<T> {
  list: T[];
  changed: {
    add: T[];
    removed: T[];
  };
}

type TBlockId = string;

graph.on('blocks-selection-change', (event: CustomEvent<SelectionEvent<TBlockId>>) => {
  console.log('List of selected block IDs', event.detail.list);
  console.log('List of recently selected block IDs', event.detail.changed.add);
  console.log('List of unselected block IDs', event.detail.changed.removed);

  // Prevent apply selection changes
  event.preventDefault();
});
```

`block-drag-start`: Fires before a drag event starts. Preventing this event stops the drag event.
```typescript
interface TBlock {
  id: string;
}

graph.on('block-drag-start', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('drag block', event.detail.block);
  // prevent drag block
  event.preventDefault();
});
```

`block-drag`: Fires continuously during a drag event. Preventing this event prevents the block from being dragged.
```typescript
interface TBlock {
  id: string;
}

graph.on('block-drag', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('drag block', event.detail.block);
  console.log('next position', event.detail.x, event.detail.y);
  // prevent apply next block position
  event.preventDefault();
});
```

`block-drag-end`: Fires when a drag event ends.
```typescript
interface TBlock {
  id: string;
}

graph.on('block-drag-end', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('dropped block', event.detail.block);
  // prevent do nothing. This event only resets the drag state
  event.preventDefault();
});
```

### Connection Events

`connection-selection-change`: Fires when connections are selected or unselected.

```typescript
interface SelectionEvent<T> {
  list: T[];
  changed: {
    add: T[];
    removed: T[];
  };
}

type TConnection = string;

graph.on('connection-selection-change', (event: CustomEvent<SelectionEvent<TConnection>>) => {
  console.log('List of selected connections', event.detail.list);
  console.log('List of recently selected connections', event.detail.changed.add);
  console.log('List of unselected connections', event.detail.changed.removed);

  // Prevent apply selection changes
  event.preventDefault();
});
```

#### Camera Events

`camera-change`: Fires when the camera's state changes (move, zoom, reset viewport, etc.).

```typescript
interface TCameraState {
  x: number;
  y: number;
  scale: number;
}

graph.on('camera-change', (event: CustomEvent<TCameraState>) => {
  console.log('camera change', event.detail);
  // prevent apply camera change
  event.preventDefault();
});
```

## Event in React

To listen for events on the GraphComponent in React, you can use the `onEventName` prop. This is only available for some of the most common events, however. If you need to listen for other events, you can use a `graphRef` and the `on` method.

List of most useful events:

```typescript
export type TGraphEventCallbacks = {
  click: (data: any, event: CustomEvent<any>) => void;
  cameraChange: (data: any, event: CustomEvent<any>) => void;
  blockDragStart: (
    data: any,
    event: CustomEvent<any>
  ) => void;
  blockDrag: (data: any, event: CustomEvent<any>) => void;
  blockDragEnd: (data: any, event: CustomEvent<any>) => void;
  blockSelectionChange: (
    data: SelectionEvent<TBlockId>,
    event: CustomEvent<SelectionEvent<TBlockId>>
  ) => void;
  blockAnchorSelectionChange: (
    data: any,
    event: CustomEvent<any>
  ) => void;
  blockChange: (data: any, event: CustomEvent<any>) => void;
  connectionSelectionChange: (
    data: SelectionEvent<TConnection>,
    event: CustomEvent<SelectionEvent<TConnection>>
  ) => void;
};
```

For Example:

```typescript
const YourPrettyGraphComponent = () => {
  const onBlockSelectionChange = useCallback((detail: SelectionEvent<TBlockId>, event: CustomEvent<SelectionEvent<TBlockId>>) => {
    console.log('List of selected block IDs', detail.list);
    console.log('List of recently selected block IDs', detail.changed.add);
    console.log('List of unselected block IDs', detail.changed.removed);
    event.preventDefault();
  }, []);
 return <GraphComponent 
   onBlockSelectionChange={onBlockSelectionChange}
 />
}
```

## Custom Events

You can create and dispatch custom events on the graph using the `dispatchEvent` method. This allows you to extend the graph's event system with your own application-specific events.

**Example using `emit` and `executeDefaultEventAction`:**

```typescript
// Create a custom event detail
const customEventDetail = {
  message: 'Hello from my custom event!',
  timestamp: Date.now()
};

// Emit the custom event
graph.emit('my-custom-event', customEventDetail);

// Define the default action for the custom event
const defaultCustomEventAction = () => {
  console.log('Default custom event action executed!');
  // Perform default action here
};

// Execute the default event action (if any)
graph.executeDefaultEventAction('my-custom-event', customEventDetail, defaultCustomEventAction);

// Listen for the event
graph.on('my-custom-event', (event: CustomEvent<{ message: string; timestamp: number }>) => {
  console.log('Received custom event:', event.detail.message, 'at', new Date(event.detail.timestamp).toLocaleTimeString());
});
```

To extend the list of available events, you can use TypeScript's `declare module` syntax to augment the `GraphEvents` interface. This allows you to add your own custom event types to the graph's event system.

```typescript
declare module '@gravity-ui/graph' {
  interface GraphEvents {
    'my-custom-event': CustomEvent<{ message: string }>;
  }
}

// Now you can use your custom event with type safety
graph.on('my-custom-event', (event) => {
  console.log(event.detail.message);
});