# Layers

## Core Concepts

Layers are essentially plugins that extend the graph library's functionality. Each layer can have its own canvas and/or HTML elements, allowing for flexible rendering and interaction capabilities. Layers are designed to:
- Modify behavior of components
- Add new features
- Intercept events
- Interact with other layers

The primary purpose of layers is to provide a modular way to extend the library's behavior without modifying its core code.

## Built-in Layers

The library includes several built-in layers that demonstrate how to extend functionality:

### NewBlockLayer

[NewBlockLayer](newBlockLayer.md) is a good example that extends the library by enabling block creation:
- Clone blocks with Alt + drag
- Customize ghost block appearance
- Handle block creation events

```typescript
// Key events
interface GraphEventsDefinitions {
  "block-add-start-from-shadow": (event: CustomEvent<{ block: Block }>) => void;
  "block-added-from-shadow": (event: CustomEvent<{ block: Block; coord: {x: number, y: number} }>) => void;
}
```

### ConnectionLayer

[ConnectionLayer](connectionLayer.md) is another usefull extension that manages connections:
- Create block-to-block connections (Shift + drag)
- Create anchor-to-anchor connections
- Customize connection appearance

```typescript
// Key events
interface GraphEventsDefinitions {
  "connection-create-start": (event: CustomEvent<{ blockId: string; anchorId: string | undefined }>) => void;
  "connection-created": (event: CustomEvent<{ 
    source: { blockId: string; anchorId?: string; };
    target: { blockId: string; targetAnchorId?: string };
  }>) => void;
}
```

## Using Layers

```typescript
import { Graph } from "@/graph";
import { NewBlockLayer } from "@/components/canvas/layers/newBlockLayer";
import { ConnectionLayer } from "@/components/canvas/layers/connectionLayer";

// Attach when creating a graph
const graph = new Graph({
  layers: [
    [NewBlockLayer, { ghostBackground: "rgba(0, 0, 255, 0.3)" }],
    [ConnectionLayer, {}]
  ]
});

// Or add dynamically
const newBlockLayer = graph.addLayer(NewBlockLayer, { ghostBackground: "rgba(0, 0, 255, 0.3)" });
```

## Creating Custom Layers

### Basic Structure

Each layer can have its own canvas and/or HTML elements for rendering and interaction:

```typescript
import { Layer, LayerContext, LayerProps } from "@/services/Layer";
import { CameraService } from "@/services/camera/CameraService";
import { Graph } from "@/graph";

interface MyLayerProps extends LayerProps {
  customOption?: string;
}

export class MyLayer extends Layer<MyLayerProps> {
  constructor(props: MyLayerProps) {
    super({
      // Canvas element for drawing
      canvas: {
        zIndex: 10,
        classNames: ["my-layer"]
      },
      // HTML element for DOM-based interactions
      html: {
        zIndex: 10,
        classNames: ["my-layer-html"],
        transformByCameraPosition: true
      },
      ...props
    });
    
    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      graph: this.props.graph
    });
    
    // Subscribe to events
    this.context.graph.on("camera-change", this.performRender);
  }
  
  // Rendering method
  protected render() {
    const { ctx } = this.context;
    ctx.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    // Custom rendering code
  }
  
  // Resource cleanup
  protected unmount(): void {
    this.context.graph.off("camera-change", this.performRender);
  }
}
```

### Built-in CSS Classes

The library provides several built-in CSS classes that can be used with layers:

- **no-pointer-events**: Disables pointer events on the layer, making it transparent to mouse interactions. Useful for layers that only render visual elements but shouldn't capture mouse events.
  
  ```typescript
  canvas: {
    zIndex: 4,
    classNames: ["no-pointer-events"]
  }
  ```

- **no-user-select**: Prevents text selection on the layer. Useful for layers with text content that shouldn't be selectable.
  
  ```typescript
  html: {
    zIndex: 5,
    classNames: ["no-user-select"]
  }
  ```

- **layer-with-camera**: Automatically applied when `transformByCameraPosition: true` is set. Makes the HTML layer transform according to camera movements.

You can combine these classes as needed:

```typescript
html: {
  zIndex: 3,
  classNames: ["my-custom-layer", "no-pointer-events", "no-user-select"]
}
```

### Layer Interaction

```typescript
import { ConnectionLayer } from "@/components/canvas/layers/connectionLayer";

// Access another layer
const connectionLayer = this.context.graph.layers.find(layer => layer instanceof ConnectionLayer);

// Use events
this.context.graph.on("connection-created", (event) => {
  // React to connection creation
});
```

### Example: Grid Layer

```typescript
import { Layer } from "@/services/Layer";
import { CameraService } from "@/services/camera/CameraService";

interface GridLayerProps {
  camera: CameraService;
  graph: any;
}

export class GridLayer extends Layer<GridLayerProps> {

  protected ctx: CanvasRenderingContext2D;

  constructor(props: GridLayerProps) {
    super({
      canvas: { zIndex: 1, classNames: ["grid-layer"] },
      ...props
    });
    
    this.ctx = this.getCanvas().getContext("2d");
    
    this.context.graph.on("camera-change", this.performRender);
  }
  
  protected render() {
    const { ctx, camera } = this.context;
    const { width, height, scale, x, y } = camera.getCameraState();
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    
    const gridSize = 20 * scale;
    const offsetX = x % gridSize;
    const offsetY = y % gridSize;
    
    for (let i = offsetX; i < width; i += gridSize) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
    }
    
    for (let i = offsetY; i < height; i += gridSize) {
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
    }
    
    ctx.stroke();
  }
  
  protected unmount(): void {
    this.context.graph.off("camera-change", this.performRender);
  }
}
