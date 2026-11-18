# Addressed entity updates and scene visibility

The candidate is the working-tree patch over `89b4f09c`, measured on Apple M3 Pro with Chromium 145, ANGLE Metal, and DPR 2. The ETL at Scale story has 10,000 blocks and 10,000 links. The frozen Nirvana Max layout has 13,916 blocks and 18,604 resolved links. Each fixture ran with MiniMap off and one attached WebGL context. The [measurement artifact](2026-11-18-addressed-entity-updates.json) records the production diff hash, bundle and fixture hashes, per-pass counts, raw intervals, phases and pixel checks.

## Update path

- `Graph.updateEntities` keeps its batch, merge behavior and collection snapshot notifications. When touched rows keep their view identity, the stored state drives those views directly. Changes to membership, view class or mounting retry reconcile the list. Extensions with custom parent-prop factories or hooks keep their prior reconciliation behavior. Identical parent props stop reaching unrelated retained views on the addressed path.
- A paint-only style row with identical hidden parts can reuse the current overlap and filtered schedule. Changes to owner visibility and uploaded predicate records refresh the affected resident chunks. Full visibility refresh is retained for global predicate changes. The schedule still accounts for the same scale ranges, custom effects, widths, depth and geometry.
- When a depth or membership change rebuilds overlap levels, the resulting exact delta includes owners whose level changes to the implicit zero. Retained buckets can reuse unaffected sources and patch affected owners when layout provenance permits. Full overlap rebuilds and some whole-run filtering remain.

## Frame gaps over 16.7 ms

The edit test alternates a forward edit and restore in a warmed mounted graph. It observes rAF timestamps through each action and its 120 ms settling window, then waits two callbacks to capture the tail. All observed intervals are counted, including short intervals during settling. The denominator can grow as frame cadence improves. The edit-window column reports whether each operation had any over-budget interval. Each build has two passes of 24 operations, in baseline, candidate, candidate, baseline order. Timestamps are differenced and rounded to one microsecond before the strict 16.7 ms comparison. Physical display presentation is outside the measurement.

| Story | Action | rAF gaps >16.7 ms | Edit windows with a miss | rAF p95, ms | Longest gap, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | Ten positions and one reconnect | 50/404 → 43/674 | 48/48 → 41/48 | 66.7 → 24.9 | 134.0 → 50.2 |
| Nirvana | Ten positions and one reconnect | 48/409 → 47/643 | 48/48 → 47/48 | 66.7 → 25.0 | 150.4 → 58.3 |
| ETL | Stage paint, same visible parts | 10/737 → 0/767 | 10/48 → 0/48 | 9.3 → 9.1 | 25.5 → 16.1 |
| ETL | Stage tag, different visible parts | 11/723 → 8/740 | 11/48 → 8/48 | 16.2 → 9.2 | 25.6 → 24.9 |
| ETL | Stage action and attached flow | 48/474 → 48/608 | 48/48 → 48/48 | 58.3 → 33.3 | 83.8 → 58.6 |
| ETL | Select ten blocks and one link | 53/534 → 57/591 | 48/48 → 48/48 | 41.7 → 33.3 | 83.2 → 67.5 |
| Nirvana | Select ten blocks and one link | 38/662 → 41/655 | 31/48 → 30/48 | 16.8 → 24.9 | 33.4 → 42.3 |

The phased CPU measurements and action-to-rAF are medians. The latter includes elapsed time before and during the callback, so its budget differs from consecutive rAF timestamps.

| Story | Action | Scheduler outside backend, ms | Backend draw, ms | Order inside backend, ms | Action to rAF, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | Ten positions and one reconnect | 56.8 → 4.7 | 15.8 → 23.6 | 6.2 → 7.1 | 80.9 → 35.9 |
| Nirvana | Ten positions and one reconnect | 54.7 → 4.8 | 17.8 → 29.2 | 0.0 → 0.0 | 80.8 → 40.9 |
| ETL | Stage paint, same visible parts | 0.4 → 0.4 | 17.8 → 5.1 | 0.0 → 0.0 | 25.9 → 13.6 |
| ETL | Stage tag, different visible parts | 0.4 → 0.4 | 18.6 → 17.4 | 0.1 → 0.0 | 27.2 → 25.4 |
| ETL | Stage action and attached flow | 0.5 → 0.7 | 61.3 → 38.9 | 50.4 → 28.0 | 70.1 → 47.8 |
| ETL | Select ten blocks and one link | 3.1 → 3.8 | 45.3 → 31.3 | 33.9 → 21.6 | 57.1 → 50.7 |
| Nirvana | Select ten blocks and one link | 5.6 → 5.2 | 17.3 → 16.8 | 0.0 → 0.0 | 33.6 → 37.5 |

Both builds encoded and uploaded the same path source bytes for every matched direction of each edit. The partial layout patch still prepares an entire mixed path plan on Nirvana. Its command, span, record and instance counts matched across builds. Backend time was higher in the candidate's partial edit runs even as pre-draw time and frame tails fell. The timing comparison alone cannot attribute the backend increase. ETL stage action and selection still miss the deadline in every edit window. A diagnostic on the earlier visibility-only candidate showed full overlap rebuilds of about 16,500 owners for these actions, with only 1–5 numeric levels changing.

## Warm camera replay

This control warms the actual camera trajectory, then measures two 120-frame passes per build in ABBA order. Pan follows the same circle at the overview scale, 0.0251 for ETL and 0.01 for Nirvana. Zoom traverses 0.01 through 0.95 and back. The view stays centered on the same world coordinate in both builds.

| Story | Camera action | rAF gaps >16.7 ms | rAF p95, ms | Longest gap, ms | Path source bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | pan | 0/240 → 0/240 | 9.0 → 8.9 | 9.3 → 9.4 | 0 → 0 |
| ETL | zoom | 10/240 → 7/240 | 16.7 → 16.7 | 33.4 → 38.4 | 0 → 0 |
| Nirvana | pan | 61/240 → 61/240 | 24.9 → 17.6 | 33.4 → 33.7 | 0 → 0 |
| Nirvana | zoom | 18/240 → 25/240 | 17.3 → 16.9 | 35.1 → 25.0 | 0 → 0 |

At the secondary threshold above 17 ms, the Nirvana zoom count goes from 14 to 11. Most of the increase at the strict threshold lies near 16.7 ms. In the separate first detail visit during the edit series, ETL wrote 15,520 path source bytes in each pass as lazy anchors mounted. Both builds did the same work on that boundary. The warm camera replay keeps anchor creation outside the measured samples.

## Visual and API checks

All 42 pairs of fixed-time whole-frame WebGL readbacks match byte for byte across fit, 0.35 and 0.8. The poses include forward and restored partial updates, status color, changed visible effect parts, the stage action and selection where the story supports them. In the 10 detailed ETL comparisons containing HTML cards, the card and anchor layout, style, state text and controls also match. The browser probes verify resolved endpoints, one context and no GL errors. Unit regressions exercise public list notifications, merge behavior, ordered insertion, class changes, retry after a custom constructor fails, delegated ports and picking.

Verification on the measured source passed all workspace type checks, 1,988 Graph unit tests, 189 React unit tests, and 126 targeted Chromium Metal tests for rendering and interaction. Six Graph tests are marked todo and four React tests are skipped.

The remaining edit misses concentrate in order and command preparation on ETL and the mixed path plan on Nirvana. The camera control measures the existing overview GPU load on the Storybook fixture. Production Nirvana integration and compositor presentation timing remain outside this check.
