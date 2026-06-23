# Camera Service

This document describes the camera model in @gravity-ui/graph: how it transforms coordinates, how pan/zoom work, which API is available, and when to use optional viewport insets.

## Core ideas

- Camera defines a transform from world (graph) space to screen (canvas) space.
- Camera state consists of screen-space translation `(x, y)`, `scale`, and canvas dimensions `(width, height)`.
- Derived camera-space viewport (`relativeX/Y/Width/Height`) is computed from the full canvas size and is used in hit-testing, visibility checks, and canvas rendering.

## State

```ts
export type TCameraState = {
  x: number;              // screen-space camera X (translation)
  y: number;              // screen-space camera Y (translation)
  width: number;          // canvas width in CSS pixels
  height: number;         // canvas height in CSS pixels
  scale: number;          // zoom scale
  scaleMin: number;
  scaleMax: number;
  // Camera-space viewport derived from full canvas (ignores insets)
  relativeX: number;
  relativeY: number;
  relativeWidth: number;
  relativeHeight: number;
  // Optional UI focus area (screen-space paddings inside canvas)
  viewportInsets: { left: number; right: number; top: number; bottom: number };
  // Auto-panning mode enabled state
  autoPanningEnabled: boolean;
};
```

## Coordinate conversions

- `getRelative(n)` / `getRelativeXY(x, y)` – screen → camera space.
- `getAbsolute(n)` / `getAbsoluteXY(x, y)` – camera → screen space.
- `applyToPoint(x, y)` / `applyToRect(x, y, w, h)` – fast helpers to apply camera transform.

## Camera control

- `set(newState)` – update camera state (emits `camera-change`).
- `resize({ width, height })` – update canvas size preserving center.
- `move(dx, dy)` – pan.
- `zoom(x, y, scale)` – zoom anchored to a screen-space point `(x, y)`.
- `getCameraRect()` – screen-space camera rect.
- `getCameraScale()` – scale value.
- `getCameraBlockScaleLevel(scale?)` – qualitative zoom tiers for switching rendering modes. The mapping is configurable via settings `getCameraBlockScaleLevel(graph, scale)` (default: `defaultGetCameraBlockScaleLevel` using `graphConstants.block.SCALES`).

### Custom block scale level resolver

`getCameraBlockScaleLevel(graph, scale)` is useful when zoom tiers should depend on product logic, not only on zoom thresholds.

Example: force `Detailed` mode for very small graphs (where schematic/minimalistic rendering has little value), and keep the default behavior otherwise.

```ts
import {
  defaultGetCameraBlockScaleLevel,
  ECameraScaleLevel,
} from "@gravity-ui/graph";

const blocks = tinyGraphData.blocks;
const isTinyGraph = blocks.length <= 20;

const graph = new Graph(
  {
    blocks,
    connections: tinyGraphData.connections,
    settings: {
      getCameraBlockScaleLevel: (graph, scale) => {
        if (isTinyGraph) {
          return ECameraScaleLevel.Detailed;
        }
        return defaultGetCameraBlockScaleLevel(graph, scale);
      },
    },
  },
  rootEl,
);
```

### Mouse wheel behavior

Mouse wheel interactions can be configured to either zoom the graph or scroll it.

**Configuration:**
```ts
const graph = new Graph(canvas, {
  constants: {
    camera: {
      MOUSE_WHEEL_BEHAVIOR: "zoom" // "zoom" | "scroll" (default: "zoom")
    }
  }
});
```

**Behavior modes:**
- `"zoom"` (default) – Mouse wheel zooms the graph in/out at the cursor position.
- `"scroll"` – Mouse wheel scrolls the graph vertically by default, or horizontally when Shift key is pressed.

**Scroll direction:**
- Default: Vertical scrolling (up/down along Y axis)
- With Shift: Horizontal scrolling (left/right along X axis)

**Important notes:**
- `MOUSE_WHEEL_BEHAVIOR` affects **mouse wheel** classification in `resolveWheelIntent` (I4 rules). It does **not** change integer trackpad scroll, which always resolves to pan.
- Scroll direction switching with Shift is an environment-dependent behavior according to [W3C UI Events specification](https://w3c.github.io/uievents/#events-wheelevents).
- Different browsers and operating systems may handle Shift+wheel differently.
- **Trackpad** gestures also pass through `resolveWheelIntent` (see [Wheel Intent Resolution](./wheel-intent.md)):
  - Two-finger swipe (integer PIXEL deltas) → pan
  - Pinch-to-zoom (Ctrl/Cmd + scroll) → zoom with `PINCH_ZOOM_SPEED`
  - Horizontal / diagonal two-finger swipe → pan (I2)
- Settings can be updated at runtime using `graph.setConstants()`.

### Custom wheel intent classification

The camera routes wheel input by **intent** (pan vs zoom). Classification is configured on **graph settings** (`resolveWheelIntent`). By default it uses `createWheelIntentResolver()`, which reads gesture shape directly. Replace with your own resolver if needed:

```ts
import { EWheelIntent, createWheelIntentResolver } from "@gravity-ui/graph";

graph.updateSettings({
  resolveWheelIntent: (event, mouseWheelBehavior) => {
    // Example: always zoom on vertical wheel
    return EWheelIntent.Zoom;
    // Or use the built-in resolver:
    // return createWheelIntentResolver()(event, mouseWheelBehavior);
  },
});
```

See [Wheel Intent Resolution](./wheel-intent.md) for the I1–I5 heuristics.

**Example (MOUSE_WHEEL_BEHAVIOR):**
```ts
// Configure mouse wheel to scroll instead of zooming
graph.setConstants({
  camera: {
    MOUSE_WHEEL_BEHAVIOR: "scroll"
  }
});

// Switch back to zoom mode
graph.setConstants({
  camera: {
    MOUSE_WHEEL_BEHAVIOR: "zoom"
  }
});
```

### Auto-panning

Auto-panning automatically moves the camera when the cursor is near viewport edges during drag operations. This feature is built into the camera system and activates automatically for block dragging, area selection, connection creation, and block duplication.

- `enableAutoPanning()` – enable auto-panning mode.
- `disableAutoPanning()` – disable auto-panning mode.
- `isAutoPanningEnabled()` – check if auto-panning is currently enabled.

**How it works:**
- When enabled, the camera monitors mouse position relative to viewport edges (respecting `viewportInsets`).
- If the cursor is within the threshold distance from any edge, the camera pans in the corresponding direction.

**Configuration:**
Auto-panning behavior can be customized via configuration:
```ts
const graph = new Graph(canvas, {
  constants: {
    camera: {
      AUTO_PAN_THRESHOLD: 50,  // pixels from edge to activate (default: 50)
      AUTO_PAN_SPEED: 10,      // base pixels per frame (default: 10)
    }
  }
});
```

**Example:**
```ts
// Enable auto-panning (typically called at drag start)
graph.cameraService.enableAutoPanning();

// ... user drags something near the edge, camera auto-pans ...

// Disable auto-panning (typically called at drag end)
graph.cameraService.disableAutoPanning();
```

## Viewports and fitting

- `getRelativeViewportRect(options?)`
  - Default: returns full camera-space viewport (ignores insets).
  - `{ respectInsets: true }`: returns camera-space viewport bounded by insets (visible area).
- `getVisibleCameraRect()` – screen-space visible rect that respects insets.
- `getScaleRelativeDimensions(width, height, { respectInsets })` – compute scale to fit a target rect.
- `getXYRelativeCenterDimensions(rect, scale, { respectInsets })` – compute camera `(x, y)` so the target rect is centered at given scale.

## Rendering, hit-testing, and HTML view

- Canvas rendering and hit-testing use the full camera-space viewport (`relative*`) for correctness and performance.
- HTML/React view switches at defined zoom tiers (`getCameraBlockScaleLevel`), which depend on `scale` independent of insets.

## Events

- `camera-change` – emitted on any camera state update (`set`, `move`, `resize`, `zoom`, etc.).

## Viewport insets (optional focus)

`viewportInsets` let the UI define a static focus frame inside the canvas (e.g., when a side panel overlays part of the canvas). Insets live in screen space and do not change the core camera geometry. Use them to modify user-visible centering/fitting only.

- Update: `setViewportInsets({ left, right, top, bottom }, { maintain?: "center" })`.
  - When `maintain: "center"` is passed, the same world point remains under the visible center after insets change.
  - If the second argument is omitted, the camera position is not adjusted to preserve the center.
- Read: `getViewportInsets()`.
- Fitting/centering with focus: pass `{ respectInsets: true }` to `getScaleRelativeDimensions` and `getXYRelativeCenterDimensions` (used by `zoomToRect`, `zoomToViewPort`).
- Ignored by low-level systems: background rendering and hit-test continue to use full viewport.

### Examples

```ts
// Side drawer overlays 300px on the left
camera.setViewportInsets({ left: 300 });
graph.api.zoomToViewPort({ padding: 24 }); // fits into visible area

// Remove focus
camera.setViewportInsets({ left: 0, right: 0, top: 0, bottom: 0 });

// Resize focus frame while keeping the visible center anchored to the same world point
camera.setViewportInsets({ left: 200, right: 100 }, { maintain: "center" });
```

For an interactive demo, see `stories/examples/viewportInsets/viewportInsets.stories.tsx`.
