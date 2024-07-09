## Graph editor library

library for graph visualization

## Install and setup

```bash
npm install @yandex-data-ui/graph-editor
```

```jsx
import { GraphCanvas, GraphState, TRenderBlockFn } from "@yandex-data-ui/graph-editor";
import classNames from "classnames";
import React, { useRef } from "react";
import { BlockMenuPortal } from "./Layers/BlockMenuLayer/BlockMenuPortal";
import { useGraphColors } from "./hooks/useGraphColors";
import { useRenderBlock } from "./hooks/useRenderBlock";
import { useGraphController } from "./Context";
export type TGraphComponentProps = {
  className?: string;
};

export function GraphEditor(props: TGraphComponentProps) {

  const { graph } = useGraphController();

  const renderBlock = (graph, block) => {
    return <HTMLBlockView graph={graph} block={block} />;
  };

  return (
    <GraphCanvas
      graph={graph}
      renderBlock={renderBlock}
      onStateChanged={({ state }) => {
        if (state === GraphState.ATTACHED) {
          graph.start();
        }
      }}
    />
  );
}
```

## Graph configuration

You can configure editor with object like:

```typescript
export const exampleConfig: TGraphConfig = {
  configurationName: "simple",
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 160,
      id: "Lonely block without anchors" as TBlockId,
      is: "Block",
      selected: false,
      name: "one block",
      anchors: [],
      meta: "whatever your want as any" as any,
    },
  ],
  connections: [],
  cameraScale: 0.9,
  // start camera poision
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
  settings: {
    // make your graph readonly with this settings:
    canChangeBlockGeometry: ECanChangeBlockGeometry.NONE,
    canDragCamera: false,
    canCreateNewConnections: false,
    canDuplicateBlocks: false,
  },
};
```

## Graph events

To respond to graph events, we have implemented a event system based on the DOM [EventTarget API](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) and [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent)


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

## Available settings

Setup your graph behaviour and appearance with this set of settings:

```typescript
export type TGraphSettingsConfig = {
  canDragCamera: boolean;
  canZoomCamera: boolean;
  canDuplicateBlocks: boolean;
  canChangeBlockGeometry: ECanChangeBlockGeometry;
  canCreateNewConnections: boolean;
  scaleFontSize: number;
  showConnectionArrows: boolean;
  useBezierConnections: boolean;
  useBlocksAnchors: boolean;
  connectivityComponentOnClickRaise: boolean;
  showConnectionLabels: boolean;
};
```

## Graph editing hotkeys and mechanics

- **Create new connection** by pressing shift + left click on source block.
  Drag mouse in target block and unpress mouse.

### Events
`connection-create-start` Fires on start pulling new connection
Preventing this event will prevent the connection from being created
```typescript
graph.on("connection-create-start", (event) => {
  console.log('create new connection from block', event.detail.blockId);
  if(event.detail.anchorId) {
    console.log('from anchor', event.detail.anchorId);
  }
})
```
`connection-create-hover` Fires on new connection hover on block or anchor

```typescript
graph.on("connection-create-hover", (event) => {
  console.log('create connection from', event.detail.sourceBlockId, 'to', event.detail.targetBlockId);
  event.detail.sourceAnchorId && console.log('from source block\'s anchor', event.detail.sourceAnchorId)
  event.detail.targetAnchorId && console.log('to target block\'s anchor', event.detail.sourceAnchorId);

  // Prevent create connection to target block/anchor
  event.preventDefault();
})
```

`connection-created`: Fires on drop new connection to block/anchor

```typescript
graph.on("connection-created", (event) => {
  console.log('mouseup fires');
  console.log('create connection from', event.detail.sourceBlockId, 'to', event.detail.targetBlockId);
  event.detail.sourceAnchorId && console.log('from source block\'s anchor', event.detail.sourceAnchorId)
  event.detail.targetAnchorId && console.log('to target block\'s anchor', event.detail.sourceAnchorId);

  // Prevent create connection to target block/anchor
  event.preventDefault();
})
```

![new connection](https://jing.yandex-team.ru/files/evsudakov/img_3.png)

- **Select multiple blocks** by pressing cmd + left click.

![img_2.png](https://jing.yandex-team.ru/files/evsudakov/img_2.png)

- **Duplicate existing block** by pressing alt + left click. A so-called
  "shadow block" will appear. 
  Library won't create new block when button released. You should use graph api in order to create new block.

### Events
`block-add-start-from-shadow`: Fires on block start moving shadow block
```typescript
graph.on("block-add-start-from-shadow", (event) => {
 console.log('start creating and moving shadow block', event.detail.sourceBlockId);

  // Prevent creating shadow block
  event.preventDefault();
})
```
`block-added-from-shadow`: Fires on shadow block dropped
```typescript
graph.on("block-added-from-shadow", (event) => {
 console.log('drop shadow block', event.detail.sourceBlockId, 'to position', event.detail.coord);

  // Prevent creating shadow block
  event.preventDefault();
})
```

  ![img_4.png](https://jing.yandex-team.ru/files/evsudakov/img_4.png)

## Update graph state with Public api.

List of methods in your disposition:

```typescript
  public zoomToRect(rect: TGeometry, transition?: number): void;

  public zoomToBlocks(blockIds: TBlockId[], transition?: number): void;

  public zoomToViewPort(transition?: number): void;

  public getCurrentConfiguration(): TGraphConfig;

  public setBlockName(blockId: TBlockId, newName: string): void;

  public setSetting(flagPath: keyof TGraphSettingsConfig, value: boolean | number | ECanChangeBlockGeometry): void;

  public setCurrentConfigurationName(newName: string): void;

  public deleteSelected(): void;

  public selectBlocks(blockIds: TBlockId[], selected: boolean): void;

  public getBlockById(blockId: TBlockId): TBlock;

  public getUsableRect(): TGeometry;

  public addBlock(geometry: TGeometry, name: string: void): TBlockId;

  public addConnection(connection: TConnection): string

  public updateConnection(id: string, connection: TConnection): void;

  public selectConnections(connectionIds: string[], selected: boolean): void;
```

## API-Example. Block update

```typescript
useEffect(() => {
  setTimeout(() => {
    if (!graphRef) return;
    graphRef.current.api.updateBlock({
      id: "block id",
    });
  }, 1000);
}, []);
```
