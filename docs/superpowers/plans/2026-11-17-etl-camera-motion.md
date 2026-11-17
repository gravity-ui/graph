# ETL 10k camera motion implementation plan

**Goal:** Reproduce ordinary ETL at Scale with 10,000 blocks/connections, smooth minimalistic–detailed–minimalistic zoom and circular pan; retain geometry and scene order through camera-only changes.

**Constraints:** Preserve one WebGL context, effects and their scale ranges, alpha/painter order, HTML handover, minimap, anchors and delegated ports. Keep data stationary for the camera workload (`Live=false`), while leaving Live available. No new library API or dependency.

## Scenario and evidence

- [x] Freeze `c33cc8dc`, run the actual Storybook with 10k/10k, HTML/minimap on, Live off and effect cutoff 0.1. Distinguish real sorting from cached diagnostic durations.
- [x] Add Manual/Zoom cycle/Circular pan to existing Storybook Controls. Default counts 10k/10k, Live off; 20-second logarithmic zoom and 16-second circle. Cancel on mode/view changes and unmount.
- [x] Verify the visible story controls and actual trajectories, including a return to manual control.

## Renderer and minimap

Observed baseline: 12 zoom order rebuilds (10 envelope changes, 2 visibility-only changes). Detailed circular pan has no order rebuild or path upload, but HTML hidden-only updates cause 25 full minimap pictures at ~40 ms each. The initial schematic entry lazily creates visible anchors; distinguish this first visibility preparation from steady camera work.

- [x] Regress stable order through camera/LOD/owner visibility changes, while preserving actual draw filtering and true scene-mutation invalidation.
- [x] Retain conservative effect-owner envelopes over the configured camera range and all resident LODs. Exclude style parts that are unconditionally hidden; revealing a part is a paint mutation that invalidates its owners. Compare hidden masks, not colour-only style updates. Expand if a lower camera limit or DPR requires it. Keep tight local coalescing footprints separate.
- [x] Remove the redundant camera-sensitive order mask from InstanceVisibility; order all live resident ranges and filter only submission.
- [x] Verify minimap output dependencies and suppress only confirmed irrelevant HTML-hidden invalidations; retain content/geometry/style updates.
- [x] Profile remaining spatial submission. A per-chunk projection cache did not improve an isolated ABBA check and was discarded; per-range instrumentation itself adds overhead.
- [x] Recover efficient native batching for custom effects below their activity cutoff. Preserve analytic/MSAA eligibility and the eight-source fallback. Chromium and WebKit RGBA regression passes; actual far ETL quick check has six draws. Full paired timing remains below.
- [x] Remove repeated run-object copies from the visibility filter. Its unchanged entries borrow the resident schedule; merging uses copy-on-write. Input immutability regression passes. Isolated ABBA confirms identical output and zero unmerged-run allocations.
- [x] Diagnose the active-custom (`Effect min scale=0`) regression as well as the default cutoff. The retained envelope included opaque-only primitives and kept owners with all translucent parts hidden in the overlap graph. Derive its geometry from actually encoded translucent sub-orders, retaining potential translucent text through glyph relayout. The regression fails on the previous bundle (eight phantom overlap levels instead of zero).
- [x] Discard the larger coalescer experiment: exact rectangle checks did not improve CPU time; the corrected envelope makes the original coalescer threshold sufficient. Keep the original coalescer, quality margins and refinement policy.

## Acceptance

- [x] Matched frozen before/after zoom and circular-pan runs with actual levels, counts, draw calls, encodes, upload bytes, sorting and minimap counters. Final default ABBA and an all-scales-effects paired run use the same scene and light instrumentation.
- [x] Fixed-time RGBA checks across effect/LOD thresholds, HTML handover, hidden/visible parts and genuine ordering mutations. All 24 final full-frame comparisons are byte-identical; browser regressions cover actual paint mutations separately.
- [x] Targeted regression, types/lint/build and broad browser checks: 1,952 core tests, 323 Chromium Metal tests, four distinct WebKit scenarios, all workspace types, scoped lint and the camera-control self-check. Results and remaining limits are in the companion research report; update the existing Obsidian capture/review card when recording the local commit.
