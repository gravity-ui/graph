# ConnectionLayer

`ConnectionLayer` manages the creation and visualization of connections between blocks and anchors in your graph. It provides an interactive drag and drop interface, customizable connection appearance, automatic selection handling, and a comprehensive event system for the entire connection lifecycle.

## Basic Usage

```typescript
const graph = useGraph();

graph.addLayer(ConnectionLayer, {
  createIcon: {
    path: "M7 0.75C7.41421...",
    width: 14,
    height: 14,
    viewWidth: 14,
    viewHeight: 14,
    fill: "#someColor", // optional
    stroke: "#someColor" // optional
  },
  point: {
    path: "M15.53 1.53A...",
    width: 14,
    height: 14,
    viewWidth: 16,
    viewHeight: 16,
    fill: "#someColor", // optional
    stroke: "#someColor" // optional
  },
  drawLine: (start, end) => {
    const path = new Path2D();
    path.moveTo(start.x, start.y);
    path.lineTo(end.x, end.y);
    return {
      path,
      style: { color: "blue", dash: [5, 5] }
    };
  },
  isConnectionAllowed: (sourceComponent) => {
    // Example: Only allow connections from anchor components
    const isSourceAnchor = sourceComponent instanceof AnchorState;
    return isSourceAnchor;
    
    // Or validate based on component properties
    // return sourceComponent.someProperty === true;
  },
  // ... other props
})
```

## Properties

### `ConnectionLayerProps`

```typescript
type ConnectionLayerProps = LayerProps & {
  createIcon?: TIcon;
  point?: TIcon;
  drawLine?: DrawLineFunction;
  isConnectionAllowed?: (sourceComponent: BlockState | AnchorState) => boolean;
};

type TIcon = {
  path: string;       // SVG path
  fill?: string;      // Fill color
  stroke?: string;    // Stroke color
  width: number;      // Width of the icon
  height: number;     // Height of the icon
  viewWidth: number;  // View width
  viewHeight: number; // View height
};
```

- **createIcon**: The icon shown when creating a connection
- **point**: The icon shown at the end of the connection
- **drawLine**: Function that defines how to draw the connection line
- **isConnectionAllowed**: Function that validates if a connection can be created from a source component

## Methods

- **enable()**: Turns on connection creation
- **disabled()**: Turns off connection creation

## Events

The layer provides these events:

### connection-create-start

Fired when a user initiates a connection from a block or anchor. This happens when dragging starts from a block (with Shift key) or an anchor. Preventing this event will prevent the selection of the source component.

```typescript
graph.on("connection-create-start", (event) => {
  console.log('Creating connection from block', event.detail.blockId);
  
  // If you prevent this event, the source component won't be selected
  // event.preventDefault();
})
```

### connection-create-hover

Fired when the dragged connection endpoint hovers over a potential target block or anchor. Preventing this event will prevent the selection of the target component.

```typescript
graph.on("connection-create-hover", (event) => {
  // If you prevent this event, the target component won't be selected
  // event.preventDefault();
})
```

### connection-created

Fired when a connection is successfully created between two elements. By default, this adds the connection to the connectionsList in the store. Preventing this event will prevent the connection from being added to the store.

```typescript
graph.on("connection-created", (event) => {
  // The connection is added to connectionsList by default
  // If you prevent this event, the connection won't be added to the store
  // event.preventDefault();
})
```

### connection-create-drop

Fired when the user releases the mouse button to complete the connection process. This event fires regardless of whether a valid connection was established. Can be used for cleanup or to handle custom connection drop behavior.

```typescript
graph.on("connection-create-drop", (event) => {
  console.log('Connection dropped at', event.detail.point);
  
  // This event is useful for cleanup or custom drop handling
})
```

## How Connections Work

- Hold Shift and drag from one block to another to create a block-to-block connection
- Drag from one anchor to another to create an anchor-to-anchor connection (must be on different blocks)
- Elements are automatically selected during connection creation
- Optional connection validation through the isConnectionAllowed prop
