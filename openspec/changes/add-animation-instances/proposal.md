## Why

The current zoom transition uses a local `requestAnimationFrame` helper (`startAnimation`) with no animation instance lifecycle. This makes it hard to stop or replace a running animation when a new `zoomTo` starts or when user camera input should immediately take control.

## What Changes

- Introduce a public, scheduler-driven animation API that returns a controllable animation instance.
- Add built-in easing strategies (for example, linear, ease-in, ease-out, ease-in-out) and allow custom easing functions.
- Refactor camera zoom transitions (`zoomTo*`) to use animation instances instead of direct `requestAnimationFrame`.
- Ensure active zoom animation can be cancelled on demand and replaced by a new zoom transition.

## Capabilities

### New Capabilities
- `animation-instances`: Scheduler-based animation instances with start/stop control, easing support, and conflict-safe usage in camera zoom flows.

### Modified Capabilities
- None.

## Impact

- Affected API surface: graph public API (new animation entry point and instance control contract).
- Affected runtime code: `src/api/PublicGraphApi.ts`, animation utility area in `src/utils/functions/` (or a dedicated animation module), and scheduler integration points.
- Behavioral impact: zoom animation conflicts are removed by explicit cancellation/replacement, improving UX when users trigger consecutive zoom commands or manually move the camera.
