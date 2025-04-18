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

## HTML Rendering in Layers

The Layer class can create both Canvas and HTML elements for rendering:

```typescript
// Example of Layer creation with both Canvas and HTML elements
constructor(props: LayerProps) {
  super({
    canvas: {
      zIndex: 2,
      respectPixelRatio: true,
      classNames: ["no-user-select"],
    },
    html: {
      zIndex: 3,
      classNames: ["no-user-select"],
      transformByCameraPosition: true, // This enables HTML rendering with camera transformation
    },
    ...props,
  });
}
```

### HTML Layer Configuration

- **There is no dedicated "HTMLLayer" class**. Instead, HTML rendering is handled by setting the `html` property in the Layer constructor options.
- The `transformByCameraPosition: true` option is crucial for HTML elements that need to move with the camera.
- When this option is set, the layer adds the "layer-with-camera" class to the HTML element and subscribes to camera state changes.

### Camera Transformation

- HTML elements with `transformByCameraPosition: true` are transformed using a matrix transform based on camera state:
```typescript
this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
```
- This transformation is applied directly in the `afterInit()` method when the `transformByCameraPosition` option is set to `true`.
- **IMPORTANT**: The camera state subscription is set up in the `afterInit()` method to ensure it's properly reestablished when a layer is reattached.

### React Integration

- React components are rendered into the HTML element of the GraphLayer using `createPortal` in `GraphCanvas.tsx`.
- The BlocksList component renders React blocks only when the camera is at the detailed zoom level.

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
  }
  
  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Subscribe to events using the graphOn wrapper method for automatic cleanup
    this.graphOn("camera-change", this.performRender);
    
    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }
  
  // Rendering method
  protected render() {
    const { ctx } = this.context;
    ctx.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    // Custom rendering code
  }
  
  // Resource cleanup
  protected unmount(): void {
    // Call super.unmount() to trigger the AbortController's abort method
    // which automatically removes all event listeners
    super.unmount();
    // No need to manually remove event listeners as they are automatically
    // cleaned up by the AbortController
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

### Event Handling with Wrapper Methods

The Layer class provides convenient wrapper methods for event handling that automatically include the AbortController signal. This simplifies event subscription and ensures proper cleanup when layers are unmounted.

```typescript
export class Layer<Props extends LayerProps = LayerProps> extends Component<Props> {
  /**
   * AbortController used to manage event listeners.
   * All event listeners (both graph.on and DOM addEventListener) are registered with this controller's signal.
   * When the layer is unmounted, the controller is aborted, which automatically removes all event listeners.
   */
  protected eventAbortController: AbortController;

  /**
   * A wrapper for this.props.graph.on that automatically includes the AbortController signal.
   * This simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   */
  protected graphOn<EventName extends keyof GraphEventsDefinitions, Cb extends GraphEventsDefinitions[EventName]>(
    eventName: EventName,
    handler: Cb,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    return this.props.graph.on(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }
  
  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the HTML element of the layer.
   */
  protected htmlOn<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.html) {
      throw new Error("Attempt to add event listener to non-existent HTML element");
    }
    
    this.html.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  /**
   * A wrapper for HTMLCanvasElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the canvas element of the layer.
   */
  protected canvasOn<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: (this: HTMLCanvasElement, ev: HTMLElementEventMap[K]) => any,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.canvas) {
      throw new Error("Attempt to add event listener to non-existent canvas element");
    }
    
    this.canvas.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the root element of the layer.
   */
  protected rootOn<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }
    
    this.root.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  constructor(props: Props) {
    super(props);
    this.eventAbortController = new AbortController();
    
    // Initialize properties, but DO NOT register event listeners here
  }
  
  /**
   * Called after initialization and when the layer is reattached.
   * This is the proper place to set up event subscriptions using the wrapper methods.
   */
  protected afterInit() {
    // Register graph events with the graphOn wrapper method
    this.graphOn("camera-change", this.handleCameraChange);
    
    // Use wrapper methods for DOM event listeners
    if (this.canvas) {
      this.canvasOn("mousedown", this.handleMouseDown);
    }
    
    if (this.html) {
      this.htmlOn("click", this.handleHtmlClick);
    }
    
    if (this.root) {
      this.rootOn("keydown", this.handleRootKeyDown);
    }
    
    // Always call super.afterInit() at the end of your implementation
    super.afterInit();
  }
  
  protected unmountLayer() {
    // Abort all event listeners (both graph.on and DOM addEventListener)
    this.eventAbortController.abort();
    // Create a new controller for potential reattachment
    this.eventAbortController = new AbortController();
  }
}
```

### Manual Event Subscriptions

While the wrapper methods (`graphOn`, `htmlOn`, `canvasOn`, `rootOn`) are recommended, you can also manually create event subscriptions using the layer's AbortController:

```typescript
export class MyCustomLayer extends Layer<MyLayerProps> {
  private unsubscribeFunctions: Array<() => void> = [];
  
  constructor(props: MyLayerProps) {
    super(props);
    // Initialize properties, but DO NOT register event listeners here
  }
  
  protected afterInit(): void {
    // Option 1: Manual subscription using the layer's AbortController
    // This will be automatically cleaned up when the layer is unmounted
    this.canvas.addEventListener("mousedown", this.handleMouseDown, {
      signal: this.eventAbortController.signal
    });
    
    // Option 2: Manual subscription to graph events with AbortController
    this.props.graph.on("camera-change", this.performRender, {
      signal: this.eventAbortController.signal
    });
    
    // Option 3: Manual subscription without AbortController
    // In this case, you must handle unsubscription manually
    const unsubscribe = this.props.graph.on("block-change", this.handleBlockChange);
    
    // Store the unsubscribe function for later use
    this.unsubscribeFunctions.push(unsubscribe);
    
    // Always call super.afterInit() at the end
    super.afterInit();
  }
  
  protected unmount(): void {
    // Call super.unmount() to trigger the AbortController's abort method
    // This will clean up all event listeners registered with the AbortController
    super.unmount();
    
    // Manually call any stored unsubscribe functions
    // This is only needed for event listeners that weren't registered with the AbortController
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];
  }
  
  private handleMouseDown = (event: MouseEvent) => {
    // Handle mouse down event
  };
  
  private performRender = () => {
    // Handle camera change event
  };
  
  private handleBlockChange = () => {
    // Handle block change event
  };
}
```

Using the wrapper methods is generally preferred as they provide automatic cleanup and error checking, but manual subscriptions give you more flexibility when needed.

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
    
    this.performRender = this.performRender.bind(this);
  }
  
  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Use the graphOn wrapper method for automatic cleanup
    this.graphOn("camera-change", this.performRender);
    
    // Call parent afterInit to ensure proper initialization
    super.afterInit();
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
    // Call super.unmount() to trigger the AbortController's abort method
    super.unmount();
    // No need to manually remove event listeners
  }
}
