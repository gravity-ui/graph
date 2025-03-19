# Layer System Rules

## Overview
The Layer system provides a structured approach to rendering and managing different visual layers in the graph application. Layers can contain both canvas and HTML elements, and they are managed by the LayersService.

## Layer Architecture

### Core Components
1. **Layer** - Base class for all layers, extends Component
2. **LayersService** - Manages the collection of layers and their lifecycle
3. **Graph** - Coordinates layers and provides access to the graph context

## Layer Implementation Guidelines

### Creating a Layer

1. **Extend the Layer Class**:
   - Always extend the Layer class for new layer types
   - Properly type the Props, Context, and State generics
   - Example:
   ```typescript
   export class SelectionLayer extends Layer<
     LayerProps,
     LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
   > {
     // Layer implementation
   }
   ```

2. **Constructor Implementation**:
   - Call super with the appropriate configuration
   - Set up canvas and/or HTML elements as needed
   - Initialize the context with required properties
   - Example:
   ```typescript
   constructor(props: LayerProps) {
     super({
       canvas: {
         zIndex: 4,
         classNames: ["no-pointer-events"],
       },
       ...props,
     });

     this.setContext({
       canvas: this.getCanvas(),
       ctx: this.getCanvas().getContext("2d"),
     });
     // Additional initialization
   }
   ```

3. **Resource Management**:
   - Store cleanup functions in an array
   - Override the unmount method to clean up resources
   - Always call super.unmount()
   - Example:
   ```typescript
   protected unmount(): void {
     this.unbindEventHandlers();
     this.unmountCbs.forEach((cb) => cb());
     super.unmount();
   }
   ```

4. **Rendering**:
   - Implement the render method to draw on the canvas
   - Use the context properties for rendering
   - Clear the canvas before drawing
   - Example:
   ```typescript
   protected render(): void {
     this.clearCanvas();
     if (!this.hasActiveSelection()) {
       return;
     }
     this.drawSelectionArea();
   }
   ```

### Layer Registration and Management

1. **Adding Layers to Graph**:
   - Use the Graph.addLayer method to create and register layers
   - Provide the layer constructor and props
   - Example:
   ```typescript
   this.selectionLayer = this.addLayer(SelectionLayer, {});
   ```

2. **Layer Lifecycle**:
   - Layers are automatically attached when the graph is attached
   - Layers can be detached individually or as a group
   - Example:
   ```typescript
   public detachLayer(layer: Layer) {
     this.layers.detachLayer(layer);
   }
   ```

3. **Size Management**:
   - Implement updateSize to handle canvas resizing
   - Respect pixel ratio when specified
   - Example:
   ```typescript
   public updateSize(width: number, height: number) {
     if (this.canvas) {
       const dpr = this.props.canvas.respectPixelRatio ? this.context.constants.system?.PIXEL_RATIO : 1;
       this.canvas.width = width * dpr;
       this.canvas.height = height * dpr;
     }
   }
   ```

## Event Handling in Layers

1. **Binding Events**:
   - Subscribe to graph events in the constructor
   - Store unsubscribe functions for cleanup
   - Example:
   ```typescript
   private bindEventHandlers(): void {
     this.performRender = this.performRender.bind(this);
     this.context.graph.on("camera-change", this.performRender);
     this.unmountCbs.push(this.context.graph.on("mousedown", this.handleMouseDown, { capture: true }));
   }
   ```

2. **Event Handlers**:
   - Use arrow functions for event handlers to preserve this context
   - Handle events according to layer-specific logic
   - Example:
   ```typescript
   private handleMouseDown = (nativeEvent: GraphMouseEvent) => {
     const event = extractNativeGraphMouseEvent(nativeEvent);
     // Event handling logic
   };
   ```

## Layer Types and Configuration

1. **Canvas Layers**:
   - Use canvas for rendering graphics
   - Set appropriate z-index and class names
   - Example:
   ```typescript
   canvas: {
     zIndex: 4,
     classNames: ["no-pointer-events"],
     respectPixelRatio: true
   }
   ```

2. **HTML Layers**:
   - Use HTML for DOM-based content
   - Optionally transform by camera position
   - Example:
   ```typescript
   html: {
     zIndex: 5,
     classNames: ["interactive-layer"],
     transformByCameraPosition: true
   }
   ```

3. **Mixed Layers**:
   - Can have both canvas and HTML elements
   - Access elements via getCanvas() and getHTML()

4. **Logic-only Layers**:
   - A Layer can exist without either canvas or HTML elements
   - Useful for layers that only handle logic, events, or coordinate other layers
   - Simply omit the canvas and html properties in the constructor
   - Example:
   ```typescript
   constructor(props: LayerProps) {
     super(props); // No canvas or HTML configuration
     
     // Layer can still access graph, camera, and other context
     this.setContext({
       graph: this.props.graph,
       camera: this.props.camera
     });
     
     // Can still handle events, coordinate other layers, etc.
   }
   ```

## Performance Considerations

1. **Rendering Optimization**:
   - Only render when necessary
   - Use camera visibility checks
   - Clear only the necessary parts of the canvas

2. **Event Delegation**:
   - Use event delegation for multiple elements
   - Debounce resize handlers

3. **Resource Cleanup**:
   - Always clean up event listeners
   - Properly detach layers when not needed
   - Call super.unmount() in overridden unmount methods 