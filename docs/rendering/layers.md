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

Custom layers should extend the base `Layer` class (`src/services/Layer.ts`). This class provides the core functionality for managing Canvas and HTML elements within the graph's rendering pipeline.

```typescript
import { Layer, LayerContext, LayerProps, TGraphColors, TGraphConstants } from "@/services/Layer";
import { ICamera } from "@/services/camera/CameraService";
import { Graph } from "@/graph";

// Define custom properties for your layer, extending the base LayerProps
interface MyLayerProps extends LayerProps {
  customOption?: string;
  gridColor?: string;
}

// Optionally extend the LayerContext if your layer needs additional context
interface MyLayerContext extends LayerContext {
  // Add specific context properties here
}

// Define the Layer, specifying Props and optionally Context
export class MyLayer extends Layer<MyLayerProps, MyLayerContext> {
  constructor(props: MyLayerProps) {
    // Call the base constructor, passing props and potentially overriding default layer settings
    super({
      // Canvas element configuration (optional)
      canvas: {
        zIndex: 10,
        classNames: ["my-layer-canvas"],
        respectPixelRatio: true, // Default: true. Set to false to disable DPR scaling.
        transformByCameraPosition: true // Default: false. Set to true to automatically apply camera transform.
      },
      // HTML element configuration (optional)
      html: {
        zIndex: 11,
        classNames: ["my-layer-html"],
        transformByCameraPosition: true // Default: false. Set to true to apply camera transform via CSS.
      },
      ...props // Pass remaining props, including required `graph` and `camera`
    });

    // --- Context Setup ---
    // Base context (graph, camera, constants, colors, layer) is set by the super constructor.
    // You need to add context specific to the elements created by this layer.
    // It's recommended to do this in `afterInit` when elements are guaranteed to exist.
  }

  // `afterInit` is called after the layer's elements (canvas/html) are created and attached.
  protected afterInit() {
    // Subscribe to events here
    this.cameraSubscription = this.context.graph.on("camera-change", this.performRender);
    // Add other event listeners (e.g., to this.getHTML() or this.getCanvas())
    super.afterInit();
  }

  // --- Rendering --- 
  // This method is called automatically when performRender is invoked (e.g., on camera change).
  protected render() {
    // Check if context is fully initialized
    if (!this.context.ctx || !this.context.graphCanvas) {
      return; 
    }

    // Reset transformations and clear canvas
    this.resetTransform(); // Applies camera transform if transformByCameraPosition=true, respects DPR

    const { ctx, camera, constants, colors } = this.context;
    const { scale, x, y } = camera.getCameraState();

    // --- Custom Rendering Logic --- 
    // Draw using world coordinates. `resetTransform` handles the necessary scaling and translation.
    ctx.fillStyle = this.props.gridColor || colors.canvas.gridColor; // Example using props/colors
    ctx.fillRect(10, 10, 50, 50); // Draws a rectangle at world coordinates (10, 10)

    // Example: Apply additional transform relative to the camera
    // this.applyTransform(worldX, worldY, worldScale); // Respects DPR
  }

  // --- Cleanup --- 
  // Called when the layer is removed from the graph.
  protected unmount(): void {
    // Always clean up subscriptions and event listeners
    this.cameraSubscription?.();
    // Remove other listeners added in `afterInit`
    super.unmount(); // Calls base unmount logic (removes elements)
  }
}
```

### Handling Transformations and Device Pixel Ratio (DPR)

The `Layer` class provides tools to handle rendering correctly with camera transformations and on high-resolution (HiDPI) displays.

- **`respectPixelRatio`** (`LayerProps.canvas.respectPixelRatio`, default: `true`):
    - When `true`, the canvas dimensions are automatically scaled by the device pixel ratio (`window.devicePixelRatio`).
    - The `resetTransform()` and `applyTransform()` methods automatically account for this scaling, so you can draw using world coordinates without manual DPR calculation.
    - Set to `false` only if you need explicit manual control over pixel scaling.

- **`transformByCameraPosition`** (`LayerProps.canvas.transformByCameraPosition` / `LayerProps.html.transformByCameraPosition`, default: `false`):
    - **For Canvas:** When `true`, the `resetTransform()` method automatically applies the current camera translation (`x`, `y`) and `scale` to the canvas context (`ctx`). This means your subsequent drawing operations in the `render` method should use world coordinates.
    - **For HTML:** When `true`, the HTML element gets the `layer-with-camera` class, and its CSS `transform: matrix(...)` is automatically updated on camera changes to match the camera's position and scale.

- **`resetTransform()`**:
    - Call this at the beginning of your canvas `render` method.
    - It resets the canvas context's transform to the identity matrix.
    - It clears the entire canvas (`clearRect`).
    - If `transformByCameraPosition` is `true` for the canvas, it applies the current camera transform (`scale`, `x`, `y`), automatically accounting for DPR if `respectPixelRatio` is `true`.

- **`applyTransform(x, y, scale, respectPixelRatioOverride)`**:
    - Applies an *additional* transformation to the canvas context, relative to the current transform (which includes the camera transform if set by `resetTransform`).
    - Useful for drawing elements at specific world positions/scales relative to the base camera view.
    - It automatically accounts for DPR based on the layer's `respectPixelRatio` setting unless overridden by the optional fourth argument.

- **`getDRP()`**:
    - Returns the device pixel ratio value that the layer is currently using (respecting the `respectPixelRatio` flag).
    - Use this only if you need the DPR value for complex manual calculations, usually unnecessary when using `resetTransform` and `applyTransform`.

**In summary:** For most canvas layers, set `respectPixelRatio: true` and `transformByCameraPosition: true`, call `resetTransform()` at the start of `render`, and draw using world coordinates. Use `applyTransform` for specific relative positioning if needed.

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
