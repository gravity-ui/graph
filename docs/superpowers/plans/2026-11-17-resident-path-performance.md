# Resident path performance implementation plan

> Execute with collaborating agents and independent review. The user approved this direction on 2026-11-17 and delegated internal implementation decisions.

**Goal:** Restore the performance of legacy animated connections inside the single scene context while retaining quality, ordering, style and interaction contracts.

**Architecture:** Keep the scene, its scheduler, tables and public descriptions. Specialize resident path submission and sparse updates. Test the sampling bottleneck separately. Reuse the existing path shaders, culling and instance ranges before replacing geometry representation.

**Stack:** TypeScript, WebGL2, existing luma backend, Jest, Playwright on Chromium Metal.

**Spec:** The accepted proposal in the chat and Obsidian capture `Inbox/2026-11-17 Graph — перенос связей в общую сцену и замеры.md`, plus `docs/design/scene-blocks-3b/2026-11-10-v2-scene-core-design.md` and subsequent 3b decisions.

## Constraints

- One live context and one scene clock. Preserve API, Canvas, styles, hit-test, delegated endpoints, manual bends, arrows, labels and HTML handover.
- The user explicitly accepted a fixed connection plane below blocks on 2026-11-17 if it provides the best performance. Treat a connection's shaft, arrow, labels and owned children consistently; keep ordering inside each plane. Validate this as a separate candidate before integration.
- Camera-only movement must not rewrite source geometry. Reduce actual submitted vertices, not just discard them in a vertex shader.
- Sparse style/program changes must not upload unrelated large path groups. Account separately for changes of geometry and data, and for camera movement.
- Custom effects retain the precise mesh unless their interpolation contract can be preserved. Verify built-in effects including continuous dash phase.
- Quality covers the full stroke, halo, normals, subpixel lines and transparent intersections. Do not globally disable antialiasing as a performance fix.
- Reuse existing dependencies. Retain changes in this worktree, no publishing. GPU tests run serially through the existing Chromium lock.
- Original baseline bundles and deterministic fixtures are in `/private/tmp/graph-backend-comparison.DOseae`; preserve those artifacts for matched comparisons.

## Review focus

- Adaptive boundaries, DPR and large coordinate cancellation must never choose unsafe detail.
- Different effects sharing one program, visibility and transparency changes must update the right local records.
- Companion instance ranges must remain aligned after allocation, sorting and reuse.
- Alpha edges, path joins, arrows, label overlap and nested scene ordering must remain correct.
- Repeated status cycles must not grow memory or cause periodic whole-buffer uploads.

## 1. Resident curve templates — experiment closed

- [x] Measure conservative 1/2/4/8/16-chord selection, grouped and indexed submission, sparse index writes and bounded preparation.
- [x] Check full-strip coverage, CSS/world widths, translated curves, pulse, tiny dashes and comet fading against the exact mesh.
- [x] Reject general adaptive topology: although the overview prototype can be faster, hard dash boundaries and high-frequency effects do not preserve quality; Live rebuilds add work. Experimental modules and their unused production APIs were removed. The existing certified fixed-eight path stays unchanged.
- [x] Test exact mixed-pass paint fetches in the fragment shader. Six full PNGs matched, but alternating pan timings did not show a reliable gain. Keep the experiment outside the library.

## 2. Local instance updates

Files: `InstanceRanges.ts`, `InstanceRanges.test.ts`, `WebGLSceneBackend.ts`, `translucentOrder.ts` if stable allocation requires it.

- [x] Pin sparse insertion/removal/shape-change and repeated effect cycles with failing tests.
- [x] First remove unconditional full uploads where dense storage does not require them. Backend promotes to full write only on real GPU allocation growth.
- [x] Measure deterministic ETL tick(10). If dense suffix movement remains dominant, implement bounded local storage or stable allocations and ordered submissions, with companion alignment tests.
- [x] Verify bounded retained allocation over 200 reshape cycles, companion alignment, correct overlaps and partial uploads over 80 Live ticks.

## 3. Sampling experiment and integration

Files: scratch prototype first; production shader/backend files only after quality and performance checks.

- [x] Compare current MSAA to a one-context alternative. Keep analytic lower connections in a single-sample target of the same context, composited below unchanged multisampled upper content.
- [x] Check narrow/wide strokes, loops/joins, transparency, block/text edges, triangles, custom hover halos, hidden labels and root ownership. Unsupported order/paint retains the shared renderer. Six opaque hairline images also match the actual legacy #451 blend behavior byte for byte.
- [x] Integrate the exact mixed pass with a 1.5M submitted-vertex gate. ETL stays on the cheaper shared path; Dash/Nirvana overview can use the mixed pass. Reject the all-scene alpha, early-order and adaptive variants.

## 4. Verification and handoff

- [x] Independent code/quality review; resolve findings. Removed unused adaptive APIs and corrected stale migration text about multipoint labels.
- [x] Core/React tests, all package/app typechecks and lint; installed graph/react/minimap package contracts; 317 Chromium Metal tests and 36 relevant WebKit scenarios passed.
- [x] Matched alternating production comparisons: Running Dash, original ETL and 5000/6000 Live, full Nirvana, zoom. One context and delegated ports verified. Dedicated group-drag attribution is the next user-requested stage.
- [x] Record final measurements and limitations in the existing Obsidian capture and `research/2026-11-17-resident-path-results.md`. Storybook remains available at localhost:6017; full Nirvana was checked there with one context and no GL/page errors.

Endpoint-reference optimization remains a measured follow-on if drag still dominates after these changes. It is not a substitute for fixing the stationary scene GPU bottleneck.

## User-requested follow-on, after the main scene work

The user added these tasks on 2026-11-17 and explicitly asked to finish the current implementation first:

- [x] Add the ETL Storybook Minimap control. Actual Controls on/off/on at 5000/6000 detaches the old canvas, creates one new layer, and preserves the camera and graph. Typecheck/lint passed; committed as `b46485be`.
- [x] Assess OffscreenCanvas/worker scope in `research/2026-11-17-offscreen-rendering.md`. Supported by installed luma/platform; estimate 3–5 engineer-days for a prototype, 20–35 total for production compatibility. No worker implementation or measured worker speedup is claimed.
- [x] Profile and fix group drag: batch member updates and read exact shallow state for bounds. At 5000/6000, the 19-member pipeline falls from 95,000 deep snapshots / 19 derivations to 0 / 1. WebGL without MiniMap: handler p95 248.2→1.6 ms; rAF p95 259.1→16.9 ms. MiniMap retains its documented 100 ms cadence and adds 19–23 ms per picture. Final core (1912 tests), 107 relevant browser tests and actual Storybook pointer/port checks passed. See `research/2026-11-17-group-drag.md`.

## Measured decisions during implementation

- Rejected the adaptive-template draw grouping for real Running Dash: 128-piece cohorts all require 16 chords. Individual detail cuts curve vertices from 8.096M to 3.463M but produces 111,133 runs; merging to 512 draws leaves 7.946M vertices. It is disabled in the backend. An indexed topology experiment will test whether the individual savings justify table fetches and additional resident indices.
- Rejected the all-scene analytic-alpha probe with fully mixed order: 34,603 draw calls and roughly 490 ms CPU per frame. The authorized fixed connection plane allows a much smaller experiment: analytic connections in a single-sample target of the same context, composited before unchanged multisampled blocks.
- Retained path slots cut the matched ETL fixture's routine uploads from about 19 MB to 0.13–0.32 MB per tick in the first measured run. This is a transfer result; whole-frame parity and long-run memory still need measurement. Incremental culling growth and allocator indexing were subsequently fixed before the longer run.
- Canonical RGBA32F path records now keep one GPU geometry copy. Four-byte draw IDs gather retained physical ranges without moving their source records. In the original matched ETL fixture, 80 Live ticks hold at 44 draws, instead of growing to 3,512 before indirection; six frozen-time images (initial, ticks 1/16/80, focus, zoom) match the preceding exact renderer byte for byte. This does not yet establish parity for the larger fixture.
- The 5,000-block/6,000-link Live fixture exposed a separate CPU problem: physical-range fragmentation still increases overlap/order/visibility preparation despite stable GPU draw counts. After incremental visibility reads and layout-only order invalidation, measured early/late scheduler p95 remains 37.9/59.1 ms. Continue profiling this before enabling a new drawing mode by default.
- A canonical indexed-curve probe submits 3.955M indices instead of 8.096M curve vertices in Running Dash, using 15.82 MB of indices and no second geometry texture. Alternating baseline/adaptive/exact/adaptive/baseline runs give pan median 25.0→16.7 ms and p95 about 33.7→25.3 ms on M3 Pro, Chromium Metal, DPR 2. Exact indexed control retains baseline timing. Cold preparation is about 137 ms; this and quality/Live rebuild costs prevent treating the probe as a production-ready solution.
- The mixed analytic connection-plane probe reuses canonical record textures with about 1.1 MB of packed IDs. Its exact 1x coverage reference matches in 8 Running Dash and 4 synthetic intersection images; unsupported authored interleaving and wide opaque strokes retain the original shared 4x path. The probe still performs the full overlap schedule before preparing its own plane, so the larger ETL Live run shows no benefit. Test preparing the lower plane before overlap ordering rather than shipping this redundant work.

## Final implementation checkpoint

Canonical path records and compact draw IDs are in production. Record uploads precede schedule construction, inactive physical fragments are removed before sorting, visibility is cached by dirty 128-record chunks, and the old all-zoom bounds are removed. The mixed pass preserves native custom-effect barriers and defaults to the shared renderer when its eligibility checks fail.

The first final Chromium Metal run passed 106/106 relevant browser tests, including delegated group ports, effects, selection/editing and both ordinary and mixed context restoration. The mixed test verifies the new live framebuffer/context and byte-identical fixed-time image. Final full-suite and alternating production measurements are recorded below when completed.

Final CPU checks after cleanup: 183 core suites, 1906 tests and 9 snapshots passed (6 existing todo); monorepo package/app typechecks passed; full package/Storybook lint passed with six warnings and no errors. The prior React check passed 189 tests (4 skipped). Browser/packed-package verification continues.

Final browser/package verification completed: 317/317 Chromium Metal, 36 relevant WebKit scenarios (35 initial + corrected DPR pixel test), and installed graph/graph-react/graph-minimap consumer contracts passed. The only browser fix was the test's CSS-to-device-pixel coordinate conversion. The current scene renderer is ready for the following minimap/drag assessment; Running Dash's remaining gap to legacy and LOD transition stalls are documented, not claimed solved.
