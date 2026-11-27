# Event subscriptions

Subscribe by event name. A handler receives one event, and TypeScript infers its fields from the name.

```ts
const unsubscribe = graph.on("press", ({ target, point }) => {
  showInspector(target, point.world);
}, { inScale: ["schematic", "detailed"] });

block.on("pointerenter", ({ target, relatedTarget }) => {
  highlightTransition(relatedTarget, target);
});

unsubscribe();
```

- `graph.on(name, handler, options?)` observes graph events. Use `{ capture: true }` to observe input before a child handles it.
- `component.on(name, handler, options?)` observes scene input routed through that component and its local lifecycle notifications.
- In a layer, register `this.onGraphEvent(name, handler, options?)` in `afterInit()`. Detaching the layer releases its subscriptions and drag claims.
- In React, `useGraphEvent(graph, name, handler, options?)` observes the same event as `graph.on`. A `GraphCanvas` callback such as `onPress`, `onDoubleClick` or `onCameraChange` also receives that event. See [React hooks](../react/hooks.md).

`target` identifies the original scene component or graph. `currentTarget` identifies the recipient running the handler and returns to `null` after dispatch. Decision methods such as `preventDefault()` and `dragstart.claim()` work during synchronous delivery. If later work needs the current recipient, save it in the handler.

Use the returned unsubscribe function, `{ once: true }`, or an `AbortSignal` to manage a subscription. An `inScale` filter limits delivery to the specified scene levels. The [event model](./event-model.md) describes how the graph chooses the target and level for each input sequence.

## Event Types

### Scene lifecycle

`scene-state-change` delivers `{ state }` asynchronously when the scene starts, replaces its contents, switches
renderers or finishes its first draw. Read `graph.scene.state` for the current snapshot. See
[Scene readiness and loading overlays](./scene.md#scene-readiness-and-loading-overlays).

### Press

A primary or middle button press delivers one synchronous `press`. The graph resolves the hit once.
Graph capture listeners run first, followed by the hit component, its interactive ancestors and graph listeners.
On empty space the graph is the target. The camera and component drag can act after delivery.

```ts
block.on("press", ({ target, currentTarget, point }) => {
  // target stays the hit child; currentTarget is the block here.
  showCoordinates(point.world);
});

graph.on("press", ({ preventDefault }) => {
  if (editor.isEditing) preventDefault();
}, { inScale: ["schematic", "detailed"] });
```

`event` is the original PointerEvent. `pointers` contains the active sample. The same press reaches every recipient.
`preventDefault()` vetoes starting camera pan and drag for this press. `stopPropagation()` stops the remaining
route and leaves the default action eligible. Layers can subscribe with `this.onGraphEvent("press", handler)`.
Interactive DOM overlays can stop `pointerdown` before it reaches the graph.

### Drag

A pointer move that reaches `dragThreshold` CSS pixels from the press delivers one `dragstart`.
It follows the component path and scale level recorded at press time. `pressEvent` is the initiating PointerEvent with its button and modifiers, `start` holds the press coordinates, and `point` is the threshold-crossing position.

```ts
this.onGraphEvent("dragstart", (gesture) => {
  if (!canConnect(gesture.target, gesture.pressEvent)) return;
  gesture.claim({
    owner: "ConnectionTool",
    start: (_event, origin) => showPreview(origin),
    move: (_event, world) => movePreview(world),
    end: (_event, world) => dropConnection(world),
    cancel: () => clearPreview(),
  });
});
```

Components and applications can also subscribe with `component.on("dragstart", …)` or `graph.on("dragstart", …)`.
The graph collects claims synchronously. A sole owner starts after delivery, receives the crossing move
immediately, and finishes once when the initiating button is released. Callback positions are world coordinates. The third argument of `move(event, world, cause)` is `"pointer"` for a physical move or `"scene"` when autopan changes the world point under the same pointer sample.
If two owners claim the drag, the graph reports their names and suppresses the drag. With no claims,
the component or camera can perform its default action. Calling `preventDefault()` suppresses that default.
The function returned by `claim` withdraws the offer or cancels the running operation. Disposing the originating subscription also cancels its claim. A `once` listener can own the drag until it finishes or its disposer or signal cancels it. An unhandled Escape, a cancelled pointer, unexpected capture loss, source removal, layer detachment and graph stop also cancel it. An HTML control can call `preventDefault()` on its Escape keydown to keep the active graph drag.

### Release and activation

`release` carries the native releasing PointerEvent. `click` identifies a primary activation within `clickTolerance` CSS pixels on the same target. A recognised drag suppresses activation. By default, two activations on the same target within `doubleClickInterval` milliseconds and `doubleClickDistance` CSS pixels emit `dblclick` after the second `click`. The defaults are 3 CSS pixels, 350 ms and 12 CSS pixels respectively. Set `settings.clickPolicy` to `"exclusive"` to receive either a confirmed single `click` or one `dblclick` for a pair. [Activation and default selection](./event-model.md#activation)

Touch and pen holds emit `longpress` (500 ms by default). The default touch policy enables touch dragging and `pinch`. Set `settings.touchPolicy` to `"page"` to let the browser handle touch scrolling and zoom. A `pinch` reports `start`, `update`, `end` or `cancel`, both pointers, their midpoint and their distance in CSS pixels. See [Event model](./event-model.md#two-finger-navigation).

### Pointer hover

`pointerleave` and `pointerout` identify the old target. `pointerenter` and `pointerover` identify the new target. Read the scene `target`, the opposite `relatedTarget`, `pointerPressed` and `cause` directly from the event. `sourceEvent` is the native PointerEvent on a physical transition. Slow movement produces at most one passive hit test per graph frame. During rapid movement or at the minimalistic level, hover resumes after the pointer settles. A stationary pointer can receive a scene-caused transition after a camera or geometry change. Capture and bubbling of gestures, hover propagation, and HTML overlays are described in [Event model](./event-model.md).

### Block Events

#### Position Change Events

| Event | Description |
|-------|-------------|
| `block-change` | Fires on block position changes |
| `block-anchor-selection-change` | Fires on anchor selection |
| `blocks-selection-change` | Fires on block selection changes |

#### Drag Events

| Event | Description |
|-------|-------------|
| `block-drag-start` | Fires before a drag event starts |
| `block-drag` | Fires continuously during a drag event |
| `block-drag-end` | Fires when a drag event ends |

### Connection Events

| Event | Description |
|-------|-------------|
| `connection-selection-change` | Fires on connection selection changes |

### Camera Events

| Source | When it fires | Payload | Use for |
|--------|---------------|---------|---------|
| `camera-change` event | Before commit | Proposed camera fields, including `event.x`, `event.y` and `event.scale` | Interception, `preventDefault()`, logging intent |
| `graph.$camera` signal | After successful commit | Committed `TCameraState` | Rendering, transforms, derived state, React subscriptions |

```typescript
// Intercept before commit (same pattern as block-change)
graph.on("camera-change", ({ scale, preventDefault }) => {
  if (scale > editor.zoomLimit) preventDefault();
});

// React to applied state — safe even if another listener cancelled an earlier change
graph.$camera.subscribe((camera) => {
  applyCameraTransform(camera);
});
```

For a `camera-change` subscription, `inScale` uses the currently committed scene level. The proposed zoom is available as `event.scale`.

In `Layer` subclasses, override `onCameraChange()` for committed camera updates. The base `Layer` subscribes to `$camera` in `afterInit()`. Use `onGraphEvent("camera-change", …)` only to intercept or cancel a change before commit.

See [Camera Service — Choosing an API](./camera.md#choosing-an-api) for when to use `cameraService`, `$camera`, or `camera-change`.

## Plugin events

Augment the public payload map to add an event. Choose a unique name and data fields distinct from routing fields such as `type`, `target` and `currentTarget`.

```ts
import type { Graph } from "@gravity-ui/graph";

declare module "@gravity-ui/graph" {
  interface GraphEventsDefinitions {
    "inspector-open": { blockId: string };
  }
}

function installInspector(graph: Graph) {
  return graph.on("inspector-open", ({ blockId }) => openInspector(blockId));
}

graph.emit("inspector-open", { blockId: "transform" });
```

A plugin event emitted on the graph has the graph as its target. A plugin implementing a vetoable action can check the returned event's `defaultPrevented` before applying the change.
