# Retained draw commands on ETL and Nirvana

On ETL at Scale, retaining prepared command groups cut edit windows over 16.7 ms from 31 to 17 for a stage change and from 27 to 11 for a reconnect, out of 48 each. Changing the style tag alone went from 8 misses to zero. Moving a 19-block group still missed in 44 of 48 windows. Nirvana Max reached a different connection rendering path at fit and showed no consistent improvement across edits. [Measurements, samples and build hashes](2026-11-18-retained-command-groups.json)

## Edits at fit

ETL used 10,000 blocks and 10,000 connections. Frozen Nirvana Max used 13,916 blocks and 18,604 resolved connections. Both ran with MiniMap off on Apple M3 Pro, Chromium 145, ANGLE Metal, 1600 × 1000 viewport and DPR 2. Each WebGL setup had one attached WebGL context. Canvas used the previous build's attached Canvas2D interpreter. [Previous WebGL baseline](2026-11-18-local-command-updates.md)

Each build ran two passes in symmetric order, with eight warm-ups and 24 measured edits per action per pass. Each window covered the edit, 120 ms settling and two further requestAnimationFrame (rAF) callbacks. Each cell shows **intervals over 16.7 ms / all intervals (windows with any such interval / 48)**, after rounding to one microsecond. Faster cadence can produce more intervals in a window. The last column gives p95 edit-to-first-rAF in previous / retained / Canvas order.

| Story and action | Previous WebGL | Retained WebGL | Canvas | Edit-to-rAF p95, ms |
| --- | ---: | ---: | ---: | ---: |
| ETL, stage action with connected flows | 31/702 (31/48) | 17/725 (17/48) | 48/593 (48/48) | 38.3 / 31.7 / 54.0 |
| ETL, stage actions at eight locations | 27/695 (27/48) | 21/714 (21/48) | 48/586 (48/48) | 46.5 / 41.8 / 55.4 |
| ETL, switch running/failed style tag | 8/750 (8/48) | 0/768 (0/48) | 48/603 (48/48) | 26.1 / 16.2 / 54.4 |
| ETL, select/deselect a connection | 12/732 (12/48) | 4/754 (4/48) | 48/611 (48/48) | 29.4 / 26.1 / 53.2 |
| ETL, reconnect/restore a connection | 27/706 (27/48) | 11/734 (11/48) | 48/611 (48/48) | 36.5 / 30.3 / 53.9 |
| ETL, move a connected block | 5/753 (5/48) | 2/766 (2/48) | 48/593 (48/48) | 27.4 / 23.9 / 56.4 |
| ETL, drag a 19-block group | 41/658 (41/48) | 44/665 (44/48) | 48/595 (48/48) | 46.9 / 44.7 / 53.2 |
| Nirvana, select/deselect a connection | 25/718 (25/48) | 24/699 (24/48) | 49/597 (48/48) | 36.6 / 39.5 / 63.4 |
| Nirvana, reconnect/restore a connection | 37/676 (37/48) | 40/675 (40/48) | 48/536 (48/48) | 44.7 / 43.9 / 75.0 |
| Nirvana, move a connected block | 29/701 (29/48) | 31/701 (31/48) | 48/557 (48/48) | 39.7 / 38.7 / 70.9 |

All 1,440 edit windows included a draw and matched on edited IDs, graph sizes, endpoint, selection, status and coordinates. Block movement used the graph API. Group movement used the drag handlers and verified all 19 member positions. Physical display presentation and pointer delivery are outside these timings.

## Navigation

Each pass used 48 warm-up camera updates and 100 measured updates, one per rAF. Pan followed a circle with a radius of 180 CSS pixels at fit. Zoom moved from fit to 0.95 and back. Each table cell gives **intervals over 16.7 ms / 200 (p95 interval in ms)**. Both WebGL builds recorded zero path geometry encodes and zero path-record upload bytes throughout every measured pan and zoom pass.

| Story and movement | Previous WebGL | Retained WebGL | Canvas |
| --- | ---: | ---: | ---: |
| ETL pan | 0/200 (9.1) | 1/200 (9.2) | 172/200 (41.7) |
| ETL zoom | 13/200 (24.9) | 12/200 (17.2) | 43/200 (33.2) |
| Nirvana pan | 36/200 (17.6) | 38/200 (17.6) | 182/200 (41.6) |
| Nirvana zoom | 13/200 (17.1) | 5/200 (16.7) | 69/200 (42.6) |

## What the renderer retains

The translucent scheduler repairs the physical pages and painter positions touched by an edit. The visibility filter retains group contents and joins adjoining runs, including boundaries spanning empty groups. The backend caches the physically clipped commands and packed stock fragments. Changes to clipping, curve detail or active programs invalidate the affected groups. Shader inputs, hit testing, painter order and public scene APIs keep their existing contracts.

An instrumented run checked object identity across eight edits per case, separately from the cadence runs. On ETL the repeated stage action reused 82 of 90 clipped command groups and 81 of 89 packed fragments. A tag change rebuilt only two groups, a reconnect rebuilt three, and the 19-block group drag rebuilt 36 of 91. The eight-location test saw 2–30 groups rebuilt per edit and up to 69 previously packed fragments move in order while retaining their contents. The Nirvana fit cases bypassed this grouped path.

In that run, median time inside the edit and scheduler combined fell from 28.85 to 22.10 ms for a repeated stage action, from 19.20 to 7.85 ms for a tag change and from 27.85 to 22.50 ms for a reconnect on ETL. The group drag still used 33.90 ms, including 12.15 ms inside translucent visibility preparation.

The renderer still visits group metadata and assembles spans for GPU submission when the combined plan changes. An insertion can shift references in the contiguous submission list and change offsets in the packed draw-ID buffer. Dense edits, missing change history and stock-program limits still have full-build paths. The root-depth check and mixed-plan rebuild on Nirvana are separate work in the [performance plan](../plans/2026-11-17-resident-path-performance.md).

## Image and state equivalence

Both retained WebGL builds matched the previous WebGL framebuffer byte for byte in all 54 comparisons. Captures used animation time 2.5, both edit directions, and fit, 0.35 and 0.8 zoom. Twelve detailed ETL snapshots also matched card content, classes, layout and HTML anchor geometry. Canvas supplied the timing comparison. [Frame hashes and metadata](2026-11-18-retained-command-groups.json)

The full Graph unit suite passed 2,014 tests and nine snapshots across 192 suites, with six existing todo cases. Differential tests compare retained output with a fresh build through separated edits, joined boundaries, physical slot reuse, visibility changes, custom program barriers, source limits and broad invalidations. Workspace type checking, scoped formatting and lint passed. Lint reported 29 warnings.

All 126 targeted Chromium Metal browser tests passed on the final build, with zero flaky or skipped tests. They covered rendering order, stock and custom effects, HTML handover, geometry, connection editing, delegated group ports and command-cache release after deleting connections.

## Final build and Nirvana reconnect

The complete edit and camera matrices above apply to build `3c6fb02a2de5`. The final build, `612139d8b621`, also releases the cached command snapshot when the last retained path is removed and reorders imports for lint. A separate WebGL comparison of Nirvana reconnect, with two 24-edit passes per build in ABBA order, recorded 44/661 long intervals previously and 32/690 on the final build (44 and 32 windows out of 48). Backend p95 was 34.1 and 31.9 ms respectively. The direction reverses between this repeat and the full matrix.

Each of 16 diagnostic reconnects per build used the existing mixed-plane path. Endpoint geometry, command/span checksums and uploads matched. Each edit had five draws, one mixed command, 55,237 spans and two source encodes. Median mixed-plane preparation took 25.85 and 22.00 ms respectively. The root-depth window, including its setup, took 6.80 and 7.20 ms.

The final ETL repeat used 32 edits per action and build. Stage changes recorded 22/464 long intervals previously and 5/489 on the final build. Group drag recorded 28/436 and 23/456, with backend p95 falling from 34.8 to 28.4 ms. Group drag remains over budget in most edit windows in both comparisons.

The `finalBuildVerification` data includes final source and harness hashes, repeat samples, execution checks and the 54 final image comparisons. [Final build evidence](2026-11-18-retained-command-groups.json)
