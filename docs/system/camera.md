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
- `getCameraBlockScaleLevel(scale?)` – qualitative zoom tiers for switching rendering modes.

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
