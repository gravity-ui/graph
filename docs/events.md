## Graph events

To respond to graph events, we have implemented an event system based on the DOM [EventTarget API](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) and [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent)


```typescript
const graph new Graph(...props);

const unsubscribe = graph.on("mouseenter", (event) => {
  console.log("mouseenter", event.detail);
  console.log('hovered element', event.detail.target);
  console.log('original event', event.detail.sourceEvent);

  event.preventDefault();
  event.stopPropagation();
}, {
  once: true,
  caprute: true;
});

unsubscribe();
```

### Events

#### Mouse events

* mousedown
* click
* mouseenter
* mousemove
* mouseleave

This event has a type of Graphmodelevent, with possible targets of `Block`, `Connection`, `Anchor` or `Camera`. If the event fires when the cursor is not over any element, the target will be the Camera.

```typescript
type GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>

graph.on('click', (event: GraphMouseEvent) => {
  console.log('clicked element', event.detail.target);
  console.log('original event', event.detail.sourceEvent);
  console.log('prevent click on element', event.preventDefault());
})
```

Preventing these events will prevent delegate this event to the target component so preventing selection, Drag and drop, other behavior implemented on the components.

#### Block Events

`block-change` Fires on change block position
```typescript
graph.on('block-change', (event: CustomEvent<{ block: TBlock }>) => {
  console.log('Changed block', event.detail.block);
})
```
\
\
`block-anchor-selection-change` Fires when user select block's anchor\

**IMPORTANT**: Multiple anchor selection is not currently supported, so this event will only fire for one anchor.

```typescript
graph.on('block-anchor-selection-change', (event: CustomEvent<{ anchor: TAnchor }>) => {
  console.log('selected anchor', event.detail.anchor);
})
```

\
\
`blocks-selection-change` Fires on selecte/unselect blocks

```typescript
graph.on('blocks-selection-change', (event: CustomEvent<SelectionEvent<TBlockId>>) => {
  console.log('List of selected block IDs', event.detail.list);
  console.log('List of recently selected block IDs', event.detail.changed.add);
  console.log('List of unselected block IDs', event.detail.changed.removed);

  // Prevent apply selection changes
  event.preventDefault();
})
```
\
\
`block-drag-start`: Fires on before start drag event. Preventing stop the drag event
```typescript
graph.on('block-drag-start', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('drag block', event.detail.block);
  // prevent drag block
  event.predentDefault();
})
```
\
\
`block-drag`

```typescript
graph.on('block-drag', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('drag block', event.detail.block);
  console.log('next position', event.detail.x, event.detail.y);
  // prevent apply next block position
  event.predentDefault();
})
```
\
\
`block-drag-end`
```typescript
graph.on('block-drag-end', (event: CustomEvent<{ nativeEvent: MouseEvent; block: TBlock }>) => {
  console.log('dropped block', event.detail.block);
  // prevent do nothing. This event only reset the drag state
  event.predentDefault();
})
```


### Connection events

`connection-selection-change` Fires on selecte/unselect connection

```typescript
graph.on('connection-selection-change', (event: CustomEvent<SelectionEvent<TConnection>>) => {
  console.log('List of selected coneections', event.detail.list);
  console.log('List of recently selected coneections', event.detail.changed.add);
  console.log('List of unselected coneections', event.detail.changed.removed);

  // Prevent apply selection changes
  event.preventDefault();
})

```

#### Camera events

`camera-change`: Fires on camera change state - move, zoom, reset viewport, ...etc

```typescript
graph.on('camera-change', (event: CustomEvent<TCameraState>) => {
  console.log('camera change', event.detail);
  // prevent apply camera change
  event.preventDefault();
})
```

## Event in React

To listen for events on the GraphComponent in React, you can use the `onEventName` prop. This is only available for some of the most common events, however. If you need to listen for other events, you can use a `graphRef` and the `on` method.

List of most usefull events

```typescript
export type TGraphEventCallbacks = {
  click: (data: UnwrapGraphEventsDetail<"click">, event: UnwrapGraphEvents<"click">) => void;
  onCameraChange: (data: UnwrapGraphEventsDetail<"camera-change">, event: UnwrapGraphEvents<"camera-change">) => void;
  onBlockDragStart: (
    data: UnwrapGraphEventsDetail<"block-drag-start">,
    event: UnwrapGraphEvents<"block-drag-start">
  ) => void;
  onBlockDrag: (data: UnwrapGraphEventsDetail<"block-drag">, event: UnwrapGraphEvents<"block-drag">) => void;
  onBlockDragEnd: (data: UnwrapGraphEventsDetail<"block-drag-end">, event: UnwrapGraphEvents<"block-drag-end">) => void;
  onBlockSelectionChange: (
    data: UnwrapGraphEventsDetail<"blocks-selection-change">,
    event: UnwrapGraphEvents<"blocks-selection-change">
  ) => void;
  onBlockAnchorSelectionChange: (
    data: UnwrapGraphEventsDetail<"block-anchor-selection-change">,
    event: UnwrapGraphEvents<"block-anchor-selection-change">
  ) => void;
  onBlockChange: (data: UnwrapGraphEventsDetail<"block-change">, event: UnwrapGraphEvents<"block-change">) => void;
  onConnectionSelectionChange: (
    data: UnwrapGraphEventsDetail<"connection-selection-change">,
    event: UnwrapGraphEvents<"connection-selection-change">
  ) => void;
};
```

For Example

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