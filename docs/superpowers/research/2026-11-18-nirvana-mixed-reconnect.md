# Reconnecting a path in the Nirvana mixed pass

Repeatedly reconnecting one visible edge on Nirvana Max reduced edit windows with a frame interval over 16.7 ms from **43/48 to 4/48**, with **48/48** on Canvas. When each edit touched a different connection for the first time, the count fell from **48/48 to 37/48**, with **48/48** on Canvas. In that harder workload, Canvas still completed the slowest 5% of draws sooner. On ETL 10k/10k, reconnect went from **12/48 to 16/48** long windows and took a different rendering path. [Raw observations, build hashes and image comparisons](2026-11-18-nirvana-mixed-reconnect.json)

## Frame timings

Frozen WebGL builds `612139d8b621` and `208b3db8a2e2` ran in previous/updated/updated/previous order on Chromium 145 with ANGLE Metal on Apple M3 Pro. Both stories used a 1600 × 1000 viewport, DPR 2, one WebGL context and MiniMap off. The Canvas2D timings come from two earlier passes on the same fixture, action sequence, camera, hardware and timing harness. Their frames were drawn by the Graph Canvas interpreter.

Each edit pass includes eight warm-up actions and 24 measured actions. The interval clock starts before the input and ends after a 120 ms settle window plus two rAF callbacks. The table shows **long rAF intervals / all intervals (windows containing one / 48)**. A long interval exceeds 16.700 ms after rounding to the nearest microsecond. Input-to-rAF and draw duration measure different parts of the interaction. Percentiles use the nearest rank. Faster rendering can produce more callbacks in the same window.

| Story and action | Previous WebGL | Updated WebGL | Canvas | Input-to-rAF p95, ms, in the same order |
| --- | ---: | ---: | ---: | ---: |
| Nirvana, reconnect/restore the same edge | 43/659 (43/48) | 4/760 (4/48) | 48/578 (48/48) | 46.3 / 28.3 / 68.2 |
| Nirvana, first reconnect of 24 different edges per pass | 48/550 (48/48) | 37/636 (37/48) | 48/543 (48/48) | 89.9 / 69.3 / 61.8 |
| Nirvana, select/deselect a connection | 35/691 (35/48) | 31/704 (29/48) | 48/604 (48/48) | 36.9 / 39.9 / 58.8 |
| Nirvana, move a connected block | 36/696 (36/48) | 0/767 (0/48) | 48/625 (48/48) | 38.7 / 18.3 / 58.6 |
| ETL, reconnect/restore a connection | 12/724 (12/48) | 16/721 (16/48) | 48/603 (48/48) | 31.7 / 34.6 / 54.7 |
| ETL, select/deselect a connection | 6/752 (6/48) | 2/753 (2/48) | 49/597 (48/48) | 27.7 / 27.7 / 54.0 |
| ETL, change a stage and its incident flows | 18/728 (18/48) | 20/719 (20/48) | 48/599 (48/48) | 33.0 / 33.5 / 52.3 |
| ETL, move a connected block | 1/767 (1/48) | 0/768 (0/48) | 48/580 (48/48) | 23.1 / 23.0 / 53.9 |
| ETL, drag 19 grouped blocks | 48/672 (46/48) | 35/679 (35/48) | 49/581 (48/48) | 46.2 / 42.8 / 67.7 |

On the repeated Nirvana edit, backend draw p95 was **32.3 / 12.4 / 55.3 ms** for previous WebGL, updated WebGL and Canvas. On the first edits across different connections, the corresponding values were **81.0 / 58.0 / 52.5 ms**. The 24 connections were sampled across the list of resolved edges. Eight separate connections warmed the renderer, and measured edits accumulated within the same mounted graph. Each edit retained its source and resolved to its intended alternate endpoint in every pass.

## What changes when an endpoint moves

At fit scale 0.01, the frozen Nirvana Max graph contains 13,916 blocks and 18,604 resolved connections. The repeated test reconnects the edge from `block_6593` to `block_6`, then restores its destination `block_7654`. Both destinations are existing ports. On the previous build, the root kept depth key 9397, the encoded primitive's sub-order and the set of visible batches. Both directions issued five GPU draw calls. The full-detail curve batch gained or lost three records at its tail, starting at physical record 145,757. The line and coarse-curve batches kept the same ranges for that owner.

The previous renderer invalidated its root-depth check and mixed plan on the geometry event. Four topology probes found that only packed span 27,909 changed among 55,237 spans. It kept the same first encoded address, 2,242,909, while its length alternated between 14 and 17. The one stock command changed its count to match. This explains why retaining the whole previous schedule without an edit would produce the wrong addresses. [Topology observations and draw signatures](2026-11-18-nirvana-mixed-reconnect.json)

In the separate instrumented series across 24 different connections, the previous renderer enumerated roots and rebuilt the full mixed plan on every edit. The updated renderer skipped the root enumeration on all 24, repaired three schedules and rebuilt 21. Median mixed preparation fell from 20.90 to 8.75 ms. Median time in path upload fell from 26.55 to 10.50 ms as retaining ordinary opaque addresses reduced the median path-record write from 20,736,960 to 8,942,000 bytes. The adaptive source still accounts for dense record movement when its run changes length. Total upload medians were 21,990,616 and 10,195,656 bytes, including the packed addresses. These medians are computed on the 24 diagnostic edits independently for each quantity.

On 16 repeated reconnects per WebGL build, the previous renderer checked root depth and rebuilt the mixed plan 16 times. Median time between the two vertex-work checks, including the root traversal and its setup, was 3.35 ms. The full build took 6.95 ms. The final renderer made zero root traversals and repaired the schedule 16 times at a median cost of 3.60 ms. Overall mixed preparation fell from 15.65 to 7.70 ms. Selection followed a different path. In eight selection/deselection actions on each build the renderer checked root depth and built a fresh mixed plan every time. The root window moved from 5.25 to 5.35 ms and the full build from 11.25 to 10.95 ms. All eight ETL stage changes, reconnects and group drags per diagnostic case skipped the mixed pass and its owner-input check.

## When the renderer keeps a plan

The root-depth check follows root membership, visibility and ordering. A change limited to coordinates or geometry can reuse the result. The renderer still checks the visible physical draws, the curve template, batch and companion layout revisions, opaque stroke widths, source availability and native paint. It evaluates scale and device-pixel ratio for the single-sample path on each frame. Stock order also depends on the encoded owner, absolute sub-order, root depth and visibility. A child takes its root's depth.

The renderer tracks changes to the set of owners separately from changes in physical layout. A dense batch with no holes, stable membership and a single ownership class can update its covered extent without enumerating every owner. A batch containing both connection-owned and block-owned paths keeps its exact ownership ranges. [Ownership classification](../../../packages/graph/src/lib/scene/webgl/mixedOwnerRanges.ts)

For a geometry edit, the renderer compares the affected owner's encoded inputs before and after writing its path. An unchanged sequence can keep the prepared plan. A dense source can resize its last physical range in place. A retained opaque source can also move a range into free slots while other owners keep their addresses. Each repaired run must keep its source, owner, absolute sub-order, curve template and width inputs. The run is fully visible before and after the edit. The renderer checks coverage and layout revisions for the other addresses.

The mixed plan repair requires one stock command. Each old run must occur exactly once inside one packed span. The update preserves the old painter position, splits off any surviving prefix and suffix, and joins adjacent addresses in their new order. A destination can overlap the moving owner's former slots. A collision with other live addresses, incomplete visibility, a repeated owner and sub-order in the edited source, an ambiguous layout change, a native barrier or an unsupported effect selects the full planner. An opaque path that grows wide enough to need multisampling can return to the shared pass. [Encoded inputs and visibility checks](../../../packages/graph/src/lib/scene/webgl/pathPlanInputs.ts) · [Range repair](../../../packages/graph/src/lib/scene/webgl/mixedPlanResize.ts)

## Residual upload

The GPU consumes a contiguous stream of four-byte record IDs. In the previous build's repeated-edge diagnostic, the modified span fell in the middle of this stream. Overview compaction changed the submitted instance count by one. The shifted suffix wrote 624,864 bytes on reconnect and 624,860 on restore, starting at byte 639,728 in both cases. Path record writes added 7,200 and 6,720 bytes, for totals of 632,064 and 631,580. [Per-edit byte counts](2026-11-18-nirvana-mixed-reconnect.json)

In the final build, the same reconnect and restore wrote **624,920 and 624,916 bytes** of packed addresses starting at byte **639,672**, or 156,230 and 156,229 four-byte IDs. The path records added 9,440 and 6,720 bytes. Total uploads were **634,360 and 631,636 bytes**. Reusing a command schedule saves preparation time even when a change in its middle still shifts the entire remaining address stream.

## Why the adaptive curve source stays densely packed

After a successful mixed pass, the final implementation gives plain opaque lines and full-detail curves stable record addresses. The adaptive curve source keeps dense packing. Its 128-record culling groups jointly choose an eight- or sixteen-chord template. An experimental build kept stable addresses in the adaptive source as well. Against the previous renderer, all 24 first-edit images at fit changed, totalling 740 differing pixels across the 24 frames. The four detailed images matched. Forcing a fresh mixed plan in this experimental build produced the same 28 images as its incremental planner. Keeping the adaptive source dense restored all 28 framebuffer comparisons. In one fit image the final layout submitted three additional live records. Their screen-space bounds lay entirely above the viewport, from y −92.86 to −80.76. [Image and submission comparisons](2026-11-18-nirvana-mixed-reconnect.json)

A separate diagnostic tested whether one dense interior relocation and an optional move in another retained source could preserve the mixed plan. The prototype accounts for the address shift when the dense buffer compacts and appends the edited range, then checks every other visible range and curve template. Nine of 24 distinct first edits passed the guards, and the resulting spans and command counts matched a fresh build in all nine. Ten edits changed other visible addresses or curve detail, two changed source membership or the encoded owner signature, and three did not require this type of dense relocation.

Across those nine edits, the instrumented full backend draw took 17.6–27.4 ms with a median of 23.2 ms. Full mixed-plan construction took a median of 11.4 ms. The prototype's range transformation took 4.0 ms, excluding admission checks and integration. Substituting the transformation time in each of the nine measured draws yields a projected median of 17.4 ms and five draws over 16.7 ms. This arithmetic bounds the scope of a possible follow-up. The shipped renderer uses the full planner for these edits. [Prototype inputs and results](2026-11-18-nirvana-mixed-reconnect.json)

## Navigation and image checks

Each pass warmed 48 camera movements and measured 100 updates, one per rAF. Both WebGL builds recorded zero path geometry encodes and zero path-record upload bytes in every measured camera pass.

| Story and movement | Previous WebGL gaps over 16.7 ms | Updated WebGL | Canvas | rAF interval p95, ms, in the same order |
| --- | ---: | ---: | ---: | ---: |
| Nirvana, circular pan | 36/200 | 32/200 | 175/200 | 17.6 / 24.0 / 33.3 |
| Nirvana, fit to 0.95 and back | 8/200 | 10/200 | 63/200 | 16.7 / 16.7 / 41.0 |
| ETL, circular pan | 0/200 | 0/200 | 179/200 | 9.2 / 9.2 / 41.6 |
| ETL, fit to 0.95 and back | 13/200 | 12/200 | 42/200 | 17.5 / 16.8 / 33.3 |

All **82** previous/final WebGL image pairs matched byte for byte. The standard 54 captures cover the two stories at fit, 0.35 and 0.8 with both edit directions and fixed animation time. The other 28 cover the first edit on each of the 24 distinct Nirvana connections at fit and four detailed checkpoints. Twelve ETL captures also matched HTML cards and anchor metadata. A separate 144-edit churn check observed reuse of 709 previously free full-detail curve records, with at most 149 holes in a batch of up to 145,959 slots. These figures describe that workload's observed allocation behaviour. [Hashes and allocator observations](2026-11-18-nirvana-mixed-reconnect.json)

## Verification

The Graph unit suite passed 2,034 tests across 195 suites with six existing todos and nine passing snapshots. All 128 Chromium–Metal end-to-end tests passed in 57.93 seconds, including the two reconnect regressions, with zero skipped, unexpected or flaky tests. Workspace build and type checking passed. Scoped formatting passed and lint reported 13 warnings and zero errors. The published aggregates were independently recalculated from 78 raw timing files. [Test receipts and raw file hashes](2026-11-18-nirvana-mixed-reconnect.json)
