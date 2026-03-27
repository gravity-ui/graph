## Context

The current transition path for camera zoom uses `startAnimation(duration, draw)` implemented on top of plain
`requestAnimationFrame`. This utility does not provide an animation instance lifecycle (no handle to stop a running
animation), which leads to conflict-prone behavior when:

- multiple `zoomTo*` calls are triggered in short succession, and
- user camera interaction happens while a zoom animation is still running.

The library already has a shared scheduler (`GlobalScheduler`) used across runtime systems. Aligning animation with
this scheduler keeps frame orchestration consistent and enables explicit runtime control over animation instances.

## Goals / Non-Goals

**Goals:**
- Provide a scheduler-driven animation primitive that returns a controllable instance.
- Allow callers to stop an active animation at any time.
- Support predefined easing strategies and custom easing functions.
- Migrate camera zoom transitions to the new primitive to avoid conflicts.

**Non-Goals:**
- Building a full timeline/keyframe animation engine.
- Introducing grouped channels or global animation routing abstraction in this change.
- Reworking all existing motion behaviors in one pass; scope is the public primitive and zoom migration.

## Decisions

1) Public animation primitive returns an instance handle
- Decision: expose animation start API that returns `AnimationInstance` (`cancel`, `isRunning`, optional completion
  promise/callback).
- Rationale: instance ownership keeps control explicit for each use case and avoids hidden global coupling.
- Alternative considered: channel-based conflict routing.
  - Rejected for now: adds global naming/contracts that are unnecessary for current scope.

2) Use existing library scheduler, not direct `requestAnimationFrame`
- Decision: run frame updates through scheduler registration and removal APIs.
- Rationale: keeps update flow consistent with internal rendering orchestration and priority semantics.
- Alternative considered: keep rAF-based helper.
  - Rejected: does not integrate with existing scheduler-driven lifecycle and complicates deterministic control.

3) Conflict handling is owner-driven
- Decision: consumers (for example `zoomToRect`) store their active animation instance and cancel it before starting a
  new one.
- Rationale: solves `zoomTo -> zoomTo` conflicts without introducing global coordination mechanisms.
- Alternative considered: manager-owned auto-replacement logic by key/channel.
  - Rejected for now: more abstraction than needed for this iteration.

4) Include easing presets plus custom easing function
- Decision: support at least `linear`, `easeIn`, `easeOut`, `easeInOut`, and custom `(t) => number`.
- Rationale: keeps API simple while covering common UX motion profiles.
- Alternative considered: custom easing only.
  - Rejected: worse ergonomics and discoverability for common transitions.

## Risks / Trade-offs

- [Risk] Replacing animation helpers may introduce subtle motion differences in zoom behavior.
  → Mitigation: keep interpolation semantics equivalent, verify with storybook scenarios and e2e camera flows.

- [Risk] Missing cancellation hooks in user camera input flow can leave stale animation running.
  → Mitigation: define explicit cancellation points in zoom owner code path and add regression checks.

- [Risk] Additional API surface can be used inconsistently by consumers.
  → Mitigation: document ownership pattern (store instance, cancel previous before new start).

## Migration Plan

1. Introduce animation instance runtime API with scheduler integration and easing support.
2. Update `zoomToRect`/`zoomTo*` to use owned instance and pre-start cancellation.
3. Keep backward compatibility for current behavior while replacing internal `startAnimation` usage.
4. Add/adjust tests and story examples that verify conflict-free repeated zoom calls and manual stop behavior.

Rollback:
- Revert `zoomTo*` usage to previous helper and disable new API export if regression is found.

## Open Questions

- Should completion be exposed as callback only, promise only, or both?
- Should cancellation reason be part of instance contract in this scope or deferred?
