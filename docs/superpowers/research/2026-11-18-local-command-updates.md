# Local command and visibility updates

The baseline includes the [local overlap updates](2026-11-18-local-overlap-updates.md) over `89b4f09c`. The changed code runs in the shared WebGL renderer. Both stories use one attached WebGL context with MiniMap off. ETL has 10,000 blocks and 10,000 connections. Frozen Nirvana Max has 13,916 blocks and 18,604 resolved connections. Apple M3 Pro, Chromium 145 with ANGLE Metal, 1600 × 1000 viewport, DPR 2. [Raw samples and build hashes](2026-11-18-local-command-updates.json)

The retained span journal covers several edits between draws, including deletion, reinsertion at the same ID, and slot reuse by another owner. Changed shape and painter position entries patch the affected physical pages. Adjacent command spans are canonicalized in painter and source order, including custom program boundaries. Missing journal history, a changed source layout or a broad rewrite can use the exact fresh preparation path.

Visibility changes publish the exact physical slot intervals which flipped. The filter keeps groups of stable canonical order parts. Each group records the raw shader visibility query ranges once and caches the filtered body until those ranges or a relevant gap changes. Non-path gaps and cross-group joins use the same decisions as the reference schedule. Cached groups are reused across shifted indices, and a size guard bounds fragmented group metadata. The renderer still walks command metadata and emits a complete visible draw list. This change scopes recomputation of command bodies and visibility predicates.

## Frames longer than 16.7 ms

Two passes of 24 warmed edits per build in ABBA order, using eight warm-up repeats per action. ETL includes a repeated stage action and a fixed sequence of eight connected stages across the layout with different statuses. Both stories also run selection and an endpoint reconnect with restore. Nirvana's frozen graph does not have ETL stage actions. Its measured poses use the stock connection ordering path outside the changed translucent scheduler.

The harness counts rAF intervals during the action, its 120 ms settling window and two more callbacks. It rounds to one microsecond before the strict threshold. Faster cadence can result in more observed short intervals, so the per-edit column holds the denominator at 48. Actual compositor presentation lies outside this measurement.

| Story | Action | rAF intervals >16.7 ms | Edit windows with a miss | p95 interval, ms | Longest interval, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | Stage action and attached flows | 41/668 → 37/690 | 41/48 → 37/48 | 24.9 → 16.8 | 34.1 → 25.9 |
| ETL | Stage actions at eight locations | 40/668 → 27/695 | 40/48 → 27/48 | 24.9 → 16.6 | 34.2 → 42.6 |
| ETL | Stage tag with different visible parts | 11/736 → 19/731 | 11/48 → 19/48 | 9.4 → 15.7 | 17.6 → 17.7 |
| ETL | Select or deselect one connection | 24/700 → 14/743 | 24/48 → 13/48 | 16.7 → 9.3 | 25.9 → 17.6 |
| ETL | Select or deselect ten blocks and one connection | 39/674 → 19/723 | 31/48 → 16/48 | 16.9 → 16.5 | 25.5 → 25.0 |
| ETL | Reconnect one connection and restore | 34/687 → 35/694 | 34/48 → 35/48 | 16.7 → 16.8 | 33.4 → 25.9 |
| Nirvana | Select or deselect one connection | 29/695 → 30/697 | 27/48 → 28/48 | 16.7 → 16.7 | 25.7 → 25.9 |
| Nirvana | Select or deselect ten blocks and one connection | 32/668 → 34/675 | 26/48 → 28/48 | 16.7 → 16.8 | 42.3 → 34.1 |
| Nirvana | Reconnect one connection and restore | 47/660 → 48/654 | 47/48 → 48/48 | 25.0 → 25.0 | 34.2 → 34.1 |

| Story | Action | Order median, ms | Visibility method median, ms | Backend draw median, ms | Action-to-rAF median, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| ETL | Stage action and attached flows | 16.35 → 9.00 | 5.80 → 6.35 | 30.45 → 24.20 | 38.95 → 33.40 |
| ETL | Stage actions at eight locations | 16.15 → 8.25 | 5.60 → 6.75 | 28.50 → 23.45 | 37.30 → 32.45 |
| ETL | Stage tag with different visible parts | 0.10 → 0.10 | 12.30 → 6.10 | 18.90 → 17.05 | 27.35 → 25.40 |
| ETL | Select or deselect one connection | 10.75 → 4.95 | 5.90 → 2.30 | 21.25 → 12.25 | 32.90 → 24.75 |
| ETL | Select or deselect ten blocks and one connection | 9.30 → 4.20 | 5.10 → 2.00 | 18.85 → 10.95 | 36.40 → 26.15 |
| ETL | Reconnect one connection and restore | 12.85 → 12.85 | 6.40 → 3.20 | 25.40 → 23.90 | 35.00 → 33.35 |
| Nirvana | Select or deselect one connection | 0.00 → 0.00 | 0.00 → 0.00 | 17.75 → 18.60 | 33.80 → 32.85 |
| Nirvana | Select or deselect ten blocks and one connection | 0.00 → 0.00 | 0.00 → 0.00 | 16.25 → 16.70 | 37.00 → 33.70 |
| Nirvana | Reconnect one connection and restore | 0.00 → 0.00 | 0.00 → 0.00 | 28.70 → 29.55 | 39.60 → 39.80 |

The first ABBA candidate rebuilt every queried raw interval whenever a group's visibility changed and increased long gaps for the repeated stage. That candidate was replaced by the static raw provenance measured above. Active part proofs and source checks are independent of story kinds, status labels, graph sizes and zoom settings.

## Visual and API equivalence

All 66 paired fixed-time WebGL snapshots match byte for byte across overview, 0.35 and 0.8 scales. All 14 detailed ETL HTML card comparisons match including anchor layout. Matched edits have identical path source encodes and upload bytes. The browser checks preserve entity counts, resolved endpoints, exact UI state and no GL errors. Differential tests compare against the independent flat scheduler and filter through arbitrary sources, holes, mixed edits, visibility, and missed revisions. The public API and style/hit-test inputs are unchanged.

Workspace type checks, 2,002 Graph unit tests and 126 targeted Chromium Metal tests passed. The browser test set includes context recovery, custom effects, zoom and LOD, hit order, connection editing and delegated group ports. Scoped lint reported zero errors and 13 warnings.

Performance coverage is warm Storybook editing and does not extend to production Nirvana or physical display presentation.

## Where a single stage edit spends the frame

A follow-up used the frozen candidate from the comparison above. It measured the overview at fit on the same hardware, with the MiniMap off. A Chromium CPU profile covered 36 edits per action. A separate pass compared object identities and exact command values for 12 edits per action. The profile estimates below are sampled self time divided by the number of edits. The wall-time medians above come from the original ABBA run.

| Observation per edit | One stage and its flow | Stage tag only |
| --- | ---: | ---: |
| Owners whose overlap level changed | 3 | 0 |
| New order part objects / total parts | 103–104 / 65,613–65,614 | 0 / 65,613 |
| Filter groups with a new cached body / total | 85 / 575 | 2 / 575 |
| Visible range values absent from the previous frame | 2–3 of 21,424–21,425 | 1–2 of 21,424–21,425 |
| Path source bytes written | 800–1,280 | 0 |
| Final draw calls | 6 | 6 |

A range value is the triple (source, first physical instance, instance count). The membership comparison alone cannot establish the order or multiplicity of shared triples. The order-part count describes the renderer's intermediate CPU representation.

For the full action, materializing the combined order cost about 3.33 ms of sampled self time per edit. Patching retained pages cost 2.08 ms. Preparing visibility dependencies for new groups cost another 1.99 ms. For the tag alone the same order array survived every edit. The intersection search used to validate cached filter groups cost 2.63 ms of sampled self time per edit, and counting draw groups cost 1.76 ms. The scene caches group contents, then traverses the group metadata, joins group boundaries and emits a flat list of visible ranges for the next preparation stage. The full-action profile points to that representation boundary as the next candidate for a broader change.

Nirvana Max used a different schedule in the previous comparison. On its single-edge selection, building the mixed plan took a median 11.3 ms within an 18.6 ms backend draw. Reconnect took 11.8 ms in that builder within a 29.55 ms draw. These timings support reusing unchanged ranges when preparing that plan. The gain would require a separate measurement on this fixture.

### Sparse visibility changes

Both a group's cached query intervals and a source's changed intervals are sorted and disjoint. A diagnostic trial iterated the shorter list and looked up each interval in the longer one. A replay of 9,836 real source/group intersection checks gave the same answers in both implementations. The median isolated time per edit went from 0.600 to 0.038 ms for the stage action and from 0.303 to 0.031 ms for the tag. This replay covered four edits per action, each run in ten paired, alternating timing blocks.

The library now applies the shorter-list search in its shared visibility filter. A new ABBA comparison used the exact source-built candidate and its previous frozen bundle. Every pass included eight warm-up edits and 24 timed edits per scenario. Both builds used one WebGL context and the MiniMap was off.

| Action | rAF intervals >16.7 ms | Edit windows with a miss, out of 48 | p95 rAF, ms | Visibility median, ms | Backend median, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| ETL, stage and connected flow | 35/689 → 26/698 | 35 → 26 | 16.8 → 16.7 | 8.5 → 6.7 | 25.3 → 23.55 |
| ETL, eight stages | 29/695 → 32/692 | 29 → 32 | 16.7 → 16.7 | 7.7 → 6.85 | 24.05 → 24.25 |
| ETL, tag only | 8/749 → 3/766 | 8 → 3 | 9.3 → 9.2 | 6.3 → 4.25 | 15.8 → 14.2 |
| Nirvana, single-edge selection | 25/708 → 18/713 | 23 → 17 | 16.7 → 16.6 | 0 → 0 | 16.7 → 15.7 |
| Nirvana, reconnect | 41/668 → 47/664 | 41 → 47 | 25 → 25 | 0 → 0 | 27.9 → 27.45 |

The tag-only filter was cheaper in both pairs. For status changes at different locations the cheaper filter did not translate into fewer deadline misses in the source-built comparison. The scratch pilot had the opposite direction for that scenario. Nirvana never entered the changed filter in either control, so variation there cannot be attributed to this predicate. Across the source-built pair all 18 fixed-time WebGL frame comparisons matched byte for byte, including the four detailed HTML card and anchor comparisons. All 2,002 current Graph unit tests and the package type check passed. The sparse lookup regression test also failed against the old implementation, which inspected the changed interval 128 times.

The next architectural experiment can preserve unchanged painter-order groups through final command preparation and repair the touched groups together with their neighboring joins. Any implementation needs to preserve the exact sequence where translucent primitives and custom programs meet. The remaining budget must be verified on both local edits and wide changes. [Profile, source hashes, fixed-time image hashes and per-edit timing](2026-11-18-status-command-profile.json)

### How many visible commands change position

The follow-up compared the exact sequence of visible (source, first instance, count) tuples before and after real edits in the current ETL 10k/10k build at fit, with one WebGL context and MiniMap off. An offline longest common subsequence check accounts for relative order. Applying the disjoint edits to the preceding sequence reproduced every tuple in the next one.

For the repeated stage action, 21,419 of the previous 21,425 ranges kept their relative order. One shortest edit script used six deletions and five insertions in eight regions. A single replacement from the first change to the last would span 12,094 positions in the original sequence. The tag alone took one deletion and two insertions. Both results repeated on the second cycle.

Across two successive actions at each of eight connected stages, the 16 edits took 1–52 insertions plus deletions in 1–36 disjoint regions. Even the largest edit retained 21,403 of 21,430 previous ranges in order. Two stages started queued and ended paused after the two actions. A second sweep followed 16 warm-up edits. All eight stages returned to their starting status at the end of the 16 measured edits. Each edit took 2–54 insertions plus deletions in 2–36 regions. The largest case kept 21,398 of 21,427 previous ranges in order (99.86%). [Exact edit regions, stage IDs and retained ranges](2026-11-18-status-command-profile.json)

These structural measurements describe what an incremental scheduler could reuse. The implementation should carry its existing change information forward. Computing a longest common subsequence from complete arrays belongs in the verification harness.
