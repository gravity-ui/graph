# Strict TypeScript debt gate

Issue: https://github.com/gravity-ui/graph/issues/354. Compiler: **TypeScript 5.9.2**, pinned at the workspace root and checked by each compiler worker.

Run `pnpm run typecheck:strict`. It rebuilds all four packages before checking the complete existing source/test tsconfigs for graph, React, minimap, devtools, Storybook and E2E with `strict: true` and `noEmit: true`. Other options remain those of each project. Scheduler's entire source/test directory must have zero errors in every project, regardless of baseline contents. Graph source/tests and its inherited publish config use permanent strict checking (#362). No diagnostic anywhere under packages/graph may be admitted to the baseline.

The baseline contains project, repository-relative file, error code, **complete** diagnostic message and occurrence count. Absolute checkout paths inside messages are normalized to `<repo>/` while retaining the complete message. Positions are excluded, so line movement does not affect the check. A new identity or increased count fails even when total debt decreases. Decreases are allowed; remove retired debt explicitly in the PR that fixes it. Global/configuration errors, empty projects, failed/timed-out compiler processes, wrong compiler versions, malformed results and malformed baselines fail the check.

To propose an update, first rebuild (`pnpm run build`), then explicitly run `node scripts/strict-diagnostics.mjs --write-baseline`. This command is never run in CI. Review the JSON diff, explain each new identity/count, assign unfinished debt to the corresponding #353 child issue, and include the baseline change in the reviewed PR. Scheduler errors cannot be written into a baseline. Never regenerate just to make a failing check pass.

The initial baseline is a fresh measurement of origin/v2 at e61f12e314ab7f51354ec40aa34ff15cba045d0b plus #354 fixes. It uses freshly built non-strict declarations for downstream imports. E2E's existing config excludes tests; extending application/test coverage belongs to #367. This gate protects the currently declared roots without claiming excluded files have passed strict.

Run `pnpm run test:strict-diagnostics` for the gate's regression tests. Retire the debt baseline when all areas in #353 have permanent strict checks.

Completed event files (#359), including EventedComponent, Emitter, the DOM adapter,
dragListener, Camera and React event helpers/tests, must stay at zero strict errors.
Graph and canvas Block must also have zero TS2345 argument errors. These rules
apply to baseline writes as well as CI comparisons.

Completed component contracts (#360), including CoreComponent, Component, class
utilities, BlockGroups, BelowLayer and React GraphLayer/useLayer, must stay at zero
strict errors. Their factories validate required props and concrete refs in both
source and packed consumer fixtures. The refreshed baseline only removes retired
diagnostics relative to `v2` after #379: graph 217 → 194, React 25 → 23;
other projects are unchanged.

## Structural geometry baseline update

Removing `Point`/`Rect` and their interfaces retires six diagnostics: four implicit-any
constructor parameters and two possibly-undefined `origPoint` coordinates.
The baseline update only removes these resolved diagnostics; it adds no new
diagnostics or suppressions and preserves the event-contract guarantees above.

## Core entity operations (#362)

All graph source/test diagnostics are retired, with only graph records removed from
the baseline. Graph diagnostics are rejected in every project and during baseline
writes. Core consumer fixtures check strict and non-strict source/declarations,
including optional canvas views, resolved connection IDs and generic Block/Layer
authoring. Packed consumers check all four packages with skipLibCheck disabled.
