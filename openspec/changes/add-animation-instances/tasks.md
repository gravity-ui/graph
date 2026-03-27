## 1. Animation Runtime API

- [ ] 1.1 Create a scheduler-driven animation runtime module that starts animations and returns `AnimationInstance` handles.
- [ ] 1.2 Implement animation instance lifecycle methods (`cancel`, `isRunning`) and proper scheduler unsubscription on completion/cancel.
- [ ] 1.3 Add easing support with built-in presets (`linear`, `easeIn`, `easeOut`, `easeInOut`) plus custom easing function input.
- [ ] 1.4 Expose the new animation API through the public library surface with typed contracts and docs comments.

## 2. Zoom Integration and Conflict Control

- [ ] 2.1 Refactor `PublicGraphApi.zoomToRect` to use the new animation runtime instead of `startAnimation`.
- [ ] 2.2 Store the current zoom animation instance in `PublicGraphApi` and cancel it before starting a new zoom animation.
- [ ] 2.3 Add explicit cancel path for zoom animation so caller or camera-control flow can stop it when needed.
- [ ] 2.4 Remove or deprecate obsolete direct-rAF animation usage in zoom code paths.

## 3. Validation and Documentation

- [ ] 3.1 Add/adjust unit tests for animation instance lifecycle (start, complete, cancel) and easing application.
- [ ] 3.2 Add regression tests for repeated `zoomTo` calls to verify only the latest zoom animation drives camera updates.
- [ ] 3.3 Update story/example usage to demonstrate conflict-free zoom behavior and manual animation stop.
- [ ] 3.4 Run project checks (typecheck/tests) and verify no regressions in camera interaction flows.
