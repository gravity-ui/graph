# Scene allocation and culling investigation

Date: 2026-11-17. Baseline: `fba701f1`, PR #454 worktree. This follows the resident-path implementation; it does not declare legacy Running Dash parity achieved.

## Scope and findings

The user's observation about GC reproduced on the actual ETL and Running Dash fixtures. Most stationary-frame garbage came from preparation of existing resident data: iterating `PathCulling.origins` as Map entries, allocating culled range arrays/objects, then allocating another set of draw commands and per-batch gather arrays. Source geometry did not have to change to produce this garbage.

A separate fixed-visible experiment used 1k/10k/100k identical opaque blocks, 320 visible, no links, text, anchors, HTML or minimap. The 100k case submitted all 100k instances, but its draw CPU p50 was about 0.3–0.5 ms and frame median 8.3 ms on this machine. This proves the missing non-path submission culling, not that it explains ETL's CPU/GC bottleneck. Full non-path submission also predates connection unification.

Current path culling groups 128 physical slots. Its effectiveness depends on creation order. On frozen Running Dash data (238,116 pieces), scale 1 accepts 36,096 pieces through these chunks, versus 22,328 through whole-owner hulls and 1,582 through individual conservative piece hulls. All schemes accept the full 238,116 at fit. These are CPU candidate counts, not GPU timings or covered pixels.

## Implemented changes

- Grow the element table's CPU backing store geometrically while preserving logical GPU rows, indices and dirty-row uploads. At 100k elements the calculated cumulative allocation during growth falls from about 79.5 MB to 4.18 MB; final CPU capacity rises from 1.61 MB to 2.10 MB. This is an allocation calculation, not a measured GC reduction by itself.
- Track changes to the actual stored float32 origins separately. Stable camera and style updates skip the all-owner origin scan. A real origin change still scans owners; replacing the table has a unique epoch. Geometry upload spans still invalidate their own hulls.
- Visit culled ranges with scalar arguments, without constructing intermediate range objects.
- Reuse private frame commands and physical/gather arrays. Cached mixed plans and public scene values retain independent ownership. Merged followers become zero-count commands; only their surviving command draws. Dormant gather lists are evicted, arrays are bounded to the current frame, and disposal clears references.
- Keep identical same-shape `setSteps` data and visibility predicates from invalidating the schedule. Signed zero is distinguished; NaN writes remain dirty. Changes to layout, shader predicates and genuine geometry retain invalidation.

No shader, tessellation, line quality, ordering rule, style API, hit-test or port-delegation logic changed.

## Measurements

Hardware: M3 Pro, Chromium 145 / ANGLE Metal, DPR 2, viewport 1600×1000, serial GPU execution. ETL: 5,000 blocks / 6,000 links, HTML and minimap off, fit view; Running Dash: deterministic seed 7, large preset, 2,286 blocks / 19,290 links. “Idle” means active connection animation with no edits, not a naturally sleeping graph.

Allocation sampling and GC traces were separate runs. Sampling used the CDP heap sampler at 16 KiB, including objects collected by minor and major GC. The following are estimated total allocations divided by 240 observed frames, **not retained heap growth**. The final allocation run includes the lifetime cleanup.

| Scene / operation | Baseline MB/frame | Candidate MB/frame | Reduction |
| --- | ---: | ---: | ---: |
| ETL animation | 4.647 | 0.723 | 84% |
| ETL pan | 4.679 | 0.731 | 84% |
| ETL Live | 6.029 | 2.094 | 65% |
| Running Dash animation | 2.372 | 0.095 | 96% |
| Running Dash pan | 2.384 | 0.095 | 96% |

In the short traced runs, ordinary ETL draw CPU p50 fell from about 3.0 to 2.1–2.3 ms; Running Dash from 2.3–2.4 to about 1.3 ms. These are CPU preparation/submission measurements, not GPU speedups. The remaining ETL animation allocations were mostly luma/WebGL binding and state machinery. Live additionally allocates overlap/order buckets and visibility-filter results.

A separate ABBA sequence ran 1,200 ETL Live frames per fresh browser, one `simulation.tick(10)` per five frames. It used no allocation sampler; forced collection occurred before, never inside, each measured window.

| Run | Baseline A | Candidate B | Candidate B | Baseline A |
| --- | ---: | ---: | ---: | ---: |
| Minor + major GC events | 258 | 97 | 98 | 259 |
| Total recorded GC duration, ms | 351.2 | 209.2 | 217.6 | 407.6 |
| Scheduler p50, ms | 3.6 | 2.2 | 2.3 | 3.5 |
| Scheduler p95, ms | 20.1 | 17.6 | 18.3 | 19.0 |
| Frame interval p95, ms | 16.7 | 16.7 | 16.7 | 16.7 |
| Maximum recorded major GC, ms | 6.3 | 51.4 | 49.3 | 49.3 |

Rare approximately 50 ms full collections remain in both versions. The three long events spend 45.1–45.9 ms in weak-reference closure marking and leave 232.3–232.8 MB live heap, including the final baseline. The long phase is not evacuation; these measurements do not prove which weak cache causes it. Claiming all GC stalls resolved would be incorrect. Median/total preparation improved; the frame p95 in this fixture did not change.

Reproduction artifacts are in `/private/tmp/graph-gc-audit`: source-bundled baseline/candidates, `build.cjs`, `run.cjs`, `long.cjs`, ABBA log, allocation samples and Chrome traces. The build uses the real ETL and Running Dash story components, seed 7 and the parameters above. The fixed-visible experiment is `/private/tmp/graph-visible-scaling`. Large raw traces are not repository artifacts.

## Next architecture decision

Keep resident source records separate from the list of submitted work. The next bounded experiment is path-owner spatial lookup followed by piece/microchunk bounds inside candidate owners, intersected with the current physical draw schedule before mixed-plane preparation and ID gathering. Preserve the original logical order and custom-effect barriers; camera movement changes IDs, not source geometry. Bypass the additional lookup at fit when it cannot reject work.

Do not indiscriminately use authored element bounds to reject glyphs: glyph overhang, CSS size clamps, effect halos, low scales and float32 camera cancellation need renderer-specific bounds. Expand non-path culling only after a measured net benefit that includes draw fragmentation. Offscreen animation continuation is another independent fix: demand should come from accepted physical draws and semantic visibility, not only an owner's hidden flag.

Further memory work should measure retained ownership after deletion/disposal and full-collection closure cost before replacing the scene model. Existing glyph-layout/text-metric weak caches and scene-component caches are hypotheses, not demonstrated leaks. Do not pool public snapshots or author-provided values to reduce internal allocation.

## Verification

Core: 184 suites, 1,919 tests and 9 snapshots passed (6 existing todo). All package and app typechecks passed. Full core lint: no errors, 8 warnings (including two additional complexity warnings). All 317 Chromium Metal E2E tests and 9 targeted WebKit connection tests passed. The mixed-plane regression now compares exact RGBA across three same-backend far/back frames and context recreation. It also checks one live context; the full suite covers delegated ports, labels, styling, HTML handover and interaction. The built Storybook on port 6017 also rendered the full 13,916-block / 18,604-link Nirvana fixture with one live WebGL context, all endpoints resolved, and no GL/page errors.


## Independent review and corrections

Astra Ultra inspected the live source, historical culling and allocation paths. The user explicitly authorized sharing Graph source/reports with z.ai; GLM-5.3 was consulted through OpenCode (`max` reasoning for the initial review, `high` for a bounded correction). GLM reviewed a curated source/diff packet and provided measurements; it did not run an independent benchmark.

GLM initially inferred a critical mixed-cache alias from an excerpt that omitted cache fill. The actual method already copies every draw, and `splitMixedDraws` also copies. After receiving the complete method, GLM explicitly withdrew that finding. The frozen-time far/back/context tests passed. Its historical claim about large opaque `toArray()` copies was also withdrawn: the current encoder already uses views. These rejected claims are not reasons to change the implementation.

The useful common direction is spatial submission independent of resident slots, with conservative owner lookup followed by smaller piece bounds where long-owner hulls remain broad. Owner-only lookup is not expected to achieve the 1,582 piece result: the actual owner candidate count is 22,328. A tree over already broad physical chunk hulls does not fix its leaf granularity. One moved origin still triggers an all-origin scan on edit frames; a dirty-index stream is a narrower next experiment than a wholesale SoA conversion.

Do not adopt speculative cache-clearing ablations as proof of the major-GC cause: they change relayout work, ownership and GC thresholds. Match live state and retained budgets, inspect retaining paths, and compare total marking/pause time, not just one phase name. The three comparable large collections leave approximately the same 232 MB heap, so a retained-memory reduction is not claimed.
