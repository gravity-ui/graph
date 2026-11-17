# Plain connection overview LOD implementation plan

> Execute with a product implementer, independent quality reviewer and serial hardware analyst. The user approved the overview LOD approach and delegated internal decisions; the editable-layout requirement is part of acceptance, not follow-up.

**Goal:** Reduce GPU geometry for ordinary connections at overview scales without changing public APIs, losing quality, rebuilding geometry on zoom, or making editing slower.

**Architecture:** Keep the existing detailed resident geometry. The candidate represents two consecutive certified records in an existing 8-chord batch or four in a 16-chord batch: four chords per original piece, evaluating the same quantized controls. Compact IDs select this overview representation; no second geometry texture is needed. Build certificates locally on geometry updates and cache reduced submission by canonical plan/LOD/map revisions. Preserve canonical AA admission, partial spans and authored order; do not repeat the rejected per-frame fine-culling pipeline.

**Tech stack:** Existing TypeScript/WebGL2/luma, Jest and Playwright Chromium Metal/WebKit.

**Spec:** User-approved approach in this chat (2026-11-17), plus the latest instruction covering editable layouts; prior evidence in `../research/2026-11-17-connection-submission.md`. Frozen baseline `b3365a1a22fbd1205b2d805626b70eec58814bac`.

## Constraints and review focus

- One WebGL context; plain line/Bézier/polyline, arrows, labels, styles, hover/selection and hit testing keep their contracts. Delegated endpoints follow moved targets.
- Overview must reduce submitted cubic pieces, not merely discard shader work. Detailed representation remains the current path.
- Dashes, active effects and custom shaders retain exact geometry until independently proven. Measure eligible coverage in actual default scenes as well as plain variants; inactive ETL effects must not be silently counted as optimised when they are not.
- No source geometry encodes/uploads on camera-only frames, including LOD transitions. Account separately for compact ID uploads and plan preparation at a boundary; no hidden whole-graph re-encode.
- Local mutation updates only affected path owners and their certificates. A changed compact descriptor can require an address suffix rewrite; measure that separately from source geometry. Moving connected blocks/groups, add/delete/reconnect and style eligibility flips must never leave stale geometry or grow storage with each cycle.
- Preserve transparency order and the existing AA policy. Check fractional pan, DPR, camera-aware widths, joins/loops, large translations, selected strokes and authored children. Unsafe geometry retains detailed rendering.
- Avoid public knobs, dependencies and unrelated architecture changes. Account for CPU/GPU memory, cold construction and edit overhead as well as steady-state drawing.

## Tasks

- [x] Freeze b3365a1a and reuse deterministic ETL 10k/10k and Nirvana fixtures. Record actual counts, viewport, hardware, camera and effect coverage.
- [x] Implement the smallest eligible resident overview path in `WebGLSceneBackend.ts` and its encoding helper. Before implementation, pin selection/eligibility and sparse mutation behavior with tests in the owning `*.test.ts`. Audit encode/update/remove, companion sub-order, disposal and context restore callers together.
- [x] Add meaningful browser regressions in `apps/e2e/tests/connection/scene-overview-lod.spec.ts`: camera roundtrip without encodes/source writes, detailed equality, local move/add/delete and safe fallback for dash/effects/width/alpha cases. Quality reviewer owns tests independently of implementation.
- [x] Compare matched baseline/candidate on ETL and Nirvana: overview/detailed pan, zoom across boundary both ways, connected-block and group moves, repeated create/delete. Measure backend/scheduler CPU, GPU, rAF, encodes/uploads, draw counts/vertices, resident memory and cold/edit costs. Serialise hardware timing and stop builds/tests during measurement.
- [x] Accept only a real GPU benefit beyond noise with quality and no material editing regression. A twofold eligible-overview GPU reduction is the experiment's target, not a promised outcome or permission to weaken correctness. Preserve and report unsupported default-scene coverage.
- [x] Run final core tests, connection/delegation/context/browser subset, graph types, scoped lint and package build. Obtain independent review, fix defects and save evidence. Commit only the accepted implementation and evidence; remove rejected code rather than leaving a disabled experiment. Update the existing Obsidian capture/card during delivery.

## Progress

Baseline inspection confirms `PATH_BUCKET = scaleBucket(2)` and the existing eight-chord optimisation retains the detailed cubic-piece count. Product implementation, quality review and hardware measurements have separate ownership. Results and limitations are recorded in [the report](../research/2026-11-17-plain-overview-lod.md) and its adjacent measurement JSON.

Ruling: the implementation uses a compact overview descriptor over existing detailed records instead of duplicating a second geometry mesh. This preserves the user-approved resident LOD behavior while avoiding double geometry update cost for editable layouts. Acceptance still requires actual scene coverage, whole-strip quality and net hardware improvement.

Editable-layout baseline uncovered a separate no-op reconcile bug: identical connection props rewrote every retained scene connection after structural changes. A narrow `BlockConnection.propsChanged` equality guard (superclass hook preserved) is included with a primitive-identity regression. Benchmark it separately, then use the corrected baseline for the LOD comparison.

The first LOD candidate improved actual Nirvana GPU time by approximately 15–18.5%, with no eligible groups in default ETL. Counterbalanced mutation measurements nevertheless rejected its address-loop overhead. A narrow follow-up preserves the validated common prefix, separates canonical and compact loops, and writes offsets only at span boundaries containing all command boundaries. Repeated boundary zoom also rejected immediate mode toggling: entry now has a 10% inset within the unchanged certified band.

Final ABBA editing measurements no longer reproduce a consistent regression, with identical local source writes. Accepted as a bounded improvement, not the twofold experimental target or overall Canvas/editing parity. Final verification: 187 suites / 1,967 tests / 9 snapshots / 6 existing todo, 80 Chromium Metal/WebKit scenarios, graph types, scoped lint (0 errors, 13 warnings), package/E2E build and independent review. Remaining structural stalls and the isolated mixed-plan zoom outlier are explicit in the report; they are not considered resolved by this step.

### Single-connection editing follow-up

[The single-connection reconnect report](../research/2026-11-18-single-connection-reconnect.md) covers one existing edge retargeted and restored on ETL 10k/10k and Nirvana Max. The Storybook control in ETL at Scale lets a reviewer switch the first pipeline's Orders DB output between two real input anchors with the minimap off. The measured cross-pipeline edit, source revisions, camera controls, and fixed-time framebuffer comparisons are documented in the report.
