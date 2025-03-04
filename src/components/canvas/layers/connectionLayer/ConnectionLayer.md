# ConnectionLayer

`ConnectionLayer` lets you create connections between blocks and anchors in your graph. It enables creating new connections through an intuitive drag and drop interface, handles the drawing of connection lines, and manages all related events.

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

## Methods

- **enable()**: Turns on connection creation
- **disabled()**: Turns off connection creation

## Events

The layer provides these events:

### connection-create-start

Fired when a user starts creating a connection.

```typescript
graph.on("connection-create-start", (event) => {
  console.log('Creating connection from block', event.detail.blockId);
})
```

### connection-create-hover

Fired when hovering over a potential target while creating a connection.

```typescript
graph.on("connection-create-hover", (event) => {
  // Prevent connection to this target
  event.preventDefault();
})
```

### connection-created

Fired when a connection is successfully created.

```typescript
graph.on("connection-created", (event) => {
  // The connection is added to connectionsList by default
  // You can prevent this:
  event.preventDefault();
})
```

### connection-create-drop

Fired when the user drops the connection endpoint, whether or not a connection was created.

```typescript
graph.on("connection-create-drop", (event) => {
  console.log('Connection dropped at', event.detail.point);
})
```

## How Connections Work

- Hold Shift and drag from one block to another to create a block-to-block connection
- Drag from one anchor to another to create an anchor-to-anchor connection
- Elements are automatically selected during connection creation
