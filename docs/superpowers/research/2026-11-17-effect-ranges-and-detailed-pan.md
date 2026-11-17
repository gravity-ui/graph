# Effect scale ranges and detailed HTML pan

2026-11-17, Graph PR #454, worktree `webgl-unified-scene`, changes following `3499b5b7`. Codex implementation, Astra Ultra investigation and independent review.

## Detailed pan: cause and measured change

The unconditional `orderTranslucent()` call was usually a cheap cache check. However, HTML block mount/unmount changes the scene owner's `hidden` flag. This removed/reinserted overlap boxes and changed path visibility revisions, causing a global level rebuild and run schedule rebuild despite unchanged geometry, depth, and range layout. Crossing the same HTML visibility boundary repeatedly reproduced nearly one rebuild per frame.

The order plan now retains temporarily hidden owners. Its path eligibility tracks part visibility, LOD, and primitive scale ranges independently of owner hiding. The final draw filter still checks actual owner/ancestor visibility. Geometry, style, depth, deletion and LOD changes retain their own invalidation. This adds one byte per resident slot plus a chunk prefix for order eligibility; it avoids duplicating decoded cohorts or path geometry.

Matched before/after bundles contain the same effect-range code; only this ordering change differs. Real ETL 5000 blocks / 6000 connections, seed 7, HTML on, Live and minimap off, scale 0.8, Chromium 145 / ANGLE Metal / Apple M3 Pro, DPR 2, 1600×1000 window. Each case has 100 measured rAF intervals and 101 backend draws. The boundary case alternates camera x=-7280/-7040 at y=-6912; the travel case moves 12 CSS px per frame.

| Case | Before | After |
| --- | ---: | ---: |
| Boundary: real order rebuilds | 99 | 0 |
| Boundary: order call p95, ms (levels included) | 13.0 | 0.0 |
| Boundary: backend draw p95, ms | 18.0 | 4.6 |
| Boundary: frame interval p50 / p95, ms | 25.0 / 25.7 | 8.4 / 16.8 |
| Travel: real order rebuilds | 6 | 0 |
| Travel: backend draw p95, ms | 15.6 | 4.1 |
| Travel: frame interval p95, ms | 16.7 | 9.2 |

Draw calls remained about 46–49. Six full framebuffer SHA256 comparisons match before/after at fixed effect time, including schematic/detailed, three pan positions, zoom out/back and HTML hide/show. GL errors: zero. Raw local reproduction: `/private/tmp/graph-order-structural/{run.cjs,pair.cjs,pair.log,*-pixels.json}`. These are one paired experiment, not a cross-device performance guarantee.

`lastTranslucentOrderMs` retains its existing documented meaning: duration of the most recent rebuild. A cache hit leaves it unchanged. Real rebuild counts above instrument run-array identity; the cached metric alone must not be interpreted as current-frame work.

## Effect scale range behavior

`effect.use(params, {minScale, maxScale})` activates the shader for `minScale <= scale < maxScale`. Both bounds are optional; supplied values must be finite, nonnegative, and ordered. Uses without bounds keep previous behavior. The bounds also work in literal effect uses and style rules.

Resident paths group by effect identity and bounds. Camera crossing changes group uniforms, the extra halo and animation continuation, without changing the records or their address stream. Normal programs use the existing identity selection tint when inactive. Potential depth-writing custom programs switch to a plain sibling model sharing the same textures/buffers, leaving the active custom shader untouched. The mixed pass uses its existing per-source plain bit, so different ranges of the same effect activate independently. Conservative overlap bounds and painter order remain stable. Inactive uniform signals do not request frames; spatially culled or semantically hidden animated paths no longer keep the scene running.

Canvas scene rendering keeps its documented base stroke. The compatibility Path2D batch applies the custom Canvas fallback only inside the range. Public API and many-distinct-range batching costs are documented in `packages/graph/docs/connections/webgl-connections.md`.

ETL Controls adds **Effect min scale**, default 0.1; 0 enables effects at every scale. It applies to block decorations and running flows. Hover remains an animated single-link exception. The story limits this control to 0…0.7, where the existing detailed HTML representation begins; the library API has no such cap.

The built Storybook ETL 5000/6000 at fit scale 0.0345006 rendered **0 additional backend frames over 30 rAFs** with cutoff 0.1, versus **30/30** with cutoff 0. At scale 0.2 it resumed 20/20 frames in both cases. All 6000 endpoints resolved; 71 HTML cards mounted at detailed; one live WebGL context; no page or GL errors. Live and minimap were off. This proves idle animation suppression, not a reduction of all submitted vertices while panning.

## Verification

Final verification: 185 core suites, 1,940 tests and 9 snapshots passed (6 existing todo); all package/app typechecks passed; core lint has 0 errors and the same 8 warnings as the prior commit. Full Chromium Metal E2E: 320/320 passed; 4 targeted WebKit scenarios passed. Storybook typecheck and lint for the five changed demo files passed. The persistent hidden-owner browser regression fails with only the former ordering code restored and passes with the fix. Targeted Chromium and WebKit tests cover exact boundaries, same-effect independent ranges in the mixed plane, no threshold uploads, visible/hidden/offscreen continuation, custom depth and a comment mentioning depth, context restoration, and no wakeup on inactive uniform changes.

Remaining broader limits from the resident-path/GC reports are unchanged: physical chunk spatial granularity, rare full GC pauses, and the legacy specialized Running Dash gap need separate measurements. This change does not move rendering to a worker or claim full-scene Canvas parity on every view.
