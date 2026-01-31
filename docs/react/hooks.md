# React Hooks

This document describes all available React hooks for working with @gravity-ui/graph.

## Table of Contents

### Core Hooks
- [useGraph](#usegraph) - Creates and manages the graph instance
- [useLayer](#uselayer) - Adds and manages graph layers with automatic cleanup

### Event Hooks
- [useGraphEvent](#usegraphevent) - Subscribes to a single graph event with optional debouncing
- [useGraphEvents](#usegraphevents) - Subscribes to multiple graph events at once

### State Hooks
- [useBlockState](#useblockstate) - Gets and subscribes to block state changes
- [useBlockViewState](#useblockviewstate) - Gets the view component of a block
- [useBlockAnchorState](#useblockanchorstate) - Gets and subscribes to anchor state changes

### Signal Hooks
- [useSignal](#usesignal) - Subscribes to signal values for reactive updates
- [useComputedSignal](#usecomputedsignal) - Creates computed signals from other signals
- [useSignalEffect](#usesignaleffect) - Runs side effects when signal values change

### Scheduler Hooks
- [useSchedulerDebounce](#useschedulerdebounce) - Creates frame-synchronized debounced function
- [useSchedulerThrottle](#useschedulerthrottle) - Creates frame-synchronized throttled function
- [useScheduledTask](#usescheduledtask) - Schedules task for frame-based execution

### Scene Hooks
- [useSceneChange](#usescenechange) - Reacts to scene updates (camera changes, viewport updates)

### Usage Patterns
- [Combining Hooks](#combining-hooks) - Examples of using multiple hooks together
- [Performance Optimization](#performance-optimization-with-debounced-events) - Debouncing frequent events

## Import

```typescript
import { 
  useGraph,
  useGraphEvent,
  useGraphEvents,
  useLayer,
  useBlockState,
  useBlockViewState,
  useBlockAnchorState,
  useSignal,
  useComputedSignal,
  useSignalEffect,
  useSchedulerDebounce,
  useSchedulerThrottle,
  useScheduledTask,
  useSceneChange,
} from "@gravity-ui/graph/react";
```

## Core Hooks

### useGraph

The main hook for creating and managing a Graph instance.

```typescript
import { useGraph, type HookGraphParams } from "@gravity-ui/graph/react";
import type { Graph, TBlock, TConnection } from "@gravity-ui/graph";

const config: HookGraphParams = {
  name: "my-graph",
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
  },
  viewConfiguration: {
    colors: {
      block: {
        background: "rgba(37, 27, 37, 1)",
      },
    },
  },
};

function MyGraph(): JSX.Element {
  const { 
    graph,           // Graph - graph instance
    api,             // PublicGraphApi - public API for graph manipulation
    setSettings,     // (settings: TGraphSettingsConfig) => void
    setViewConfiguration, // (config: HookGraphParams["viewConfiguration"]) => void
    setEntities,     // <B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => void
    updateEntities,  // <B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => void
    addLayer,        // <T extends Constructor<Layer>>(layerCtor: T, props: LayerPublicProps<T>) => InstanceType<T>
    zoomTo,          // (target: TGraphZoomTarget, config?: ZoomConfig) => void
    start,           // () => void
    stop,            // () => void
  } = useGraph(config);

  React.useEffect(() => {
    setEntities({
      blocks: [...],
      connections: [...],
    });
    start();
  }, []);

  return <GraphCanvas graph={graph} />;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph` | Optional existing Graph instance to use |
| `name` | `string` | Configuration name for the graph |
| `settings` | `TGraphSettingsConfig` | Graph behavior settings |
| `viewConfiguration` | `{ colors?: RecursivePartial<TGraphColors>; constants?: RecursivePartial<TGraphConstants> }` | Visual configuration |
| `layers` | `LayerConfig[]` | Initial layers to add to the graph |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `graph` | `Graph` | The Graph instance |
| `api` | `PublicGraphApi` | Public API for graph manipulation |
| `setSettings` | `(settings: TGraphSettingsConfig) => void` | Update graph settings |
| `setViewConfiguration` | `(config: HookGraphParams["viewConfiguration"]) => void` | Update view configuration |
| `setEntities` | `<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => void` | Replace all entities |
| `updateEntities` | `<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => void` | Merge with existing entities |
| `addLayer` | `<T extends Constructor<Layer>>(layerCtor: T, props: LayerPublicProps<T>) => InstanceType<T>` | Add a new layer |
| `zoomTo` | `(target: TGraphZoomTarget, config?: ZoomConfig) => void` | Zoom to target |
| `start` | `() => void` | Start the graph |
| `stop` | `() => void` | Stop the graph |

### useLayer

Hook for managing graph layers. Automatically handles layer initialization, props updates, and cleanup.

```typescript
import { useLayer } from "@gravity-ui/graph/react";
import { DevToolsLayer, type DevToolsLayerProps } from "@gravity-ui/graph/plugins";
import type { Graph } from "@gravity-ui/graph";

function MyGraph(): JSX.Element {
  const { graph } = useGraph({});
  
  // Layer is automatically added and cleaned up
  // Returns: DevToolsLayer | null
  const devToolsLayer: DevToolsLayer | null = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize: 20,
  });

  // Props updates are handled automatically
  const [rulerSize, setRulerSize] = useState<number>(20);
  
  const devToolsLayerWithState: DevToolsLayer | null = useLayer(graph, DevToolsLayer, {
    showRuler: true,
    rulerSize, // When this changes, layer will be updated
  });

  return <GraphCanvas graph={graph} />;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph \| null` | Graph instance |
| `layerCtor` | `T extends Constructor<Layer>` | Layer class constructor |
| `props` | `LayerPublicProps<T>` | Layer properties (excluding internal props like root, camera, graph, emitter) |

#### Returns

Returns `InstanceType<T> | null` - the layer instance or `null` if graph is not initialized.

## Event Hooks

### useGraphEvent

Hook for subscribing to a single graph event with optional debouncing.

```typescript
import { useGraphEvent } from "@gravity-ui/graph/react";
import type { Graph, ESchedulerPriority } from "@gravity-ui/graph";
import type { UnwrapGraphEventsDetail, UnwrapGraphEvents } from "@gravity-ui/graph";

interface Props {
  graph: Graph;
}

function MyComponent({ graph }: Props): JSX.Element | null {
  // Basic usage - callback receives (detail, event)
  useGraphEvent(
    graph, 
    "block-change", 
    (detail: UnwrapGraphEventsDetail<"block-change">, event: UnwrapGraphEvents<"block-change">) => {
      console.log("Block changed:", detail.block);
    }
  );

  // With debounce options
  useGraphEvent(
    graph, 
    "camera-change", 
    (detail: UnwrapGraphEventsDetail<"camera-change">) => {
      console.log("Camera:", detail.camera);
    },
    {
      priority: ESchedulerPriority.MEDIUM,
      frameInterval: 2,  // Wait 2 frames
      frameTimeout: 100, // Wait at least 100ms
    }
  );

  // Prevent default behavior
  useGraphEvent(
    graph, 
    "connection-created", 
    (detail: UnwrapGraphEventsDetail<"connection-created">, event: UnwrapGraphEvents<"connection-created">) => {
      event.preventDefault();
      // Custom connection logic
    }
  );

  return null;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph \| null` | Graph instance |
| `event` | `Event extends keyof GraphEventsDefinitions` | Event name to subscribe to |
| `callback` | `(data: UnwrapGraphEventsDetail<Event>, event: UnwrapGraphEvents<Event>) => void` | Event handler |
| `debounceParams` | `{ priority?: ESchedulerPriority; frameInterval?: number; frameTimeout?: number }` | Optional debounce configuration |

#### Debounce Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `priority` | `ESchedulerPriority` | `MEDIUM` | Scheduler priority |
| `frameInterval` | `number` | `1` | Frames to wait before execution |
| `frameTimeout` | `number` | `0` | Minimum time in ms to wait |

### useGraphEvents

Hook for subscribing to multiple graph events at once using callback props style.

```typescript
import { useGraphEvents } from "@gravity-ui/graph/react";
import type { Graph } from "@gravity-ui/graph";
import type { TGraphEventCallbacks } from "@gravity-ui/graph/react";

interface Props {
  graph: Graph;
}

function MyComponent({ graph }: Props): JSX.Element | null {
  const eventHandlers: Partial<TGraphEventCallbacks> = {
    onBlockChange: ({ block }) => {
      console.log("Block changed:", block);
    },
    onConnectionCreated: (detail, event) => {
      console.log("Connection created:", detail);
    },
    onBlocksSelectionChange: ({ changes }) => {
      console.log("Selection added:", changes.add);
      console.log("Selection removed:", changes.removed);
    },
  };

  useGraphEvents(graph, eventHandlers);

  return null;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph \| null` | Graph instance |
| `events` | `Partial<TGraphEventCallbacks>` | Object with event callbacks |

## State Hooks

### useBlockState

Hook to get and subscribe to block state changes.

```typescript
import { useBlockState } from "@gravity-ui/graph/react";
import type { Graph, TBlock, TBlockId } from "@gravity-ui/graph";
import type { BlockState } from "@gravity-ui/graph";

interface Props {
  graph: Graph;
  blockId: TBlockId;
}

function BlockInfo({ graph, blockId }: Props): JSX.Element | null {
  // Can pass block object or just the ID
  // Returns: BlockState | undefined
  const blockState: BlockState | undefined = useBlockState(graph, blockId);

  if (!blockState) return null;

  const geometry = blockState.$geometry.value;

  return (
    <div>
      <p>Position: {geometry.x}, {geometry.y}</p>
      <p>Size: {geometry.width} x {geometry.height}</p>
      <p>Selected: {blockState.selected ? "Yes" : "No"}</p>
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph` | Graph instance |
| `block` | `TBlock \| TBlockId` | Block object or block ID |

#### Returns

Returns `BlockState | undefined` - the block state object that updates reactively.

### useBlockViewState

Hook to get the view component of a block. Useful for accessing rendering-specific state.

```typescript
import { useBlockViewState } from "@gravity-ui/graph/react";
import type { Graph, TBlockId } from "@gravity-ui/graph";
import type { Block } from "@gravity-ui/graph";

interface Props {
  graph: Graph;
  blockId: TBlockId;
}

function BlockView({ graph, blockId }: Props): JSX.Element | null {
  // Returns: Block | undefined (the view component)
  const viewComponent: Block | undefined = useBlockViewState(graph, blockId);

  if (!viewComponent) return null;

  // Access view-specific methods
  const anchors = viewComponent.getAnchors();
  
  return <div>Block has {anchors.length} anchors</div>;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph` | Graph instance |
| `block` | `TBlock \| TBlockId` | Block object or block ID |

#### Returns

Returns the block's view component (`Block`) or `undefined`.

### useBlockAnchorState

Hook to get and subscribe to anchor state changes.

```typescript
import { useBlockAnchorState } from "@gravity-ui/graph/react";
import type { Graph } from "@gravity-ui/graph";
import type { TAnchor, AnchorState } from "@gravity-ui/graph";

interface Props {
  graph: Graph;
  anchor: TAnchor;
}

function AnchorInfo({ graph, anchor }: Props): JSX.Element | null {
  // Returns: AnchorState | undefined
  const anchorState: AnchorState | undefined = useBlockAnchorState(graph, anchor);

  if (!anchorState) return null;

  return (
    <div className={anchorState.selected ? "selected" : ""}>
      Anchor: {anchor.id}
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph` | Graph instance |
| `anchor` | `TAnchor` | Anchor object (must include `blockId`) |

#### Returns

Returns `AnchorState | undefined` - the anchor state object.

## Signal Hooks

These hooks provide integration with @preact/signals-core for reactive state management.

### useSignal

Hook to subscribe to a signal and get the current value. Re-renders component when signal value changes.

```typescript
import { useSignal } from "@gravity-ui/graph/react";
import type { Signal } from "@preact/signals-core";
import type { BlockState, TBlockGeometry } from "@gravity-ui/graph";

interface Props {
  blockState: BlockState;
}

function BlockGeometry({ blockState }: Props): JSX.Element {
  // blockState.$geometry is Signal<TBlockGeometry>
  // useSignal returns: TBlockGeometry
  const geometry: TBlockGeometry = useSignal(blockState.$geometry);

  return (
    <div>
      Position: ({geometry.x}, {geometry.y})
      Size: {geometry.width} x {geometry.height}
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `signal` | `Signal<T>` | Signal to subscribe to |

#### Returns

Returns `T` - the current value of the signal.

### useComputedSignal

Hook to create and subscribe to a computed signal. Useful for derived state.

```typescript
import { useComputedSignal } from "@gravity-ui/graph/react";
import type { DependencyList } from "react";
import type { BlockState } from "@gravity-ui/graph";

interface Point {
  x: number;
  y: number;
}

interface Props {
  blockState: BlockState;
}

function BlockCenter({ blockState }: Props): JSX.Element {
  // Compute center position from geometry
  // Returns: Point (the computed value)
  const center: Point = useComputedSignal(
    (): Point => {
      const geo = blockState.$geometry.value;
      return {
        x: geo.x + geo.width / 2,
        y: geo.y + geo.height / 2,
      };
    }, 
    [blockState] as DependencyList
  );

  return <div>Center: ({center.x}, {center.y})</div>;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `compute` | `() => T` | Computation function that reads signals |
| `deps` | `DependencyList` | Dependencies array (like useEffect) |

#### Returns

Returns `T` - the computed value, updated when dependent signals change.

### useSignalEffect

Hook to run side effects when signal values change. Similar to useEffect but for signals.

```typescript
import { useSignalEffect } from "@gravity-ui/graph/react";
import type { DependencyList } from "react";
import type { BlockState } from "@gravity-ui/graph";

interface Props {
  blockState: BlockState;
}

function BlockLogger({ blockState }: Props): null {
  useSignalEffect(
    (): void => {
      // This runs whenever block geometry changes
      console.log("Block moved to:", blockState.$geometry.value);
    }, 
    [blockState] as DependencyList
  );

  return null;
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `effectFn` | `() => void` | Effect function that reads signals |
| `deps` | `DependencyList` | Dependencies array (like useEffect) |

## Scheduler Hooks

These hooks integrate with the graph's internal scheduler for frame-based timing control. They are designed primarily for **synchronizing UI updates with graph component changes** on a per-frame basis.

> **See also:** [Scheduler System Documentation](../system/scheduler-system.md) - Detailed information about the scheduler architecture, priority levels, and task queue management.

### When to Use Scheduler Hooks

**Use scheduler hooks when:**
- You need to react to frequent graph events (block dragging, camera movement)
- You want to prepare state for the next render frame
- You need precise frame-based timing synchronized with graph rendering

**Use regular debounce/throttle when:**
- You need simple debouncing for user input (search, form validation)
- The operation is not related to graph rendering
- You don't need frame-level synchronization

### Priority Levels

Scheduler hooks support priority levels to control execution order within each frame:

```typescript
enum ESchedulerPriority {
  HIGHEST = 0,  // Critical updates, executed first
  HIGH = 1,     // Important updates
  MEDIUM = 2,   // Default priority
  LOW = 3,      // Less critical updates
  LOWEST = 4,   // Background tasks, executed last
}
```

Lower numeric values execute first in each frame. See [Priority Levels](../system/scheduler-system.md#priority-levels) and [Task Queue](../system/scheduler-system.md#task-queue-in-frame) for more details.

### Why Not Just setTimeout?

When reacting to frequent events like block movement, a naive `setTimeout`-based debounce creates many `setTimeout`/`clearTimeout` operations per second. This overhead reduces FPS and creates timing inconsistencies with graph rendering.

Scheduler hooks solve this by:
1. Integrating with the graph's render loop
2. Batching operations to specific frames
3. Respecting priority levels to avoid blocking critical updates

```typescript
// ❌ Bad: Many setTimeout/clearTimeout calls during drag
const naiveDebounce = useMemo(() => {
  let timeoutId: number;
  return (fn: () => void) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(fn, 16); // ~60fps
  };
}, []);

// ✅ Good: Synchronized with graph render frames
const scheduledUpdate = useSchedulerDebounce(
  () => updateSidebar(),
  { frameInterval: 1 }
);
```

> **Note:** Scheduler hooks use the graph's internal scheduler resources. For operations unrelated to graph rendering, prefer standard debounce utilities to avoid consuming graph performance budget.

### useSchedulerDebounce

Hook to create a debounced function that delays execution until both frame and time conditions are met.

The function will only execute when BOTH conditions are satisfied:
- At least `frameInterval` frames have passed since the last invocation
- At least `frameTimeout` milliseconds have passed since the last invocation

```typescript
import { useSchedulerDebounce, useGraphEvent } from "@gravity-ui/graph/react";
import type { ESchedulerPriority, Graph, TBlock } from "@gravity-ui/graph";

interface DebouncedFn<T extends (...args: unknown[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

// Example: Update sidebar info when block is being dragged
function BlockInfoSidebar({ graph }: { graph: Graph }): JSX.Element {
  const [blockPosition, setBlockPosition] = useState<{ x: number; y: number } | null>(null);

  // Debounced update synchronized with graph frames
  // This avoids creating hundreds of setTimeout calls during drag
  const updatePosition: DebouncedFn<(x: number, y: number) => void> = useSchedulerDebounce(
    (x: number, y: number): void => {
      setBlockPosition({ x, y });
    },
    {
      priority: ESchedulerPriority.LOW,  // Lower priority than graph rendering
      frameInterval: 1,  // Update at most once per frame
      frameTimeout: 0,   // No additional time delay
    }
  );

  // React to block changes during drag
  useGraphEvent(graph, "block-change", ({ block }) => {
    updatePosition(block.x, block.y);
  });

  // Cleanup is handled automatically on unmount
  // Or cancel manually: updatePosition.cancel();

  return (
    <div className="sidebar">
      {blockPosition && (
        <p>Position: ({blockPosition.x}, {blockPosition.y})</p>
      )}
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `T extends (...args: unknown[]) => void` | Function to debounce |
| `options` | `TDebounceOptions` | Configuration options |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `priority` | `ESchedulerPriority` | `MEDIUM` | Scheduler priority |
| `frameInterval` | `number` | `1` | Frames to wait before execution |
| `frameTimeout` | `number` | `0` | Minimum time in ms to wait |

#### Returns

Returns a debounced function with `cancel()` method to abort pending executions.

### useSchedulerThrottle

Hook to create a throttled function that limits execution frequency.

Unlike debounce, throttle executes immediately on the first call and then enforces the delay for subsequent calls.

```typescript
import { useSchedulerThrottle, useGraphEvent } from "@gravity-ui/graph/react";
import type { ESchedulerPriority, Graph, TCameraState } from "@gravity-ui/graph";

interface ThrottledFn<T extends (...args: unknown[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

// Example: Update minimap during camera pan/zoom
function MinimapOverlay({ graph }: { graph: Graph }): JSX.Element {
  const [viewport, setViewport] = useState<TCameraState | null>(null);

  // Throttle camera updates - executes immediately on first call,
  // then waits for frame interval before next execution
  const throttledCameraUpdate: ThrottledFn<(camera: TCameraState) => void> = useSchedulerThrottle(
    (camera: TCameraState): void => {
      setViewport(camera);
    },
    {
      priority: ESchedulerPriority.LOW,
      frameInterval: 2,   // Update at most every 2 frames
      frameTimeout: 32,   // At most once per ~32ms
    }
  );

  // Camera events fire very frequently during pan/zoom
  useGraphEvent(graph, "camera-change", ({ camera }) => {
    throttledCameraUpdate(camera);
  });

  return (
    <div className="minimap">
      {viewport && (
        <div 
          className="viewport-indicator"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        />
      )}
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `T extends (...args: unknown[]) => void` | Function to throttle |
| `options` | `TDebounceOptions` | Configuration options |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `priority` | `ESchedulerPriority` | `MEDIUM` | Scheduler priority |
| `frameInterval` | `number` | `1` | Frames to wait between executions |
| `frameTimeout` | `number` | `0` | Minimum time in ms between executions |

#### Returns

Returns a throttled function with `cancel()` method to abort pending executions.

### useScheduledTask

Hook to schedule a task for execution after a certain number of frames have passed.

The scheduled task will execute once the specified frame interval has elapsed. The task is automatically cancelled when the component unmounts.

```typescript
import { useScheduledTask, useBlockState, useSignal } from "@gravity-ui/graph/react";
import type { ESchedulerPriority, Graph, TBlockId } from "@gravity-ui/graph";

// Example: Prepare derived state for the next render frame
function BlockMetrics({ graph, blockId }: { graph: Graph; blockId: TBlockId }): JSX.Element {
  const blockState = useBlockState(graph, blockId);
  const geometry = blockState ? useSignal(blockState.$geometry) : null;
  
  const [metrics, setMetrics] = useState<{ area: number; center: { x: number; y: number } } | null>(null);

  // Schedule metrics calculation for next frame
  // This ensures we don't calculate during the render phase
  useScheduledTask(
    (): void => {
      if (geometry) {
        setMetrics({
          area: geometry.width * geometry.height,
          center: {
            x: geometry.x + geometry.width / 2,
            y: geometry.y + geometry.height / 2,
          },
        });
      }
    },
    {
      priority: ESchedulerPriority.LOW,  // Run after graph updates
      frameInterval: 1,  // Execute on next frame
    }
  );

  return (
    <div className="block-metrics">
      {metrics && (
        <>
          <p>Area: {metrics.area}px²</p>
          <p>Center: ({metrics.center.x}, {metrics.center.y})</p>
        </>
      )}
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `T extends (...args: unknown[]) => void` | Function to schedule |
| `options` | `Omit<TScheduleOptions, "once">` | Configuration options |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `priority` | `ESchedulerPriority` | `MEDIUM` | Scheduler priority |
| `frameInterval` | `number` | `1` | Frames to wait before execution |

## Scene Hooks

### useSceneChange

Hook to react to scene updates. The scene is considered updated when the camera changes or when components change their position in the viewport.

This hook is useful for updating UI elements that depend on the visible area of the graph, such as:
- Minimaps showing the current viewport
- Visible block counters
- Custom overlays that need to update when the view changes

The hook automatically:
- Subscribes to camera changes
- Subscribes to hitTest updates (when blocks enter/leave viewport)
- Handles initial state on mount
- Cleans up subscriptions on unmount

```typescript
import { useSceneChange } from "@gravity-ui/graph/react";
import type { Graph, TRect } from "@gravity-ui/graph";

// Example: Update usable rect indicator when scene changes
interface Props {
  graph: Graph;
}

function UsableRectOverlay({ graph }: Props): JSX.Element {
  const [usableRect, setUsableRect] = useState<TRect | null>(null);

  // React to scene changes with frame-synchronized updates
  useSceneChange(graph, (): void => {
    // Get current usable rect (bounding box of all graph elements)
    const rect = graph.hitTest.getUsableRect();
    setUsableRect(rect);
  });

  if (!usableRect) return null;

  return (
    <div className="usable-rect-info">
      <p>Graph bounds:</p>
      <p>X: {usableRect.x.toFixed(0)}, Y: {usableRect.y.toFixed(0)}</p>
      <p>Size: {usableRect.width.toFixed(0)} × {usableRect.height.toFixed(0)}</p>
    </div>
  );
}

// Example: Update minimap when viewport changes
function GraphMinimap({ graph }: Props): JSX.Element {
  const [cameraState, setCameraState] = useState(graph.camera.getCameraState());

  useSceneChange(graph, (): void => {
    // Get current camera state
    const state = graph.camera.getCameraState();
    setCameraState(state);
  });

  return (
    <div className="minimap">
      <div className="minimap-viewport">
        <p>Scale: {(cameraState.scale * 100).toFixed(0)}%</p>
        <p>Position: ({cameraState.x.toFixed(0)}, {cameraState.y.toFixed(0)})</p>
      </div>
    </div>
  );
}

// Example: Track visible viewport rectangle
function ViewportIndicator({ graph }: Props): JSX.Element {
  const [viewport, setViewport] = useState(graph.camera.getVisibleCameraRect());

  useSceneChange(graph, (): void => {
    // Get visible camera rect (respects viewport insets)
    const rect = graph.camera.getVisibleCameraRect();
    setViewport(rect);
  });

  return (
    <div className="viewport-info">
      <p>Visible area:</p>
      <p>{viewport.width.toFixed(0)} × {viewport.height.toFixed(0)}</p>
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `graph` | `Graph` | Graph instance |
| `fn` | `() => void` | Function to call when scene updates |

#### Internal Behavior

The hook uses `useSchedulerDebounce` with `HIGHEST` priority and `frameInterval: 1` to ensure scene updates are processed efficiently:

```typescript
const handleCameraChange = useSchedulerDebounce(fn, {
  priority: ESchedulerPriority.HIGHEST,
  frameInterval: 1,
});
```

This means:
- Updates are synchronized with the graph's render loop
- Multiple scene changes within a frame are batched into one update
- The callback executes at most once per frame
- High priority ensures scene updates happen before other scheduled tasks

#### Events Handled

The hook subscribes to:

1. **`camera-change` event** - Fires when camera position, scale, or rotation changes
2. **HitTest `update` event** - Fires when blocks enter or leave the viewport
3. **Initial mount** - Calls the function immediately on component mount

#### Use Cases

**✅ Good use cases:**
- Updating minimaps or viewport indicators
- Counting visible blocks
- Updating overlays based on viewport
- Recalculating layout-dependent UI elements

**❌ Not recommended for:**
- Updating individual block styles (use `useBlockState` instead)
- Heavy computations on every frame (consider additional debouncing)
- Operations that don't depend on viewport changes

## Usage Patterns

### Combining Hooks

```typescript
import { 
  useGraph, 
  useGraphEvent, 
  useBlockState, 
  useSignal,
  GraphCanvas,
} from "@gravity-ui/graph/react";
import type { TBlockId, TBlockGeometry, BlockState } from "@gravity-ui/graph";

function MyGraph(): JSX.Element {
  const { graph, setEntities, start } = useGraph({
    settings: { canDragBlocks: true },
  });

  // Track selected block
  const [selectedBlockId, setSelectedBlockId] = useState<TBlockId | null>(null);
  
  useGraphEvent(graph, "blocks-selection-change", ({ changes }) => {
    if (changes.add.length > 0) {
      setSelectedBlockId(changes.add[0]);
    }
  });

  // Get selected block state
  const selectedBlock = useBlockState(graph, selectedBlockId);
  
  // Subscribe to geometry changes (conditional hook usage - be careful!)
  const geometry: TBlockGeometry | null = useSignal(selectedBlock.$geometry) 

  return (
    <div>
      <GraphCanvas graph={graph} />
      {geometry && (
        <div className="info-panel">
          Selected: {selectedBlockId}
          Position: ({geometry.x}, {geometry.y})
        </div>
      )}
    </div>
  );
}
```

### Performance Optimization with Debounced Events

```typescript
import { useGraphEvent } from "@gravity-ui/graph/react";
import { ESchedulerPriority } from "@gravity-ui/graph";
import type { Graph, TCameraState } from "@gravity-ui/graph";

interface Props {
  graph: Graph;
}

function CameraInfo({ graph }: Props): JSX.Element | null {
  const [cameraState, setCameraState] = useState<TCameraState | null>(null);

  // Debounce camera updates for performance
  useGraphEvent(
    graph,
    "camera-change",
    ({ camera }: { camera: TCameraState }): void => {
      setCameraState(camera);
    },
    {
      priority: ESchedulerPriority.LOW,
      frameInterval: 2,
      frameTimeout: 50,
    }
  );

  if (!cameraState) return null;

  return (
    <div>
      Zoom: {cameraState.scale.toFixed(2)}
      Pan: ({cameraState.x.toFixed(0)}, {cameraState.y.toFixed(0)})
    </div>
  );
}
```
