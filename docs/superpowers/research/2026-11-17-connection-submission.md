# Connection submission: measurements and retained range snapshots

Date: 2026-11-17. Baseline: `86da2d13a42d0caaed4a35335d715da197ebe552`, published in Graph PR 454. The user prioritised connections over the proposed MiniMap follow-up. This investigation keeps public connection APIs, authored geometry, effect parameters, alpha order, AA and one WebGL context.

## What the baseline establishes

There are two distinct costs. On the Running Dash overview, the GPU processes substantially more geometry than the legacy renderer. During Nirvana pan, changing physical culling spans also invalidates CPU submission plans. Fewer source uploads or draw calls alone do not measure either complete cost.

The fresh six-way Running Dash comparison is legacy → Canvas → current WebGL → current WebGL → Canvas → legacy. All runs have seed 7, fingerprint `1766260873`, 2,286 blocks, 19,290 resolved connections, a 1600 × 900 graph viewport, DPR 2 and scale `0.015503875968992248`.

| Overview pan | rAF p95, ms | GPU median, ms | Scheduler p95, ms |
| --- | ---: | ---: | ---: |
| Legacy dedicated WebGL connections, Canvas blocks | 9.1 / 9.1 | 3.44 / 3.78 | 2.8 / 2.8 |
| Current Canvas base strokes | 16.8 / 16.9 | Not applicable | 12.8 / 11.7 |
| Current unified WebGL | 25.5 / 25.6 | 30.36 / 28.95 | 2.3 / 2.4 |

Canvas is a base-stroke reference: it does not reproduce animated effect shaders. Legacy and unified WebGL both run Running Dash. GPU query duration, scheduler CPU and rAF intervals are different measurements, not additive input-to-display latency.

Actual legacy submission has **29,522 cubic pieces and 38,580 line pieces**, or 1,158,068 path vertex invocations. Unified submission has the same 38,580 line pieces but **238,116 cubic pieces**; its total GL submission, including block/glyph work and compositing, is 9,531,259 vertex invocations. The curve-piece ratio is **8.07×**. Legacy uses the current scale bucket (-6 here), whereas resident scene paths are encoded for scale 2 (bucket 1) to avoid geometry rewrites during zoom. Shader/record-fetch differences remain confounders; the vertex ratio does not prove an exact causal percentage of GPU time.

The steady Nirvana Effects .01 sweep (12 CSS px per requested frame) produces 41 mixed-plan and 54 stock-order rebuilds per 100 frames. The initial profile read 10.3 million companion records through mixed collection. A small bounded circle at fit can keep every coarse chunk unchanged and shows zero such misses; these trajectories must not be conflated.

## Probes that were not retained

- **Shared shader tail guard.** It avoided texture fetches/math on surplus line/8-chord template vertices without changing invocation count. Ten full-frame comparisons, including native/mixed 1/8/16-chord sources at the clip edge, were exact. ETL overview ABBA GPU medians 4.15/4.21 → 4.08/4.15 ms and unchanged rAF did not establish a useful gain. No shader changes are retained.
- **Resident owner/sub intervals.** An object interval cache accelerated stock ordering but made mixed preparation slower. Replacing it with a direct Uint32 exclusive-end index removed binary lookup and object overhead, but the paired Nirvana sweep total CPU was 377.2 → 379.7 ms. Both implementations were removed. Width caching was not added.
- **Fine culling before planning.** Groups of eight records reduced invisible GPU work and ETL .35 calls 132 → 53, but Running Dash fit acquired 45 mixed-plan misses instead of zero: CPU p95 1.1 → 11.4 ms. Smaller candidate sets were not sufficient for acceptance.
- **Fine culling after planning, with per-span projection.** This preserved original plan-miss counts and all 16 full-frame comparisons, but repeatedly projected the same bounds for tens of thousands of ordered spans. Running Dash fit CPU p95 rose 1.2 → 5.2 ms; this prompted a further probe with a per-batch visibility index.

The initial ETL baseline had a non-finite camera centre and is excluded. Corrected ETL uses pipeline p264 at world centre (61720, 12884). A diagnostic first .35 visit mounted anchors and is not steady-state evidence. An initial move probe selected isolated `block_6592` (degree zero); it tested block origin invalidation only and is excluded from connection-mutation validation.

## Fine-culling architecture investigated and removed

The rejected design kept the existing 128-record coarse culling for ordering, cached mixed/native-stock plan construction and AA admission. It applied finer visibility only to final record addresses, so a fine visibility change could not force owner/sub collection or sorting, or move the 1.5-million-vertex AA gate.

`PathCulling` keeps conservative Float64 hulls for eight consecutive records. A signed Int32 run-end index stores the visible and invisible runs for the current camera and halo. Projection happens once per batch and numeric camera state; subsequent range queries follow the index. Geometry/origin/LOD/size changes invalidate it. Pixel width, halo, float32 projection margin, parent chord certificates and ordered gaps retain their original rules. This remains dependent on physical record locality; it is not a global spatial index independent of creation order.

`PathScheduleClipper` walks already ordered packed spans, splits at source and command boundaries, preserves native shader barriers and remaps compact command offsets. Output objects are reused and the input plan remains immutable. Native draws are refined before their existing gather. No source records are repacked for camera motion.

In that prototype, animation requests came from final accepted physical ranges. Two browser regressions reproduced the prior empty-frame animation loop, for one effect and a combined stock program. A third reproduced a mixed-pass statistics error: a native command fully removed by clipping was still counted as a translucent draw. Removed source/native command references are released after use; numeric pools retain bounded high-water storage.

The per-batch visibility index also failed the global gate: Running Dash fit CPU p95 1.3 → 7.7 ms and Nirvana sweep 10.1 → 23.7 ms. Logical-plan miss counts stayed identical. Running Dash fit nevertheless uploaded **26.6 MB of compact addresses across 100 frames**, versus zero, while its median geometry count stayed unchanged. More precise visibility introduced costly stream repacking/upload churn in addition to projection work.

A final narrowed probe refined only separate native draw commands and retained the original combined streams. ETL .35 ABBA gave CPU p95 3.3/3.3 → 3.0/2.8 ms and calls 132 → 74, with unchanged rAF around 9.1 ms and no GPU improvement. Far ETL .05 CPU rose 2.2/2.2 → 3.1/2.5 ms, with the same six calls. Detailed results overlapped. Its six full-frame comparisons were exact, but the modest local gain did not meet the no-regression gate. **All fine-culling implementations, their helper, and their implementation-specific tests were removed from production.** Their statistics and animation corrections applied only to the rejected refinement pipeline and were removed with it.

## Accepted change: range-snapshot allocations

The baseline `PathDrawIds` created an object for every `{first, count}` range whenever its snapshot changes. The accepted change stores the same validated values in a reusable interleaved Uint32Array. The existing exact-float address limit is 2^24, within uint32; the snapshot is independent of later mutations to caller draw objects. A logical range count distinguishes live entries from reserved capacity after shrink or clear. GPU address values, upload boundaries, ordering, geometry and visibility are unchanged.

Five focused unit tests pass, including caller mutation, buffer growth, shrink/regrow and clear/full rewrite. Independent Astra review found no correctness issue. Capacity grows geometrically and remains at its high-water mark: eight bytes per reserved range, at most roughly twice the required metadata size after growth. This replaces an array of separately allocated objects; it is not a new full-scene data model.

A synthetic helper check uses 34,239 ordered, permuted short spans and 100 warmed changed snapshots, A/B/B/A. Aggregate time is 90.5/112.1 ms before and 18.9/20.8 ms after, with equal address/upload signatures. V8 allocation sampling attributes approximately 141.8 MB to the baseline helper, dominated by the range-copy map, and no samples to the candidate helper module. That means no sampled per-range allocation at that call site, not zero total process allocation. This helper measurement is diagnostic; the real-scene acceptance below is the evidence for retaining the change.

## Real-scene acceptance

The final snapshot-only bundle is `73fdba277831867c463050b50b0b81616a8590ad0191267aa05d5b3298679d1f`. The real Nirvana Effects Pipeline fixture contains 13,916 blocks and 18,622 resolved connections. It uses a 1600 × 676 graph viewport at DPR 2, scale .01, with MiniMap off and one attached WebGL context. Runs use Chromium/ANGLE Metal on Apple M3 Pro; the harness did not capture an exact browser version. Hardware timing was serialised, without concurrent builds or tests.

In baseline/candidate/candidate/baseline order, after a complete warmup sweep, the 100-frame 12-CSS-pixel-per-frame camera sweep produced:

| Measurement | Baseline runs | Retained snapshot runs |
| --- | ---: | ---: |
| Backend draw CPU p95, ms | 11.4 / 11.5 | 9.3 / 9.0 |
| Aggregate backend draw CPU, ms / 100 frames | 356.7 / 344.3 | 332.4 / 333.6 |
| Mixed-plan rebuilds / 100 frames | 41 / 41 | 41 / 41 |
| Stock-order rebuilds / 100 frames | 54 / 54 | 54 / 54 |
| Reported GPU upload bytes / 100 frames | 782,140 / 782,140 | 782,140 / 782,140 |

Geometry encodes remain zero. The fit plan has 37,244 mixed spans; the sweep median is 31,073. Idle CPU p95 overlaps at 2.7–3.1 ms. rAF variation does not establish an FPS or frame-pacing improvement; no GPU improvement is claimed.

A separate matched CDP heap-sampling run measures 429,650,244 → 397,266,072 bytes of transient allocations, about **7.54% less**. The `PathDrawIds.update` subtree contributes 36,176,028 sampled bytes in baseline and has no samples in the candidate. Sampling uses a 16 KiB interval and includes objects already collected by minor/major GC. Its window surrounds `window.run` after a full prewarm sweep, including initial rAF synchronisation, 40 stationary setup frames, 8 settling frames and 100 sweep frames. These totals are **per matched sampling window**, not retained heap or precisely per 100 rendered frames; absence of a sampled call site does not imply zero process allocations.

Four full RGBA snapshots at a fixed time and pose were compared to the first baseline: all three comparisons of 17,305,600 bytes were byte-identical, with no WebGL errors.

The earlier rejected Running Dash Storybook camera gates used a 1600 × 694 graph viewport and fit scale approximately .010941. They are not the same camera setup as the fresh legacy reference above (1600 × 900, .015503875968992248). Comparisons are only made within their matched pairs.

## Verification status

Final snapshot-only source: **186 core suites, 1,953 tests and 9 snapshots passed** (6 existing todo); **74 browser scenarios passed in Chromium Metal and WebKit**. The browser subset covers scene connections/effects, labels/arrows, hit testing, delegated ports, context recovery, scene children and block ordering. Graph typecheck, scoped ESLint and package/E2E builds passed. Independent Astra review of the final two source/test files found no correctness issue.

The rejected probes passed their relevant pixel/unit/type checks but failed performance gates. Their results and removed implementation-specific tests do not describe a shipped rendering change. No broader browser matrix or server CI was rerun for this local change.

## Remaining overview work

Finer visibility cannot remove detail from a fully visible graph. The remaining overview gap therefore needs a separate geometry-budget solution. Previous adaptive probes retained canonical phase data but still changed raster interpolation and hard dash edges (343–347 changed pixels, maximum channel delta 166/255 in the adversarial long-dash CSS/DPR matrix). They are not silently reinstated here.

A future bounded study can separate camera-independent distance along the original cubic from the submitted tessellation, starting with plain strokes or spatially constant effects. It must establish geometric, AA and phase bounds and retain the exact detailed path for hard dashes, short spatial wavelengths and arbitrary shaders until those cases pass. Canonical distance alone does not guarantee identical screen-space dash edges.

Raw frozen sources, overlays, manifests and logs: `/private/tmp/graph-connections-86da2d13/`. The [durable measurements](2026-11-17-connection-path-probes.json) include source/bundle hashes, matched samples, rejected probes and exclusions; temporary bundles are not package dependencies. MiniMap, OffscreenCanvas/workers and public connection settings are outside this change.
