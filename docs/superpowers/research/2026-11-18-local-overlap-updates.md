# Local overlap updates on ETL and Nirvana

The baseline is the previously measured [addressed-update working tree](2026-11-18-addressed-entity-updates.md) on top of `89b4f09c`. The candidate changes the private overlap grid and its tests. Apple M3 Pro, Chromium 145 with ANGLE Metal, 1600 × 1000 viewport, DPR 2. ETL has 10,000 blocks and 10,000 connections. The frozen Nirvana Max fixture has 13,916 blocks and 18,604 resolved connections. Both have MiniMap off and one attached WebGL context. [Raw observations and build hashes](2026-11-18-local-overlap-updates.json)

## Scope of recomputation

The stage action can add or remove the translucent footprint of an attached connection. Selection can move the connection to another painter band. Previously either change rebuilt grids for roughly 16,500 owners. The grid now keeps resident slots within each band and repairs the edited boxes, their old and new neighbors, and successors whose levels depend on them. The final depth order governs that repair. Band bases still follow the prefix count, so any numerically shifted upper owner reaches the existing draw-bucket delta. A dense cascade can rebuild its affected band within the existing work bound. A broad edit or an unsupported band partition uses the full rebuild. The API, styling rules and hit order have the same inputs.

Seeded differential tests compare mixed adds, removes, moves and raises with a fresh full computation. The dense fallback regression changes membership in a band of 512 overlapping owners and checks the exact level delta while the upper grid is reused.

## Frame budget

Both builds replay the same warmed actions at overview scale. The ETL scenario uses the story's stage action and attached flow update. The Nirvana fixture has no stage action, so its common workload is selection. Each build has two passes of 24 operations in ABBA order after eight warm-up repeats per action. The harness counts consecutive rAF intervals through the action, its 120 ms settling window and two following callbacks. It rounds the input interval to one microsecond before applying the strict 16.7 ms threshold. The edit-window column keeps the same 48 opportunities per build even when faster updates permit more callbacks.

| Story | Action | rAF intervals >16.7 ms | Edit windows with a miss | p95 interval, ms | Longest interval, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | Stage action and attached flow effect | 48/619 → 34/679 | 48/48 → 34/48 | 33.2 → 24.2 | 41.9 → 33.6 |
| ETL | Select or deselect one connection | 45/656 → 16/720 | 44/48 → 16/48 | 24.9 → 16.0 | 34.0 → 25.1 |
| ETL | Select or deselect ten blocks and one connection | 50/639 → 21/692 | 45/48 → 21/48 | 25.1 → 16.6 | 41.7 → 25.4 |
| ETL | Stage tag with changed visible parts | 21/733 → 7/752 | 21/48 → 7/48 | 9.5 → 9.2 | 25.1 → 17.3 |
| ETL | Stage paint with the same visible parts | 0/769 → 0/765 | 0/48 → 0/48 | 9.1 → 9.1 | 11.3 → 12.5 |
| Nirvana | Select or deselect one connection | 33/697 → 27/699 | 33/48 → 27/48 | 16.7 → 16.7 | 25.9 → 25.5 |
| Nirvana | Select or deselect ten blocks and one connection | 44/658 → 26/694 | 31/48 → 23/48 | 24.7 → 16.7 | 42.0 → 25.3 |

| Story | Action | Overlap update median, ms | Full order method median, ms | Backend draw median, ms | Input to rAF median, ms | Boxes in grid compute median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ETL | Stage action and attached flow effect | 16.45 → 0.20 | 26.15 → 14.20 | 36.85 → 28.65 | 45.75 → 37.25 | 16518.5 → 0 |
| ETL | Select or deselect one connection | 14.05 → 0.10 | 20.00 → 8.05 | 29.40 → 17.85 | 40.50 → 29.15 | 16519 → 0.5 |
| ETL | Select or deselect ten blocks and one connection | 13.50 → 0.15 | 19.40 → 8.30 | 28.25 → 17.05 | 42.25 → 33.50 | 16519 → 0.5 |
| ETL | Stage tag with changed visible parts | 0.10 → 0.10 | 0.10 → 0.10 | 17.30 → 13.65 | 26.30 → 22.05 | 0 → 0 |
| ETL | Stage paint with the same visible parts | 0.00 → 0.00 | 0.00 → 0.00 | 5.85 → 5.30 | 13.90 → 13.90 | 0 → 0 |
| Nirvana | Select or deselect one connection | 0.00 → 0.00 | 0.00 → 0.00 | 18.50 → 17.80 | 33.75 → 32.80 | 0 → 0 |
| Nirvana | Select or deselect ten blocks and one connection | 0.00 → 0.00 | 0.00 → 0.00 | 17.50 → 14.45 | 37.00 → 33.10 | 0 → 0 |

The boxes column counts only full grid construction. It excludes neighbors visited by the local repair. The action-to-rAF measurement includes waiting for the callback and its execution overhead. Nirvana uses its dedicated stock-path order on the measured selection poses, so the translucent overlap grid is outside that path. Its measurements are a regression control for this change.

## Output and contracts

All 54 paired fixed-time WebGL readbacks match byte for byte across overview, 0.35 and 0.8 scales. The paired captures cover forward and restored stage tags, effects, selection and partial updates where each story supports them. The 12 detailed ETL states with HTML also match in card layout, status and anchors. Geometry encodes and path source bytes match across the timed edit pairs. The harness verified entity counts, resolved endpoints, one attached context and no GL errors.

Workspace type checks, 1,991 Graph unit tests, and 126 targeted Chromium Metal browser tests passed. Six pre-existing unit tests are marked todo. Browser coverage includes custom effects, picking and delegated group ports.

Production Nirvana integration and physical display presentation lie outside these Storybook rAF measurements.
