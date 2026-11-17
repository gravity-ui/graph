# ETL 10,000 / 10,000: camera motion

Date: 2026-11-17. Baseline: `c33cc8dcc53d72bf87f462bccd3300c65f7e61cf`. The accepted source keeps the original coalescer and adds only the targeted ordering, bounds, filtering and MiniMap corrections described below. Candidate build SHA-256: `31fa136244a7b345f9d7a6cb39ef201ecfe2f5c431ca3d5ff67daa1f2fa8e749` (frozen compiled packages, local artifact name `final5`).

The final comparison keeps **10,000 blocks, 10,000 resolved connections, HTML and MiniMap enabled**, and tests both the normal effect cutoff **0.1** and effects active at every scale (**0**). Camera motion no longer rebuilds the global translucent order. Repeated zoom and all circular pans upload no path records and perform no encodes. The remaining two MiniMap pictures per zoom reflect real changes to the blocks' tint; their visible pauses remain a limitation rather than being hidden by p95.

## Final results

Times are milliseconds. Default settings use **A/B/B/A**, with a fresh graph for each run. Ranges show the two observed p95 values; draw calls are the observed per-motion medians. Backend CPU and rAF intervals measure different stages and must not be added or treated as input-to-display latency.

| Default effect cutoff 0.1 | Baseline rAF p95 | Final rAF p95 | Baseline backend CPU p95 | Final backend CPU p95 | Median calls: baseline / final |
| ------------------------- | ---------------: | ------------: | -----------------------: | --------------------: | -----------------------------: |
| First zoom                |        17.6–25.0 |           9.3 |                  8.1–8.2 |               7.0–7.1 |                        41 / 52 |
| Repeated zoom             |        17.5–24.5 |       9.2–9.3 |                  6.7–6.8 |               5.6–5.9 |                        41 / 52 |
| Circular pan 0.05         |          9.2–9.3 |       9.2–9.3 |                  3.5–3.7 |               2.6–2.9 |                         41 / 6 |
| Circular pan 0.35         |          9.1–9.4 |       9.1–9.3 |                  2.7–2.8 |               3.7–4.0 |                       62 / 132 |
| Circular pan 0.8          |        41.0–41.7 |       9.3–9.4 |                      8.1 |              9.9–10.5 |                        34 / 48 |

The all-scales-effects comparison is a separate **paired A/B**, not ABBA. It follows the same two complete zoom cycles and three circular pans, so it also exercises continuous zoom while custom effects remain active.

| Effect cutoff 0   | Baseline rAF p95 | Final rAF p95 | Baseline backend CPU p95 | Final backend CPU p95 | Median calls: baseline / final |
| ----------------- | ---------------: | ------------: | -----------------------: | --------------------: | -----------------------------: |
| First zoom        |             16.7 |           9.4 |                      7.9 |                   5.6 |                       41 / 167 |
| Repeated zoom     |             17.5 |           9.3 |                      6.6 |                   5.5 |                       41 / 167 |
| Circular pan 0.05 |              9.3 |           9.3 |                      3.0 |                   4.2 |                       41 / 176 |
| Circular pan 0.35 |              9.3 |           9.1 |                      3.0 |                   3.7 |                       62 / 132 |
| Circular pan 0.8  |             41.3 |           9.3 |                      7.7 |                  10.1 |                        34 / 48 |

Every final zoom has zero real global-order rebuilds. Each first zoom retains the existing **1,660 lazy-anchor encode increments and 40,640 path-record upload bytes**. Repeated zooms and all pans have **0 encode increments and 0 path-record upload bytes in total**. Logical draw-ID and element/style table uploads still occur when the visibility or style changes; zero path upload does not mean zero work everywhere.

Full MiniMap pictures occur twice per final zoom and 0 times across the final circular pans. The retained zoom pictures take **35.5–43.7 ms**. The largest final zoom rAF interval is **50.9 ms**, and the largest final pan interval is **16.8 ms**. These maxima are reported alongside p95 because the remaining tint-related MiniMap refresh can still be noticeable.

The final CPU and call counts are deliberately shown even when frame pacing reaches parity. At far scale with all effects active, the conservative resident order can still need more preparation and calls than the baseline's tight scale-dependent order. This work does not establish that every loop is proportional only to visible geometry, or that the GPU cost of every combined program is lower.

At default far scale, native source combination submits **2,583,380 median vertex invocations versus 1,795,882** (about **44% more**), with exactly the same 368,134 logical instances. The shared curve template also processes line instances; the result is therefore not an across-the-board GPU-work reduction. With the cutoff at zero, final far instance and vertex counts match baseline exactly, but 176 versus 41 median calls and 4.2 versus 3.0 ms CPU p95 remain.

## Reproduction and method

The actual Storybook route is `http://localhost:6017/?path=/story/canvas-sceneeffects--etl-at-scale`. Its initial baseline was measured directly. Controlled comparisons then use that exact component and fixture frozen from the baseline commit, with each version's library packages. This avoids changing the viewport or data when the new motion controls are added to Storybook.

Explicit settings: 10,000 blocks; 10,000 connections; renderer WebGL; HTML on; MiniMap on; Live off; Focus on failures off; view fit; selection glow 0.6; effect minimum scale 0.1 or 0 as labelled. Store counts and the actual WebGL renderer are checked, with one attached live context. Live is off to hold data stable, not to remove HTML or MiniMap work.

Hardware and viewport: Apple M3 Pro, Chromium with ANGLE Metal, DPR 2, 1600 × 1000 browser viewport and 1600 × 965 graph area. Browser `Math.random` uses seed 7; the ETL generator independently uses its built-in seed **20261116**. The Live simulation RNG also uses 7 but is inactive. The camera is centred on pipeline `p264`, 19 members, world centre `(61720, 12884)`.

Each run has 40 warm-up rAFs before each motion. Zoom uses 480 requested frames, with cosine interpolation in log scale from 0.05 to approximately 0.9 and back, at a fixed centre. It runs twice to distinguish first anchor mounting from repeated movement. Each circular pan uses 120 requested frames, radius 240 CSS pixels converted to world units, at scales 0.05, 0.35 and 0.8. Actual frame-level transitions are recorded around 0.225 and 0.7.

Final instrumentation is identical and light for both builds: top-level backend/scheduler timings, changed order-array identity, edits, source upload bytes, encode counters, MiniMap picture work and GL submission counts. It does not wrap individual range/culling/visibility calls. Earlier detailed profiles did wrap approximately 33,000 range calls and are used only for attribution, not as directly comparable final CPU timings. No other browser or heavy CPU job runs during timing. Asynchronous GPU queries are diagnostic only; their occasional large outliers do not establish per-kernel cost or display latency.

## Confirmed defects and the minimal corrections

**Hidden-only HTML handover repainted the complete MiniMap.** The actual Storybook baseline made 25 full pictures during 240 detailed-pan frames, approximately 40.1 ms median / 42.5 ms p95 each, despite zero encodes and zero path-record uploads. All 31 scene apply batches were hidden-only. The MiniMap already queries with `includeHidden` and interprets with `drawHidden`, so those changes do not alter its image. Diagnostic toggles confirmed the cause: detailed-pan rAF p95 was 49.9 ms with both HTML and MiniMap, 16.9 ms without MiniMap, and 16.7 ms without HTML.

The correction retains public revision subscriptions, the 100 ms throttle, custom entity types, ordering, click mapping and hidden-block drawing. It records whether a followed type's revision epoch contains exclusively hidden-only updates. Only that proven case skips a picture request. Any substantive, style, mixed or unknown change still refreshes. Epochs use revision values rather than a frame-end reset, preserving reentrant updates; records are bounded by followed types and cleared on detach/unfollow.

**Zoom rebuilt global order for conservative bounds and LOD eligibility.** The original 12 misses per cycle consisted of ten overlap-scope changes and two minimalistic/schematic order-eligibility changes. The detailed boundary did not itself rebuild order. The correction orders all resident LODs over a stable conservative camera envelope and applies actual visibility before submission. Hidden owners remain in that order, so HTML viewport handover needs no global resort.

The envelope includes only primitives actually emitted into the translucent pass, using their existing sub metadata, and excludes style parts whose effective visibility is false. Opaque body/text geometry and hidden selection glows must not constrain alpha ordering. A real part hide/show or style-ID change invalidates the affected envelope; colour-only LOD rules do not. The emitted-sub filter falls back conservatively on unexpected metadata and retains translucent text for subsequent glyph relayout. No new public option or renderer API is introduced.

**Inactive custom effects created unnecessary program barriers.** When an effect is outside its active scale range, its native program already paints the ordinary stroke. Compatible inactive sources can therefore share the existing native program and exact logical ID stream. Active custom effects remain barriers. This preserves the native sampling path and does not change global AA or move every connection below every block. At far scale it combines six compatible sources into one path command; logical instances are unchanged, although mixed line/curve commands may invoke the larger strip template for line instances as well.

**Visibility filtering copied unchanged runs.** A detailed helper profile measured 31 hidden-only refreshes creating about 34,000 run objects each, or 1,060,988 copies across one circle. The filter now reuses unchanged input runs and copies only on the first merge. Input schedules remain immutable. The isolated 34,239-run ABBA check measured p50 1.57–1.67 → 0.596–0.618 ms and removed 34,061 unnecessary run objects; the browser table above is the workload result.

## Quality and verification

At a fixed effect time and identical camera centre, **all 24 full-frame RGBA pairs are byte-identical**, with zero changed pixels/channels and maximum channel delta zero. Each buffer is 3200 × 1930. For each effect cutoff, the scales are 0.0649, 0.065, 0.0999, 0.1, 0.1001, 0.2249, 0.225, 0.2251, 0.6999, 0.7, 0.7001 and 0.9. Both sides of the effect and LOD boundaries are covered with normal native/MSAA rendering. These checks cover the WebGL scene; MiniMap equality and meaningful paint updates have separate browser regressions.

The new MiniMap hidden-only test was RED on the old bundle: identical PNG bytes but picture count expected 1, received 4. A companion preservation case verifies a real colour rule and reentrant geometry mutation still refresh. The corrected bundle passed all 54 Chromium MiniMap tests and the two new WebKit cases. Backend regressions cover stable camera order, actual hidden-part reveal/base override, opaque-only geometry in the alpha envelope, native inactive-effect boundaries, and fixed pixels. Final integration checks passed: 1,952 passed core tests in 186 suites (6 todo), 9 snapshots, package builds and all workspace typechecks, 323 Chromium browser tests and 4 unique targeted WebKit cases. Lint completed with zero errors and 9 warnings; the scoped MiniMap/Storybook checks were clean, and the motion-control self-check passed. The final measurement harness reports no page or GL errors. The parent task records the final commit.

Two limitations remain with the current implementation. First, ETL's minimalistic-only body tint changes the actual style table at the LOD boundary, so the MiniMap must repaint its picture twice per zoom. Second, the first schematic visit lazily mounts 670 anchor elements with 160 bounds/primitive updates; its original roughly 4.68 MB non-path upload is not repeated on warmed camera motion. Neither cost is suppressed by disabling UI features.

## Rejected experiments

The diagnostic sequence was necessary to avoid accepting one isolated metric:

- An all-LOD/all-part envelope removed global sorts but expanded false overlaps. With effects active at all scales, it produced 739 median / 903 p95 far draw calls versus 41 and regressed CPU p95 to 17.1 ms. Excluding hidden glows shrank every block hull, but opaque bodies of owners without visible translucent paint still created unnecessary alpha constraints. Filtering actual emitted alpha primitives was the useful correction.
- A new retained-range coalescer and a lower threshold improved some grouping but rebuilt after detailed hidden changes, causing roughly 33–34 ms p95 CPU. An adaptive guard avoided that stall, but the emitted-alpha correction made the additional coalescer/gating changes unnecessary. They were reverted; the original coalescer and threshold 512 are retained.
- The clip cache, exact-AABB refinement after grid collisions and removal of an extra local padding term did not show sufficient CPU benefit. They were not retained. No per-LOD schedule cache, worker renderer, raster graph cache, AA reduction or effect restriction was introduced.

A short cold gate observed a 342 ms rAF outlier that did not reproduce after the full warmed path; its cause was not established. It is not presented as a confirmed shader or coalescer failure. Final acceptance uses the complete paired/counterbalanced motions above, including their maximum intervals.

## Evidence

The companion JSON stores the final per-run percentiles, counts and image hashes: [2026-11-17-etl-camera-motion.json](2026-11-17-etl-camera-motion.json). Large frozen sources, bundles, raw frames and exploratory logs remain in `/private/tmp/graph-etl10k-camera-c33cc8dc/` rather than package dependencies.

Key artifacts there: `source.tar` and `baseline.js`; `final5.js`; `run-light.cjs` and `final-validation.cjs`; `final5-{default,active}-*.json`; `final5-*-pixels/`; `final-summary.json`. Earlier `actual-default`, toggle-ablation, helper-profile and ghost-bound logs preserve the causal investigation. The separate Storybook motion-control smoke verifies real UI start/stop/restart behaviour. No worker/offscreen-renderer conclusion follows from this experiment.
