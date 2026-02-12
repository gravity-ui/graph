# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@gravity-ui/graph is a graph visualization library that combines Canvas for high-performance rendering with HTML/React for rich interactions. The library automatically switches between rendering modes based on zoom level.

## Development Commands

```bash
# Install dependencies (use npm, not yarn or pnpm)
npm install

# Development mode (watch TypeScript and CSS)
npm run dev

# Run Storybook for development
npm run storybook

# Build for production
npm run build:publish

# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm run test

# Update snapshots
npm run test -- --updateSnapshot

# Build Storybook
npm run build-storybook
```

## Core Architecture

### Dual Rendering System

The library uses a **hybrid Canvas + React architecture**:

- **Canvas Mode (Zoomed Out)**: Entire graph rendered on Canvas for maximum performance with thousands of elements
- **React Mode (Zoomed In)**: React components activated for blocks when camera scale reaches threshold
- **Automatic Switching**: `ReactLayer` manages the transition based on `activationScale` configuration

**Key Files**:
- `src/components/canvas/layers/graphLayer/GraphLayer.ts` - Main Canvas rendering
- `src/react-components/layer/ReactLayer.tsx` - React Portal integration
- `src/react-components/GraphCanvas.tsx` - React wrapper component

### Custom Component Framework

The library implements a **custom component system** (not React) for Canvas rendering:

**Component Hierarchy**:
1. `CoreComponent` (`src/lib/CoreComponent.ts`) - Tree structure, children management, context propagation
2. `Component` (`src/lib/Component.ts`) - Lifecycle hooks, state/props management
3. `GraphComponent` (`src/components/canvas/GraphComponent/`) - HitBox, dragging, ports for graph elements
4. `Block`, `BlockConnection` - Specific implementations

**Lifecycle Flow**:
```
willMount → firstIterate → willRender → render → didRender
         → willUpdateChildren → didUpdateChildren
         → propsChanged/stateChanged/contextChanged
         → unmount
```

**Update Pattern**: Components call `performRender()` to schedule updates via the scheduler, which batches renders in the next animation frame.

### Layer System

Layers are the primary extension mechanism. Each layer is a Component that manages Canvas and/or HTML rendering:

**Built-in Layers (render order)**:
1. **BelowLayer** (zIndex: 1) - Background grid
2. **GraphLayer** (zIndex: 2) - Blocks and connections (Canvas)
3. **SelectionLayer** (zIndex: 3) - Selection visualization
4. **ReactLayer** (zIndex: 3) - React components (HTML)
5. **CursorLayer** (zIndex: 4+) - Dynamic cursor management

**Layer Lifecycle**:
- `init()` - Create Canvas/HTML elements
- `attachLayer()` - Attach to DOM, call `afterInit()`
- `afterInit()` - **IMPORTANT**: Set up ALL event listeners here (NOT in constructor/init)
- `unmount()` - Clean up via AbortController

**Creating Custom Layers**:
```typescript
class MyLayer extends Layer {
  constructor(props) {
    super({
      canvas: { zIndex: 2, respectPixelRatio: true },
      html: { zIndex: 3, transformByCameraPosition: true },
      ...props
    });
  }

  protected afterInit() {
    // Subscribe to events using wrapper methods
    this.onGraphEvent("camera-change", this.handleCameraChange);
    this.onCanvasEvent("mousedown", this.handleMouseDown);
    super.afterInit(); // Call at end
  }
}

// Add to graph
graph.addLayer(MyLayer, { customProp: 'value' });
// Do NOT pass graph, camera, root - these are auto-provided
```

### Scheduler System

**GlobalScheduler** (`src/lib/Scheduler.ts`) drives all rendering via `requestAnimationFrame`:

- **Priority Queues**: 5 levels (HIGHEST → LOWEST)
- **Batched Updates**: `performRender()` marks components dirty, actual render happens in next frame
- **Tree Traversal**: Only dirty components actually call `render()`
- **Lifecycle**: `graph.start()` begins animation loop, `graph.stop()` pauses

### Reactive State with Preact Signals

The library uses `@preact/signals-core` for reactive state management:

**Store Structure** (`src/store/`):
```
RootStore
├── blocksList: BlockListStore
│   ├── $blocks: Signal<BlockState[]>
│   └── blockSelectionBucket
├── connectionsList: ConnectionsStore
│   ├── $connections: Signal<ConnectionState[]>
│   └── connectionSelectionBucket
├── groupsList: GroupsListStore
├── settings: GraphEditorSettings
└── selectionService: SelectionService
```

**Block State** (`src/store/block/Block.ts`):
```typescript
BlockState {
  $rawState: Signal<TBlock>           // Raw block data
  $state: computed(() => ...)         // Full state + selection
  $geometry: computed(() => ...)      // x, y, width, height
  $selected: computed(() => ...)      // Selection state
  $anchorStates: Signal<AnchorState[]>
}
```

**Key Patterns**:
- Components subscribe to signals via `onSignal()` in `afterInit()`
- Use `batch(() => { ... })` to wrap multiple signal updates
- React integration via `useSignal()` hook
- Automatic cleanup via AbortController

### Camera System

**CameraService** (`src/services/camera/CameraService.ts`) manages viewport and zoom:

**State**:
```typescript
{
  x, y              // Camera position in canvas space
  width, height     // Viewport dimensions
  scale             // Zoom level (0.01 - 1.0)
  relativeX/Y       // Scale-aware camera space coordinates
  viewportInsets    // UI overlay padding
  autoPanningEnabled
}
```

**Coordinate Conversion**:
- **Screen → World**: `camera.applyToPoint(screenX, screenY)`
- **World → Screen**: Apply camera transform manually in Canvas

### Event System

**Event Subscription Patterns**:

**In Layers (Preferred)**:
```typescript
protected afterInit() {
  // Graph events
  this.onGraphEvent("camera-change", this.handleCameraChange);

  // DOM events
  this.onCanvasEvent("mousedown", this.handleMouseDown);
  this.onHtmlEvent("click", this.handleClick);
  this.onRootEvent("keydown", this.handleKeyDown);

  // Signal subscriptions
  this.onSignal(this.context.graph.$graphColors, this.handleColorsChange);

  super.afterInit();
}
```

**In React**:
```typescript
import { useGraphEvent } from '@gravity-ui/graph';

function MyComponent() {
  const { graph } = useGraph(config);

  useGraphEvent(graph, 'block:select', (detail, event) => {
    console.log('Block selected:', detail.target?.id);
  });

  return <GraphCanvas graph={graph} />;
}
```

**IMPORTANT**: Always use AbortController pattern. The layer wrapper methods (`onGraphEvent`, etc.) handle this automatically. Never subscribe in constructor - always in `afterInit()`.

## Common Patterns

### Batch State Updates
```typescript
import { batch } from '@preact/signals-core';

batch(() => {
  store.blocksList.updateBlocks(blocks);
  store.connectionsList.updateConnections(connections);
});
```

### Custom Block Rendering
```typescript
const customBlocks = {
  "MyBlockType": CustomBlockComponent,
  "default": DefaultBlockComponent
};
graph.rootStore.settings.setBlockComponents(customBlocks);
```

### Adding Layers in React
```typescript
import { useLayer } from '@gravity-ui/graph';

function MyComponent() {
  const { graph } = useGraph(config);

  useLayer(graph, DevToolsLayer, {
    showRuler: true,  // Only custom props
    // graph, camera, root auto-provided
  });

  return <GraphCanvas graph={graph} />;
}
```

## Key Type Conventions

- Types and interfaces start with `T` or `I`: `TBlock`, `ICamera`, `TConnection`
- Component files: `ComponentName.tsx` or `ComponentName.ts`
- Utilities: `utilityName.ts`
- Tests: `ComponentName.test.ts`
- Styles: `ComponentName.css`

## Important Rules from .cursor/rules

### Event Handling
- **Always** set up event subscriptions in `afterInit()`, NOT in constructor
- Use layer wrapper methods: `onGraphEvent`, `onCanvasEvent`, `onHtmlEvent`, `onRootEvent`
- These methods use the layer's `eventAbortController` for automatic cleanup
- Call `super.afterInit()` at the END of your `afterInit()` method
- Call `super.unmount()` in unmount to ensure proper cleanup

### Layer Lifecycle
- **DOM operations** must be in `afterInit()`, not `init()` or constructor
- Layers are created (`constructor` → `init`) before DOM attachment
- `afterInit()` is called after `attachLayer()` when layer is in DOM
- This ensures root element is available for DOM operations and measurements

### Layer Configuration
- Extend base `LayerProps` when creating custom layer props
- Pass `graph`, `camera`, `root`, `emitter` automatically via `graph.addLayer()`
- Override specific options in constructor: `super({ ...props, canvas: { zIndex: 2 } })`
- Use `respectPixelRatio: true` for sharp Canvas rendering
- Use `transformByCameraPosition: true` for layers that follow camera

### HTML Rendering in Layers
- No dedicated "HTMLLayer" class - set `html` property in Layer constructor
- `transformByCameraPosition: true` enables HTML transform with camera
- Uses CSS `matrix()` transform for performance
- React components render via `ReactLayer` using `createPortal`

## Architecture Summary

**Data Flow**:
```
User Input
  ↓
GraphLayer Event Handler
  ↓
Store Signal Update (batched)
  ↓
Scheduler marks components dirty
  ↓
requestAnimationFrame tick
  ↓
Component.iterate() traversal
  ↓
render() methods called
  ↓
Canvas/HTML updates
```

**Rendering Pipeline**:
1. Components schedule updates via `performRender()`
2. GlobalScheduler batches all updates
3. On next frame, scheduler traverses component tree
4. Only dirty components call `render()`
5. Canvas context updates drawn to screen

**State Management**:
- Centralized in `RootStore`
- Reactive via `@preact/signals-core`
- Computed signals for derived state
- Automatic component updates when signals change
- React integration via `useSignal()` hook

## Extension Points

The primary extension mechanism is **Custom Layers**:

1. **Adding Visuals**: Create a layer with Canvas rendering
2. **Adding Interactions**: Create a layer with event handlers
3. **Adding UI Overlays**: Create a layer with HTML elements
4. **Custom Behaviors**: Extend base components (Block, Connection)

Layers receive:
- `graph` instance for API access
- `camera` for viewport information
- `root` element for DOM attachment
- Full context with colors, constants, services

## Testing

- Tests use Jest with `@swc/jest` for TypeScript
- Canvas mocking via `jest-canvas-mock`
- Test files in `__tests__` directories or `*.test.ts` alongside source
- Run specific test: `npm test -- <pattern>`

## Documentation

Comprehensive docs in `docs/`:
- `docs/system/` - Component lifecycle, events, scheduler, public API
- `docs/components/` - Canvas components, blocks, anchors
- `docs/rendering/` - Rendering mechanism, layers
- `docs/blocks/` - Block groups
- `docs/connections/` - Connection system
- `docs/react/` - React integration guide

Live examples: https://preview.gravity-ui.com/graph/

---

# Coding Rules and Best Practices

## Type Safety Rules

### NEVER use `any` type

**Strict Rules:**
- Use specific types whenever possible (`MouseEvent`, `KeyboardEvent`, `HTMLElement`)
- Use `void` for functions that don't return a value
- Use `unknown` only as a last resort when the type is truly unpredictable
- Implement appropriate interfaces instead of type casting
- Use generics to create flexible but type-safe APIs

**Type Casting:**
- Avoid `as any` at all costs
- If type casting is necessary, use `as unknown as TargetType`
- Prefer type guards (`instanceof`, `typeof`, custom type predicates) over type casting

**Examples:**
```typescript
// ❌ Bad
function handleEvent(event: any) {
  event.preventDefault();
}

// ✅ Good
function handleEvent(event: MouseEvent): void {
  event.preventDefault();
}

// ❌ Bad
const element = document.getElementById('foo') as any;

// ✅ Good
const element = document.getElementById('foo') as HTMLElement | null;
if (element) {
  // Use element
}
```

### Always Specify Return Types

**Rule:** Always specify return types for functions explicitly.

```typescript
// ❌ Bad
function getBlockById(id: string) {
  return this.blocks.find(b => b.id === id);
}

// ✅ Good
function getBlockById(id: string): BlockState | undefined {
  return this.blocks.find(b => b.id === id);
}

// ✅ Good - void for no return
function updateBlock(block: TBlock): void {
  this.$blocks.value = [...this.$blocks.value, block];
}
```

## TypeScript Best Practices

### Type Definitions

**Prefer interfaces for objects, type aliases for unions:**
```typescript
// ✅ Good - interface for object shape
interface BlockData {
  id: string;
  type: 'input' | 'output' | 'process';
  position: { x: number; y: number };
}

// ✅ Good - type alias for union
type BlockType = 'input' | 'output' | 'process';

// ❌ Bad - overly generic
interface BlockData {
  [key: string]: any;
}
```

### Generics

**Use meaningful names and clear constraints:**
```typescript
// ❌ Bad
function transformBlock<T>(block: T): any {
  return { ...block };
}

// ✅ Good
function transformBlock<TData extends BlockData>(
  block: TData
): TransformedBlock<TData> {
  return {
    ...block,
    transformed: true,
  };
}
```

### Class Members

**Rules:**
- Use explicit accessibility modifiers (`public`, `private`, `protected`) for methods and accessors
- Parameter properties (`constructor(private name: string)`) are encouraged
- Regular properties don't require explicit accessibility (default `public`)
- Constructors don't require `public`

```typescript
// ✅ Good
class Block extends Component {
  private isDirty: boolean = false;

  constructor(
    private readonly id: string,
    protected state: BlockState
  ) {
    super();
  }

  public render(): void {
    // ...
  }

  protected updateState(): void {
    // ...
  }
}
```

### Module Organization

**Best Practices:**
- Use barrel exports (`index.ts`) for public APIs
- Keep internal types in separate files
- Use type-only imports: `import type { MyType } from './types';`
- Export types explicitly when needed

```typescript
// index.ts - barrel export
export * from "./Block";
export * from "./BlockState";
export type { TBlock, TBlockId } from "./types";

// someFile.ts - type-only import
import type { TBlock } from "./types";
import { BlockState } from "./BlockState";
```

## Code Style (Prettier)

**Formatting Rules:**
- **Quotes**: Always double quotes (`"`)
- **Semicolons**: Always (`;`)
- **Trailing commas**: In multi-line arrays, objects, function parameters
- **Line length**: Maximum 100 characters
- **Indentation**: 2 spaces for all files
- **Object literals**: Add spaces inside braces `{ foo: "bar" }`

**Example:**
```typescript
const config = {
  blocks: [
    { id: "1", type: "input" },
    { id: "2", type: "output" },
  ],
  connections: [
    { source: "1", target: "2" },
  ],
};

function createBlock(
  id: string,
  type: BlockType,
  options: BlockOptions,
): Block {
  return new Block(id, type, options);
}
```

**Fixing ESLint Errors:**
- Always run `npx eslint --fix PATH_TO_FILE` first
- Don't attempt manual fixes before running auto-fix

## Canvas Components Rules

### State and Props Management

**Rules:**
- Use `setState()` instead of direct `this.state =`
- Use `setProps()` instead of direct `this.props =`
- Both methods automatically trigger re-render

```typescript
// ❌ Bad
this.state = { selected: true };
this.props = { x: 100, y: 200 };

// ✅ Good
this.setState({ selected: true });
this.setProps({ x: 100, y: 200 });
```

### Rendering Control

**Rules:**
- Call `performRender()` to request re-render
- NEVER call `render()` directly
- `setState()` and `setProps()` automatically call `performRender()`

```typescript
// ❌ Bad
this.render();

// ✅ Good
this.performRender();

// ✅ Good - automatic re-render
this.setState({ selected: true }); // No need to call performRender()
```

### Creating Children

**Rules:**
- Use `Component.create(props)` instead of `new Component(props)`
- Create children only through `updateChildren()` method

```typescript
// ❌ Bad
const child = new Block({ id: "1" });
this.children.push(child);

// ✅ Good
protected updateChildren(): Component[] {
  return this.blocks.map(block =>
    Block.create({ id: block.id, ...block })
  );
}
```

### Reactivity and Performance

**Best Practices:**
- Use `subscribeSignal()` for reactive updates
- Override `stateChanged()` to optimize rendering
- Use `shouldRender = false` to skip unnecessary renders
- Use `isVisible()` to check viewport visibility before rendering

```typescript
class Block extends Component {
  protected afterInit(): void {
    // Subscribe to block state changes
    this.subscribeSignal(
      this.blockState.$state,
      this.handleStateChange.bind(this)
    );
    super.afterInit();
  }

  protected stateChanged(prevState: TBlockState): void {
    // Only re-render if position changed
    if (
      prevState.x !== this.state.x ||
      prevState.y !== this.state.y
    ) {
      this.performRender();
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.isVisible()) return;
    // Render logic
  }
}
```

### Block Component Specific Rules

**Coordinate System:**
- DO NOT transform original coordinates to world coordinates in components
- Components receive world coordinates, canvas transform handles screen conversion

**Scaling:**
- Scale line widths based on camera zoom for consistent visual appearance

```typescript
public render(ctx: CanvasRenderingContext2D): void {
  const scale = this.context.camera.getCameraScale();
  ctx.lineWidth = Math.round(2 / scale); // Consistent 2px visual width
  
  // Use theme colors
  ctx.fillStyle = this.context.colors.block.background;
  ctx.strokeStyle = this.context.colors.block.border;
  
  // Render block
}
```

### Connection Component Rules

**BatchPath2DRenderer:**
- Prefer `update()` over conditional `add()`/`delete()` logic
- `update()` internally calls `delete()` then `add()`

```typescript
// ❌ Bad
if (this.isAdded) {
  this.batchRenderer.delete(this.id);
}
this.batchRenderer.add(this.id, this.path);
this.isAdded = true;

// ✅ Good
this.batchRenderer.update(this.id, this.path);
```

## Layer System Rules

### Layer Purpose and Extensibility

**Primary Goal:** Layers are the main extension mechanism for the library.

**Use layers for:**
- Adding new visual elements to the graph
- Adding new behaviors and interactions
- Managing non-visual logic that participates in lifecycle
- Creating UI overlays

### Layer Lifecycle

**Initialization Sequence:**
1. **Creation** (`constructor` → `init()`) - Layer created, NOT in DOM
2. **Attachment** (`attachLayer()` → `afterInit()`) - Layer attached to DOM
3. **Updates** (rendering cycle) - Layer responds to changes
4. **Detachment** (`detachLayer()` → `unmount()`) - Layer removed from DOM

**CRITICAL RULE:** All DOM operations MUST be in `afterInit()`, NOT in `init()` or `constructor`.

**Why:** During creation, the root element may be `undefined` or not yet in document. `afterInit()` guarantees DOM is ready.

```typescript
class MyLayer extends Layer {
  constructor(props: LayerProps) {
    super(props);
    // ❌ Bad - NO DOM operations here
    // this.canvas.addEventListener('click', ...);
  }

  protected init(): void {
    super.init();
    // ❌ Bad - NO DOM operations here
  }

  protected afterInit(): void {
    // ✅ Good - DOM operations here
    this.onCanvasEvent("click", this.handleClick);
    this.onGraphEvent("camera-change", this.handleCamera);
    
    // Inject styles
    if (this.html) {
      this.html.style.pointerEvents = "none";
    }

    super.afterInit(); // Always call at end
  }

  public unmount(): void {
    // Cleanup happens automatically via AbortController
    super.unmount();
  }
}
```

### Layer Configuration

**LayerProps structure:**
```typescript
interface LayerProps {
  canvas?: {
    zIndex: number;
    classNames: string[];
    respectPixelRatio: boolean;        // default: true
    transformByCameraPosition: boolean; // default: false
  };
  html?: {
    zIndex: number;
    classNames: string[];
    transformByCameraPosition: boolean; // default: false
  };
  camera: ICamera;
  graph: Graph;
  root: HTMLElement;
}
```

**Creating a layer:**
```typescript
class MyLayer extends Layer<TMyLayerProps, LayerContext, TComponentState> {
  constructor(props: TMyLayerProps) {
    super({
      ...props,
      canvas: {
        ...props.canvas,
        zIndex: 100,
        respectPixelRatio: true,
        classNames: ["my-layer-canvas"],
      },
      html: {
        ...props.html,
        zIndex: 101,
        transformByCameraPosition: true,
        classNames: ["my-layer-html"],
      },
    });
  }
}

// TMyLayerProps must extend LayerProps
interface TMyLayerProps extends LayerProps {
  myCustomProp: string;
}
```

### HTML Rendering in Layers

**Key Points:**
- No separate "HTMLLayer" class
- Configure HTML rendering via `html` property in constructor
- `transformByCameraPosition: true` enables automatic camera transform
- Transform uses CSS `matrix()` for performance

```typescript
constructor(props: LayerProps) {
  super({
    html: {
      zIndex: 3,
      classNames: ["my-html-layer"],
      transformByCameraPosition: true, // Enables camera transform
    },
    ...props,
  });
}

protected afterInit(): void {
  // Camera transform is applied automatically
  // Subscription set up in afterInit() for proper reattachment
  this.onGraphEvent("camera-change", this.handleCameraChange);
  super.afterInit();
}
```

### Adding Layers to Graph

**In Config:**
```typescript
const graphConfig = {
  layers: [
    [MyLayer, { myCustomProp: "value" }], // Only custom props
  ],
};
```

**Dynamically:**
```typescript
// graph.addLayer() automatically provides graph, camera, root, emitter
const layer = graph.addLayer(MyLayer, {
  myCustomProp: "value",
  // Do NOT pass: graph, camera, root, emitter
});
```

### Device Pixel Ratio (DPR) and Transforms

**For crisp Canvas rendering:**
- Set `respectPixelRatio: true` (default) in canvas config
- Base Layer class handles DPR scaling automatically

**Manual transform methods:**
```typescript
public render(ctx: CanvasRenderingContext2D): void {
  // Clear canvas and apply base transform
  this.resetTransform();
  
  // Apply additional transform if needed
  this.applyTransform(x, y, scale, respectPixelRatio);
  
  // Get current DPR
  const dpr = this.getDRP();
  
  // Render...
}
```

**Camera coordinate conversion:**
```typescript
// Screen to World
const worldPoint = this.context.camera.applyToPoint(screenX, screenY);

// World to Screen (manual)
const cameraState = this.context.camera.getCameraState();
const screenX = worldX * cameraState.scale + cameraState.x;
const screenY = worldY * cameraState.scale + cameraState.y;
```

### Layer Event Handling

**CRITICAL RULE:** Use wrapper methods in `afterInit()`, NOT in constructor.

**Wrapper methods (use AbortController internally):**
- `onGraphEvent(eventName, handler)` - Graph events
- `onCanvasEvent(eventName, handler)` - Canvas element events
- `onHtmlEvent(eventName, handler)` - HTML element events
- `onRootEvent(eventName, handler)` - Root element events
- `onSignal(signal, handler)` - Signal subscriptions

```typescript
protected afterInit(): void {
  // ✅ Good - wrapper methods handle AbortController
  this.onGraphEvent("camera-change", this.handleCameraChange);
  this.onCanvasEvent("mousedown", this.handleMouseDown);
  
  if (this.html) {
    this.onHtmlEvent("click", this.handleHtmlClick);
  }
  
  if (this.root) {
    this.onRootEvent("keydown", this.handleKeyDown);
  }

  // Signal subscription
  this.onSignal(
    this.context.graph.$graphColors,
    this.handleColorsChange
  );

  super.afterInit(); // Always at end
}

// Handlers are automatically cleaned up on unmount via AbortController
```

### Event Propagation to Camera

**Problem:** Layers added to root may intercept events intended for camera (pan/zoom).

**Solution:** Override `getParent()` to delegate to camera:

```typescript
public getParent(): Component | undefined {
  return this.props.graph.getGraphLayer().$.camera;
}
```

## Event System Rules

### Subscription Patterns

**In Layers (Preferred):**
Use wrapper methods - they handle AbortController automatically.

```typescript
protected afterInit(): void {
  this.onGraphEvent("block:select", this.handleBlockSelect);
  this.onCanvasEvent("mousemove", this.handleMouseMove);
  super.afterInit();
}

private handleBlockSelect = (event: CustomEvent): void => {
  const block = event.detail.target;
  console.log("Block selected:", block?.id);
};
```

**In React (Recommended):**
Use `useGraphEvent` hook - automatic cleanup.

```typescript
import { useGraphEvent } from "@gravity-ui/graph";

function MyComponent() {
  const { graph } = useGraph(config);

  useGraphEvent(graph, "block:select", (detail, event) => {
    console.log("Block selected:", detail.target?.id);
  });

  useGraphEvent(graph, "camera-change", (detail) => {
    console.log("Camera state:", detail);
  });

  return <GraphCanvas graph={graph} />;
}
```

**Core API (Manual Cleanup Required):**
```typescript
// ❌ Avoid - manual cleanup
const unsubscribe = graph.on("event-name", handler);
// Must call: unsubscribe();

// ✅ Preferred - AbortController
const controller = new AbortController();
graph.on("event-name", handler, { signal: controller.signal });
// Cleanup: controller.abort();
```

### Event Data Access

**Event structure:**
- Data in `event.detail`
- Target component in `event.detail.target` (for interaction events)
- Source DOM event in `event.detail.sourceEvent`

```typescript
useGraphEvent(graph, "block:click", (detail, event) => {
  const block = detail.target;        // BlockComponent
  const mouseEvent = detail.sourceEvent; // MouseEvent
  
  if (mouseEvent.shiftKey) {
    // Handle shift+click
  }
  
  // Cancel default behavior
  event.preventDefault();
});
```

## React Integration Rules

### Core Components

**GraphCanvas - Main Container:**
```tsx
import { GraphCanvas, useGraph } from "@gravity-ui/graph";

function App() {
  const { graph } = useGraph({
    layers: [[MyLayer, { customProp: "value" }]],
  });

  return (
    <GraphCanvas
      graph={graph}
      renderBlock={(graph, block) => (
        <GraphBlock graph={graph} block={block}>
          <div>Custom content</div>
        </GraphBlock>
      )}
    />
  );
}
```

**GraphBlock - Block Wrapper:**
```tsx
<GraphBlock graph={graph} block={block} className="custom-block">
  <div className="block-content">
    <h3>{block.name}</h3>
    <p>{block.description}</p>
  </div>
</GraphBlock>
```

**Automatic handling:**
- Position synchronization with canvas
- State management (selection, hover)
- Layout management
- Z-index handling
- CSS variables injection

**GraphBlockAnchor - Connection Points:**
```tsx
<GraphBlockAnchor
  graph={graph}
  anchor={anchor}
  position="fixed" // or "auto"
>
  {(state) => (
    <div className={cn("anchor", { selected: state.selected })}>
      <div className="anchor-dot" />
    </div>
  )}
</GraphBlockAnchor>
```

### Layer Management with useLayer

**Hook signature:**
```typescript
const layer = useLayer(graph, LayerConstructor, props);
```

**Features:**
- Automatic initialization when graph is ready
- Automatic cleanup on unmount
- Props updates via `setProps()`
- Returns layer instance

**Example:**
```typescript
import { useLayer } from "@gravity-ui/graph";

function MyComponent() {
  const { graph } = useGraph(config);

  const devTools = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize: 20,
    // graph, camera, root auto-provided
  });

  // Can access layer instance
  useEffect(() => {
    if (devTools) {
      console.log("DevTools layer ready");
    }
  }, [devTools]);

  return <GraphCanvas graph={graph} />;
}
```

### CSS Variables

**Automatic CSS variables injected by GraphBlock:**
```css
.custom-block {
  /* Position (automatic) */
  --graph-block-geometry-x: 0px;
  --graph-block-geometry-y: 0px;
  --graph-block-geometry-width: 200px;
  --graph-block-geometry-height: 100px;
  --graph-block-z-index: 1;

  /* Theme colors (from config) */
  --graph-block-bg: rgba(37, 27, 37, 1);
  --graph-block-border: rgba(229, 229, 229, 0.2);
  --graph-block-border-selected: rgba(255, 190, 92, 1);

  /* Use variables */
  position: absolute;
  left: var(--graph-block-geometry-x);
  top: var(--graph-block-geometry-y);
  width: var(--graph-block-geometry-width);
  height: var(--graph-block-geometry-height);
  z-index: var(--graph-block-z-index);
  background: var(--graph-block-bg);
  border: 1px solid var(--graph-block-border);
}

.custom-block.selected {
  border-color: var(--graph-block-border-selected);
}
```

### Configuration

**View Configuration:**
```typescript
const config: TGraphConfig = {
  viewConfiguration: {
    colors: {
      block: {
        background: "rgba(37, 27, 37, 1)",
        border: "rgba(229, 229, 229, 0.2)",
        selectedBorder: "rgba(255, 190, 92, 1)",
      },
      connection: {
        background: "rgba(255, 255, 255, 0.5)",
        selectedBackground: "rgba(234, 201, 74, 1)",
      },
      anchor: {
        background: "rgba(255, 255, 255, 0.8)",
        selectedBackground: "rgba(255, 190, 92, 1)",
      },
    },
  },
};
```

**Behavior Settings:**
```typescript
const config: TGraphConfig = {
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
    canDragBlocks: true,
    canSelectBlocks: true,
    canCreateNewConnections: true,
    showConnectionArrows: true,
    useBezierConnections: true,
    blockSelectionMode: "multiple", // or "single"
  },
};
```

## Storybook Rules

### Graph Initialization Pattern

**Use `useGraph` hook (Recommended):**
```typescript
import { useGraph, GraphCanvas, GraphBlock } from "@gravity-ui/graph";
import { useEffect } from "react";

export const MyStory = () => {
  const { graph } = useGraph({
    layers: [[MyLayer, { customProp: "value" }]],
    renderBlock: (g, block) => (
      <GraphBlock graph={g} block={block}>
        <div>{block.name}</div>
      </GraphBlock>
    ),
  });

  useEffect(() => {
    if (graph) {
      graph.setEntities({
        blocks: blocksData,
        connections: connectionsData,
      });
      graph.start();
    }
  }, [graph]);

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <GraphCanvas graph={graph} />
    </div>
  );
};
```

### Data Types

**Blocks must have required TBlock fields:**
```typescript
const blocksData: TBlock[] = [
  {
    is: "Block" as const,      // Required
    id: "block-1",              // Required
    name: "Block 1",            // Required
    selected: false,            // Required
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    anchors: [],                // Required
  },
];
```

**Connections must include source and target:**
```typescript
const connectionsData: TConnection[] = [
  {
    sourceBlockId: "block-1",   // Required
    targetBlockId: "block-2",   // Required
    id: "conn-1",
  },
];
```

### Best Practices

**Story Structure:**
- Keep data outside component for reusability
- Use `useEffect` for graph initialization
- Use `useCallback` for `renderBlock` to prevent re-renders
- Set explicit container dimensions

**Testing:**
- Test at different zoom levels (Canvas vs React rendering)
- Test with various DPR settings if possible
- Test edge cases (empty data, viewport boundaries)
- Test interactions (drag, select, zoom, pan)

**Example with controls:**
```typescript
export const Interactive = () => {
  const [blocks, setBlocks] = useState(initialBlocks);
  const { graph } = useGraph({
    renderBlock: useCallback(
      (g, block) => <GraphBlock graph={g} block={block} />,
      []
    ),
  });

  useEffect(() => {
    if (graph) {
      graph.setEntities({ blocks, connections });
      graph.start();
    }
  }, [graph, blocks]);

  return (
    <>
      <button onClick={() => setBlocks([...blocks, newBlock])}>
        Add Block
      </button>
      <div style={{ height: "600px" }}>
        <GraphCanvas graph={graph} />
      </div>
    </>
  );
};
```

## Performance Best Practices

### Event Handlers

**Rules:**
- Keep event handlers lightweight
- Debounce/throttle frequent events (resize, scroll, mousemove)
- Always cleanup on unmount

```typescript
import { debounce } from "lodash-es";

class MyLayer extends Layer {
  private handleMouseMoveDebounced = debounce(
    this.handleMouseMove.bind(this),
    16 // ~60fps
  );

  protected afterInit(): void {
    this.onCanvasEvent("mousemove", this.handleMouseMoveDebounced);
    super.afterInit();
  }

  private handleMouseMove(event: MouseEvent): void {
    // Heavy logic here
  }
}
```

### Memory Management

**Rules:**
- Always use AbortController for event listeners
- Unsubscribe from signals on unmount
- Clean up timers and intervals
- Dispose of resources properly

```typescript
class MyComponent {
  private timerId?: number;

  protected afterInit(): void {
    this.onGraphEvent("block:select", this.handleSelect);

    this.timerId = window.setInterval(() => {
      // Periodic task
    }, 1000);

    super.afterInit();
  }

  public unmount(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    super.unmount(); // Calls AbortController cleanup
  }
}
```

### Graph-Specific Optimizations

**Viewport Culling:**
- Only render visible elements
- Use `isVisible()` in components
- React components automatically culled by `ReactLayer`

**Batch Updates:**
```typescript
import { batch } from "@preact/signals-core";

batch(() => {
  graph.rootStore.blocksList.updateBlocks(blocks);
  graph.rootStore.connectionsList.updateConnections(connections);
  graph.rootStore.settings.updateSettings(settings);
});
```

**Connection Rendering:**
- Use `BatchPath2DRenderer` for multiple connections
- Prefer `update()` over `add()`/`delete()` logic

**Zoom Level Optimization:**
- Simplify rendering at low zoom (schematic view)
- Full detail only at high zoom (detailed view)
- Leverage automatic Canvas/React switching

## Naming Conventions

**Files:**
- Components: `ComponentName.tsx` or `ComponentName.ts`
- Utilities: `utilityName.ts`
- Tests: `ComponentName.test.ts`
- Styles: `ComponentName.css`

**Types and Interfaces:**
- Types: Start with `T` prefix: `TBlock`, `TConnection`, `TGraphConfig`
- Interfaces: Start with `I` prefix: `ICamera`, `ISelectionBucket`, `IService`

**Constants:**
- UPPER_SNAKE_CASE for true constants
- camelCase for configuration objects

**Functions:**
- camelCase for regular functions
- PascalCase for component factories/constructors
