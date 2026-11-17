# Nirvana Effects: stock shader batching and exact path order

Date: 2026-11-17. Baseline: `701ddae5`. Candidate: the working tree frozen after the shared native/mixed stock shader and `orderResidentPathDraws` integration, before the final minor review adjustments and final commit. This report records that frozen candidate's measurements; it does not silently attribute them to later changes.

Subsequent review changes pass draw arrays to `gatherPathDraws` without spreading a potentially large argument list, and merge sorted contiguous ranges of the same batch/detail in `stockPathOrder`. The latter avoids expanding a single-effect scene into unnecessary per-owner commands. The main paired tables below precede them; the separate final-source check covers these adjustments.

## Confirmed result

The actual Nirvana Effects **Pipeline** scene alternates plain, `dashFlow` and `pulse` connections. Separate effect programs fragmented the translucent pass into thousands of commands. Hover also changes a connection's raise and width, causing expensive overlap-level maintenance. These are separate costs: ordinary animation and direct camera pan reused the old overlap order, but still submitted the fragmented commands.

The candidate executes the existing stock effect implementations in a shared shader, preserving the logical address stream. Where all translucent paint is compatible resident paths, it orders visible owner/sub ranges directly and caches that order instead of discovering spatial overlap levels. Other paint and custom programs retain the general ordering fallback. The existing mixed-plane eligibility and coverage guards remain in force; the candidate also admits multiple compatible stock effects to that plane. A separate bounded overlap-update fallback and unchanged-bounds check protect scenes that still use overlap levels.

The measured candidate has **median 5 draw calls** in every scenario below. Fit pan sometimes has only 3 when batches leave the viewport; all other measured candidate frames have 5. Near-view direct pan drops to roughly 9 ms p95 rAF intervals, and the reproduced 130–150 ms pointer stalls disappear. No public API or interaction contract changes are part of this work.

## Fixture and method

- Route: `http://localhost:6017/?path=/story/canvas-webglconnections--nirvana-effects`, default **Pipeline**, generator seed 7.
- The source config was captured from the actual Storybook React component and injected into both frozen bundles: **13,916 blocks, 21,654 input connection entries, 18,622 resolved connections**. This preserves duplicate input IDs and their resolution, rather than generating two merely similar graphs.
- Both bundles mount that same Storybook component. All Graph source in the baseline bundle comes from `701ddae5`; candidate Graph source was copied into an in-memory snapshot before bundling.
- Hardware: Apple M3 Pro; Chromium, ANGLE Metal; DPR 2; browser viewport 1600 × 1000; graph area 1600 × 676. Both versions report one attached live WebGL context.
- Initial camera scale `0.21125`; fit is clamped by the configured minimum to `0.01`. The other measured scales are `0.25` and `0.8`. Both versions use the same world center and camera sequence.
- Each scale has 20 warm-up rAFs, then 100 measured idle intervals and 100 direct-pan intervals with a 12 CSS-pixel horizontal camera move per interval. Depending on the boundary callback, instrumentation records 101 backend draws. CPU is the instrumented backend `draw()` duration; rAF is the observed callback interval, not input-to-display latency.
- Pointer tests use real Playwright mouse input: 24 hover positions and 30 left-button drag steps at each of `0.25` and `0.8`, allowing an rAF after each input. They are not replaced by camera-service calls. Both versions receive the same inputs and finish at the same camera positions. Render-frame counts differ because the slower version spends additional frames handling input and redraw work.
- Chromium jobs run serially under the workspace lock, without concurrent GPU or heavy CPU jobs. This is **one baseline-then-candidate pair, not ABBA**. It establishes the large effect and its mechanism on this fixture/device, not a universal FPS or tail-latency guarantee.

## Direct camera movement

Times are milliseconds; p95 is the empirical order statistic. Draw-call counts are medians over the measured frames.

| Scale | Baseline calls | Candidate calls | CPU p95 before | CPU p95 after | rAF p95 before | rAF p95 after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fit `0.01` | 11,514 | 5 | 164.8 | **14.4** | 167.1 | **25.1** |
| `0.21125` | 1,139 | 5 | 18.4 | **4.3** | 17.6 | **9.2** |
| `0.25` | 969 | 5 | 12.7 | **4.0** | 17.1 | **9.2** |
| `0.8` | 426 | 5 | 12.6 | **1.6** | 16.7 | **9.0** |

At fit while idle, baseline calls are 13,921 and backend CPU p95 is 186.5 ms; candidate calls are 5 and CPU p95 is 3.2 ms. Idle candidate CPU p95 at `0.21125` / `0.25` / `0.8` is 1.7 / 2.4 / 1.7 ms.

Instrumentation compares the `translucentRuns` identity and ordering stamp, rather than interpreting a retained debug duration as fresh work. Baseline has **zero actual order rebuilds** in all measured idle/direct-pan cases; its order guard is at most 0.1 ms. The candidate's compatible-path route avoids that overlap-order call altogether. Thus the steady improvement primarily follows removal of command fragmentation, not a claim that every old pan frame was sorting.

The reported “1.4 seconds” also has a concrete counterpart: after baseline mount, `lastLevelsMs` retains **1394.1 ms**, while `lastTranslucentOrderMs` is 9.6 ms. That retained initial measurement is not proof of a 1.4-second pan call. The independent pointer test below nevertheless reproduces substantial real stalls and is not dismissed on metric semantics.

## Real pointer interaction

| Action | Baseline CPU p95 | Candidate CPU p95 | Baseline CPU max | Candidate CPU max | rAF p95 before | rAF p95 after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hover, `0.25` | 144.4 | **7.9** | 147.8 | **8.9** | 149.8 | **16.2** |
| Drag, `0.25` | 99.2 | **7.1** | 147.9 | **8.1** | 108.3 | **9.1** |
| Hover, `0.8` | 133.9 | **1.7** | 137.0 | **1.8** | 133.4 | **9.2** |
| Drag, `0.8` | 87.4 | **2.2** | 134.5 | **2.3** | 92.0 | **9.2** |

Baseline rebuild counts are respectively 17, 58, 21 and 58. Actual scene changes include `zIndex`/`styleId` for hover raise and `bounds`/`primitives` for width changes. Candidate captures confirm those same categories of real interaction changes; faster rendering is not obtained by disabling hover, raise or geometry updates. Some changes coalesce into the same frame in the faster version, so per-frame patch counts are not expected to match.

The bounded incremental overlap update addresses dense movement propagation in general scenes. It alone would not remove the baseline full rebuilds on raise changes. The compatible-path route removes that unnecessary overlap discovery while retaining strict owner/sub painter order. Its measured phase is at most 0.6 ms in these pointer cases.

## Image validation and its limits

The focused native browser regression performs **18 full-RGBA comparisons** against the ordinary pass. These passed exactly and cover lines and curves, scales `0.25` / `0.75` / `1` at DPR 2, raise/selection, movement, opaque occlusion, translucent-rectangle fallback, a custom-program barrier and return to strict path order. These are 18 comparisons inside the regression, not a claim of 18 separate E2E tests. The final broad verification results are recorded separately before commit.

The real captured Pipeline fixture is additionally rendered at fixed times `0.123` and `2.5`. `gl.readPixels` captures the complete 3200 × 1352 framebuffer synchronously; raw compressed RGBA, hashes and visual crops are retained locally. All captures report `gl.getError() === 0`.

| Scale | Changed pixels at the two times | Largest channel difference | Interpretation |
| --- | ---: | ---: | --- |
| `0.25` | 0 / 0 | 0 | Complete byte equality |
| `0.21125` | 41 / 35 of 4,326,400 | **1 / 255** | Sparse native shared-shader rounding differences |
| `0.8` | 15 / 39 of 4,326,400 | **1 / 255** | Sparse native shared-shader rounding differences |
| Fit `0.01` | 86,763 / 85,427 | 131 / 134 out of 255 | Existing analytic single-sample mixed coverage becomes eligible |

For the two near scales with differences, disabling only `orderedStockPaths` produces the same differing bytes. Disabling only `prepareStockPaths` restores complete baseline equality; disabling both does too. The ordering change is therefore independently pixel-exact in these captures. The remaining native differences are only one channel unit and are consistent with shared-program compiler arithmetic/rounding. The measurements localize the difference to that program path; they do **not** prove the exact compiler instruction responsible.

Fit is deliberately **not byte-identical to the old native MSAA pass**: Pipeline can now use the already-established analytic single-sample lower plane. Mean absolute channel difference is 0.055–0.057 out of 255 over the full framebuffer. Crops show the expected coverage change, not a geometry/order displacement. This comparison does not independently establish equivalence with legacy 1× rendering, and its larger edge differences must not be described as native 1-LSB rounding. Existing mixed-plane coverage, continuous-hairline and occlusion validation remains relevant.

## Remaining cost and inference boundaries

Fit pan still has **14.4 ms backend CPU p95 and 25.1 ms rAF p95**. Its nested `cachedMixedPlane` phase is 9.6 ms p95, within `prepareMixedPlane` at 11.1 ms p95; these durations overlap and must not be added. `orderedStockPaths` is 2.7 ms p95 there, versus at most 0.8 ms in the near direct-pan cases. Future fit work should examine mixed-plan rebuilding and the remaining GPU workload rather than reintroducing overlap discovery for compatible paths.

Timer-query elapsed samples were collected, but GPU elapsed time can include GPU starvation while JavaScript submits many commands. They are not a pure shader-kernel busy-time measurement. No GPU instruction profiler or compiler-disassembly study was performed. The confirmed explanations are the directly observed command-count reduction, removal of overlap maintenance from compatible pointer updates, and the measured CPU phases. Shader branching, texture fetch throughput, MSAA bandwidth and driver scheduling are possible residual contributors, not separately quantified root causes in this report.

The run covers default Pipeline, this seed, this camera path and the listed pointer sequence. It does not establish all custom shader, mixed paint, device, browser, Live-update or arbitrary graph behavior. General/custom fallbacks and public effect scope semantics require their own regression coverage.

## Final-source check and coordinated verification

After the two review adjustments, a separately frozen final bundle was checked with the same captured fixture, viewport and hardware. This short follow-up uses 20 warm-up rAFs and **50 measured pan intervals**, so its shorter camera path and sample count do not replace the 100-interval paired results above. All **8 Pipeline fixed-time framebuffer hashes match the measured candidate exactly**, including its already documented near 1-LSB and fit coverage differences from baseline.

| Final Pipeline scale | CPU p95 | rAF p95 | Median calls |
| --- | ---: | ---: | ---: |
| Fit `0.01` | 13.7 ms | 25.0 ms | 5 |
| `0.21125` | 3.8 ms | 9.2 ms | 5 |
| `0.25` | 3.6 ms | 9.1 ms | 5 |
| `0.8` | 1.2 ms | 9.1 ms | 5 |

The same final bundle also runs **Comets**, a single-effect scene, for 50 idle and 50 pan intervals at each scale. This checks the sorted-range merge's intended fast path; it is not a new matched Comets baseline pair.

| Final Comets scale / mode | CPU p95 | rAF p95 | Median calls | Ordered path ranges |
| --- | ---: | ---: | ---: | ---: |
| Fit `0.01`, idle | 0.6 ms | 25.2 ms | 5 | 1 |
| Fit `0.01`, pan | 9.2 ms | 24.4 ms | 5 | 1–7 |
| `0.25`, idle | 1.3 ms | 9.0 ms | 5 | 1 |
| `0.25`, pan | 2.3 ms | 9.0 ms | 5 | 1–4 |

The idle single-effect schedule therefore stays one ordered range rather than expanding to a command per owner. All 12 final fixed-time captures report no GL error. Final bundle SHA-256: `c9f88555f8653dc88ae4547db8fb01e43906e4b6b45a8ed95e56d898c2cfa2b8`.

The coordinated final verification passed **1,951 unit tests**, **321 Chromium browser tests**, and **4 selected WebKit browser tests**, plus typechecks and lint (zero errors; eight existing warnings). The 18-comparison native pixel regression also passed in WebKit. These checks include the final review adjustments; the precise measured bundle identities remain separate from the eventual commit identifier.

## Evidence and reproduction

The scratch files are local evidence, not runtime/package dependencies; no large fixture or binary is added to the repository.

- Build/freeze harness: `/private/tmp/graph-nirvana-effects-pair-build.cjs`.
- Timing/pointer harness and log: `/private/tmp/graph-nirvana-effects-pair-run.cjs`, `/private/tmp/graph-nirvana-effects-pair.log`.
- Fixed-time ablation harness and log: `/private/tmp/graph-nirvana-effects-pixels.cjs`, `/private/tmp/graph-nirvana-effects-pixels.log`.
- Raw results, snapshots and fixture: `/private/tmp/graph-nirvana-effects-pair/`.
- Raw RGBA/channel analysis and crops: `/private/tmp/graph-nirvana-effects-pair/pixels/comparison.json` and adjacent files; offline comparator `/private/tmp/graph-nirvana-effects-compare.cjs`.
- Final-source harness/log: `/private/tmp/graph-nirvana-effects-final-run.cjs`, `/private/tmp/graph-nirvana-effects-final.log`; final captures and frame samples are in `/private/tmp/graph-nirvana-effects-pair/results-final/`.
- Fixture SHA-256: `ab2228c43774076e675ef4e002bf524c43e2b2d717e628b699deae6f42a0be39`.
- Baseline bundle SHA-256: `2319fd40fa4916b217296acc50ad074f2636f4ed9bb06a0a5c69342de136f98f`.
- Measured candidate bundle SHA-256: `0ef987cbe4923550a0ff68efba2cbeb1316e1af36d921fadbc08ea82dfa9406b`.

Related implementation plan: [mixed stock effects](../plans/2026-11-17-mixed-stock-effects.md). The eventual commit identifier can be appended without changing the measured bundle identities above.
