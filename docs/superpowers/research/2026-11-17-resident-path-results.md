# Resident paths: final production measurements, 2026-11-17

The final production renderer reaches Canvas frame pacing on the full Nirvana fixture and the tested Live ETL workload. It does **not** match the original dedicated WebGLConnections Running Dash renderer. The former repeated 89 MB zoom upload did not recur, but zoom and the first semantic LOD transition still have measurable work.

The measured source includes canonical GPU path record textures, compact ordered record IDs, stable resident slots, local culling updates, and the exact mixed connection plane. Adaptive curve indices and fragment-side paint fetching were **not enabled or transferred**. The production bundle was rebuilt from the final source after removal of unused adaptive experiments; no core source changes occurred during these measurements.

## Method and scope

- One serialized Chromium job at a time, using the repository Chromium lock. Other agents held heavy CPU checks during timing. Chromium used ANGLE Metal on Apple M3 Pro, DPR 2. These are local development-bundle measurements, not a cross-device performance guarantee.
- Fresh standalone `records` bundle, built with `/private/tmp/graph-records-build.cjs`; frozen old bundles remained untouched. No experimental global flags were enabled.
- Nirvana used a frozen fixture and Canvas → WebGL → WebGL → Canvas in one page. Each pass had 32 warm-up pan frames and 100 measured frames. The viewport was explicitly restored to 1600 × 1000 and recentered; this avoids the earlier truncated-height fixture.
- Running Dash used actual old renderer → current Canvas → current WebGL → current WebGL → current Canvas → actual old renderer. Each setup used the same seeded generator, full graph, fit camera, and 1600 × 900 viewport. Idle and pan each measured 100 frames after warm-up. Canvas displays the effect fallback; its idle frames do not perform equivalent animation work, so pan is the meaningful comparison.
- Live ETL used Canvas → WebGL → WebGL → Canvas, 5,000 blocks / 6,000 connections, viewport 1600 × 900, fit scale 0.03064798598949212. Each setup created the same deterministic simulation, performed 80 ticks of 10 requested stage changes, and awaited five animation frames after each tick. This is an accelerated deterministic workload, not the story's normal 500 ms interval. Windows below are ticks 1–40 and 41–80.
- Live scheduler statistics are the maximum scheduler duration in each five-frame tick window, with 40 samples per window. Live rAF statistics include all 200 frame intervals in that window. They must not be confused with individual frame CPU timings. Quantiles in the Live summary select `floor((n - 1) * q)` from sorted samples; the reused Nirvana harness uses `floor(n * q)`.
- Upload instrumentation counted actual `bufferData`, `bufferSubData`, `texImage2D`, and `texSubImage2D` byte payloads. Totals matched backend upload accounting. These totals combine path data, IDs, element/style data, and other renderer uploads; they do not establish that all nonzero zoom bytes were curve geometry.

## Full Nirvana

Fixture: **13,916 blocks, 18,604 connections, all 18,604 connection geometries ready**. Both renderers reported **31,160 visible scene elements** at scale 0.01, minimalistic level. Canvas/WebGL comparisons used that same query result and camera.

| Pass | rAF median / p95, ms | Scheduler median / p95, ms |
| --- | ---: | ---: |
| Canvas 1 | 24.9 / 25.9 | 21.3 / 25.2 |
| WebGL 1 | 16.7 / 25.0 | 1.8 / 2.5 |
| WebGL 2 | 16.6 / 17.7 | 1.8 / 2.7 |
| Canvas 2 | 24.9 / 25.7 | 20.8 / 22.7 |

WebGL submitted five draw calls, 587,566 instances, and one translucent draw. GPU timer medians were 28.20 and 28.39 ms; those asynchronous GPU samples are reported separately from browser rAF pacing. The first WebGL p95 is close to Canvas, while the repeated pass is faster. This supports parity on this fixture, not a promise that every WebGL frame is faster.

## Running Dash and the remaining legacy gap

Every run had **2,286 blocks / 19,290 connections**, fingerprint `1766260873`, fit scale `0.015503875968992248`, and the same camera center. The frozen pre-unification baseline was the actual old configuration: Canvas scene plus its dedicated WebGL connection renderer, rather than forcing its blocks into the newer scene renderer.

| Renderer | Pan rAF median / p95, ms, two runs | Pan scheduler p95, ms |
| --- | ---: | ---: |
| Original dedicated WebGL connections | 8.3 / 9.2; 8.3 / 8.9 | 3.0; 2.8 |
| Current Canvas | 16.6 / 17.3; 16.6 / 17.2 | 14.9; 14.8 |
| Final unified WebGL | 16.6 / 17.3; 16.6 / 19.4 | 4.5; 4.2 |

The final renderer used one connected WebGL context and five draw calls. The old renderer also used one WebGL context, dedicated to connections with antialiasing disabled; its blocks remained on Canvas. The final mixed connection target is single-sampled inside the common renderer, while the shared scene retains its existing multisampled target. The old path geometry workload is substantially smaller because its tessellation follows scale; replacing the final resident mesh with that geometry was not accepted without preserving effect phase and rendering quality.

The final renderer is near Canvas on this test and still approximately twice the original renderer's pan frame interval. Do not present the original Running Dash performance gap as solved.

## Live ETL and uploads

All four setups had the same connection fingerprint `4010623361`. Both WebGL runs used exactly one connected WebGL context; Canvas had none.

| Window | Canvas scheduler median / p95, ms, two runs | WebGL scheduler median / p95, ms, two runs | Canvas rAF p95, ms | WebGL rAF p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Ticks 1–40 | 24.5 / 29.7; 27.8 / 32.3 | 22.7 / 37.0; 22.4 / 33.6 | 25.3; 25.4 | 25.0; 25.0 |
| Ticks 41–80 | 26.0 / 28.9; 26.9 / 30.3 | 22.4 / 31.8; 21.9 / 32.8 | 25.3; 25.6 | 25.2; 24.9 |

WebGL improves median CPU work but retains a worse scheduler tail in this particular final run. Frame pacing is comparable. Across both WebGL runs, upload totals and call counts reproduced exactly:

- First tick: **1,434,152 bytes**.
- Following 79 ticks: **105,900,932 bytes**, approximately **1.34 MB per tick**, in **3,325 upload writes**.
- Per-tick median bytes: approximately 1.43 MB. Late-window p95: 1.65 MB; maximum: 1.72 MB.
- Draw-call count remained bounded: 95 around the early-window median, then approximately 82–92 late. The previous growth into thousands of calls did not recur.

After the 80 ticks, each WebGL run executed the same 12 camera poses: fit, .1, .101, .225, .226, .4, .7, .701, .4, .1, fit, and fit × 1.01. **Five poses uploaded zero bytes.** The largest transfer was **3,117,308 bytes** on the first schematic-level transition at .225. Other nonzero poses transferred approximately 54–346 KB. Both WebGL runs reproduced those byte counts exactly. No 89 MB transfer occurred.

The first schematic transition still took **63.3–67.4 ms of scheduler time**, with maximum frame intervals of approximately **66.5–66.6 ms**. This post-Live sweep includes previously unseen level content; it is distinct from earlier static-camera sweeps that had more zero-upload poses. Do not describe all zoom transitions as free or all remaining bytes as curve reuploads.

## Rejected experiments and quality boundary

Adaptive dyadic meshes produced strong overview speedups in scratch probes, but a whole-stroke geometric bound alone did not preserve arbitrary shader or hard dash behavior. The isolated CSS-width matrix found per-pixel premultiplied differences up to 166/255 for hard dash edges, even with a relative `/4` error budget. Very short spatial pulse wavelengths also amplified numeric differences. General adaptive effect support was therefore rejected for this delivery; unused experimental production helpers were removed.

A later exact-mesh probe moved constant paint/effect payload reads from the mixed vertex shader to its fragment shader. Explicit `highp int` was necessary for record addresses. With that correction, all six full-graph PNG comparisons were byte-identical. Matched A/B/B/A pan p95 was 25.1/30.5 ms for the baseline versus 24.9/25.0 ms for the probe, with overlapping GPU timings. The gain was not robust enough to justify a new production shader path; it remains a scratch experiment.

## Evidence and limits

Raw final logs: `/private/tmp/graph-final-nirvana.log`, `/private/tmp/graph-final-dash.log`, `/private/tmp/graph-final-live.log`. Live aggregate: `/private/tmp/graph-final-live-summary.json`. The reused or minimally adapted harnesses are `/private/tmp/graph-records-nirvana-pair.cjs`, `/private/tmp/graph-final-dash.cjs`, and `/private/tmp/graph-final-live.cjs`.

These local artifacts are supporting evidence, not shipped code. Browser correctness, context recovery, unit tests, type checking, and cross-browser checks are separate verification streams owned by the main task; this report does not substitute timing runs for those checks. No source commit or public API change was made by the final measurement task.
