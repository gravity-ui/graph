# The frame budget for reconnecting one edge

On Nirvana Max, the selected WebGL build drew the first reconnect of distinct edges in **7.6 ms at p95** and a repeated reconnect/restore in **4.5 ms**. Canvas recorded 55.3 and 47.2 ms. On ETL 10k/10k, WebGL reached **5.4 ms** against 43.3 ms on Canvas. No WebGL draw or observed rAF interval exceeded 16.7 ms during the 144 warmed editing windows. Reserving one row in each multi-row path texture reduced the upload on the first edit after opening the page from 34.45 MB to 1.27 MB. On a fresh page, draw p95 was **27.5 ms**, above the 16.7 ms target and below the 160.0 ms on G and 75.3 ms on Canvas. [Previous geometry and culling results](2026-11-18-bezier-detail-reconnect.md) · [Per-action samples and source hashes](2026-11-18-nirvana-reconnect-frame-budget.json.gz)

## Selected renderer on the three editing workloads

This six-pass comparison ran G / Canvas / X / X / Canvas / G. G is the previous renderer (`b866d0cff47e`). X (`6edaeab3dbac`) includes the painter-range and depth-band caches and room for growth in multi-row resident path textures. Each action produced one draw. Each column reports G / X / Canvas.

| Endpoint change | CPU draws >16.7 ms of 48 | Late rAF intervals / observed | Backend draw p95, ms | Edit-to-rAF p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Nirvana, 24 distinct edges per pass | 2 / 0 / 48 | 1/766 · 0/769 · 48/603 | 13.8 / **7.6** / 55.3 | 22.5 / 16.6 / 64.0 |
| Nirvana, repeated reconnect/restore | 0 / 0 / 48 | 2/762 · 0/768 · 48/605 | 14.2 / **4.5** / 47.2 | 26.5 / 15.1 / 58.0 |
| ETL, repeated reconnect/restore | 1 / 0 / 48 | 3/757 · 0/768 · 50/645 | 15.0 / **5.4** / 43.3 | 25.8 / 14.7 / 51.7 |

The warmed X trajectory had 2,305 observed rAF intervals across the 144 edits. G had six late intervals across 2,285, and Canvas had 146 across 1,853. On ETL Canvas 50 long intervals occurred in 48 edit windows. These measurements cover the complete implementation. The isolated tests below address which work was removed by each change. In a separate instrumented run, whole-frame GPU queries on X produced median / p95 times of 17.04 / 54.33 ms for distinct-edge edits and 16.98 / 19.62 ms for repeats. These device times vary independently of the clean CPU draw and rAF samples. The CPU result does not establish a 16.7 ms GPU guarantee.

| Camera motion | Long rAF intervals of 200, G / X / Canvas | Backend CPU p95, ms, G / X / Canvas |
| --- | ---: | ---: |
| ETL pan | 0 / 0 / 187 | 3.6 / 3.6 / 36.2 |
| ETL zoom | 14 / 13 / 41 | 9.4 / 8.8 / 30.4 |
| Nirvana pan | 89 / 65 / 174 | 2.6 / 1.1 / 33.3 |
| Nirvana zoom | 23 / 21 / 70 | 9.2 / 4.8 / 36.6 |

Each camera trajectory contained two passes of 100 steps. Both WebGL builds recorded zero connection geometry encodes and zero path-record upload bytes during camera motion. An independent command-level comparison checked the camera, actual draw stream, instance data and address hashes on 100 pan and 100 zoom poses, with complete agreement between G and X. At Nirvana fit, 65 of 200 pan intervals still exceeded 16.7 ms on X despite the 1.1 ms CPU draw p95. Callback spacing on idle frames was about 8.3 ms.

## The first edit before any warmup

Each of 72 fresh browsers performed one public reconnect after initial fit, with no preceding edit, profiling or readback. The six permutations of G, X and Canvas were each repeated four times, giving each renderer 24 first edits and eight observations in each run position. On the cold path X reduced draw p95 from 160.0 to 27.5 ms. Its 19 over-budget draws and 14 late edit windows show what a user can still encounter on first interaction.

| First edit on a fresh page | G | X | Canvas |
| --- | ---: | ---: | ---: |
| Backend draw median / p95, ms | 55.2 / 160.0 | 20.4 / 27.5 | 51.15 / 75.3 |
| Edit-to-rAF p95, ms | 170.9 | 39.3 | 85.8 |
| Backend draws over 16.7 ms, of 24 | 24 | 19 | 24 |
| Late rAF intervals / observed | 24/229 | 14/353 | 24/258 |
| Edit windows with a late interval, of 24 | 24 | 14 | 24 |

The first public reconnect (`block_24/block_46`) added 27 records to the eight-chord source. The old texture held 206,953 physical records and had room for 206,954, so one slot was available before the edit. G and W expanded the 4,090 × 506 texture to 4,090 × 1,012 on this edit. Replacing that texture forced a 33,178,080-byte write for the whole source.

X leaves one physical row of spare capacity when allocating a multi-row path-record texture, subject to the device's maximum height. Small single-row sources keep their existing dimensions. With this reserve the same source began and ended the edit at 4,090 × 507, and the write fell to 4,320 bytes for the 27 changed records. One RGBA32F row at this width occupies 65,440 bytes and holds 409 records. The three large tables at initial fit therefore reserve an additional 196,320 bytes of texture storage in total. Further growth still reallocates a full texture once the available capacity is exhausted. [Texture allocation and upload](../../../packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts)

An instrumented comparison isolated the affected source. After freezing the final X bundle, three fresh browser sessions per build reconnected the same target after initial fit with zero preceding edits. G and W each uploaded 34,445,492 total bytes in every sample. X uploaded 1,271,732, saving 33,173,760 bytes per edit (96.3%). The table gives individual observations in run order. These three samples per build are too few for a meaningful cold p95.

| Build | Backend draw, ms | Edit-to-rAF, ms |
| --- | --- | --- |
| G | 159.6, 39.6, 43.2 | 169.6, 48.7, 53.3 |
| W | 46.9, 43.3, 35.5 | 57.6, 54.3, 44.4 |
| X | 22.1, 26.9, 17.1 | 35.5, 39.9, 28.0 |

All three final-X cold draws exceeded 16.7 ms. An earlier uninstrumented screening sample produced 14.0, 18.9 and 11.0 ms on the preliminary X build and 40.1, 140.4 and 151.9 ms on W, with the same respective byte totals. Those screening sessions are separate from the final-build samples. The experiments identify the extra upload and demonstrate the effect of the reserve. Identical upload volumes produced very different draw durations, so upload size alone cannot explain an individual long frame.

Two separately instrumented first X edits still performed a full plan build. That build took 3.9 and 10.2 ms, including 0.9 and 2.8 ms to collect mixed ranges. Updating the address stream took another 4.7 and 6.2 ms. The corresponding geometry uploads took 0.6 and 1.9 ms, compared with 126.9 and 30.6 ms in the two instrumented G examples. These phase samples identify remaining CPU work in the cold first edit.

A CPU-only replay tested a separate reserve in the encoder's three typed arrays. It avoided 7,122,712 bytes of new allocations on the first edit and produced identical addresses and offsets. Across 16 balanced trials per variant, median encoder time moved from 2.192 to 1.710 ms and p95 from 4.534 to 4.156 ms. That replay measures only JavaScript encoding and provides no browser-frame or latency result for this change. X retains the existing CPU-array allocation policy.

## Where the time went

In build G, 22 of the 24 first-time reconnects qualified for a local schedule repair. A repair still searched about 55,000 painter spans for the old address and possible destination collisions. It then materialized a replacement span list, and the address encoder examined the packed sequence again. On the 22 repairs, median / p95 CPU times were 1.70 / 3.20 ms for schedule repair and 3.05 / 4.00 ms for address encoding. All 24 repeated reconnects took the repair path. Their corresponding times were 1.65 / 6.20 and 2.35 / 3.70 ms. These phases were instrumented in a separate run. Their percentiles cannot be added to obtain a frame percentile.

The remaining two first reconnects changed the available source ranges and took the full planner. It collected 390,050 and 390,225 physical records, spending 7.3–9.9 ms collecting ranges and 10.4–16.2 ms in the enclosing build. An allocation profile attributed an estimated 22.9 MB to schedule replacement across the first 24 edits and 22.3 MB across the 24 repeats. The G trace recorded no main-thread GC overlapping the mutation-through-draw interval on either series. Allocation volume and the cause of an individual long interval are distinct measurements.

## Where reuse is exact

**Locating the edit.** For a large prepared schedule a weakly keyed index maps physical address pages to candidate painter pages. Both page sizes are 256. The planner checks the actual spans on those pages. It verifies old coverage and destination collisions before replacing the affected painter runs and joining their seams. On the recorded 22 successful repairs, the old lookup examined 1,215,239 spans in total. The new lookup examined 38,564, plus 110,477 span visits to construct two indexes. The output matched each recorded schedule. Painter positions that move invalidate the index. An index also expires when its number of links exceeds twice its starting value. Producing the immutable result can still copy a flat array of span references. [Exact repair and index lifetime](../../../packages/graph/src/lib/scene/webgl/mixedPlanResize.ts)

**Encoding the addresses.** The address encoder used by T, W and X retains the last immutable painter array. If that array, its sources and their overview revisions match, a warm draw skips address encoding. A mutable caller clears the retained identity and checks its current first/count values. For an edited plan the existing encoder looks for the unchanged prefix when the source configuration allows it, then decodes and compares the remaining spans. It uploads the contiguous interval from the first differing address to the last. Resizing a run in the middle can still shift a long suffix of four-byte GPU addresses. In G the median address write was 479,318 bytes on the 22 first-edit repairs and 624,918 bytes on the 24 repeats. [Address encoding and warm-draw guard](../../../packages/graph/src/lib/scene/webgl/pathDrawIds.ts)

**Collecting ranges on a full rebuild.** For stock opaque sources the collector reuses groups of records from existing culling chunks. A cached group includes its physical limits, source index, tie, depth revision, painter ranges and stroke-width bounds. A replaced chunk or a mismatch causes a fresh scan. After collection the full scheduler still sorts and assembles the painter plan. Custom-effect barriers retain their own collection path. In two cold runs the isolated page cache increased the observed JS heap by about 4.2 MB on this fixture. At initial fit the cache contained 3,047 live pages and 57,698 range summaries covering 389,932 records. Its key is weak. Each live page strongly owns its summaries. In an instrumented run, the two full rebuilds visited 3,066 and 3,096 pages and read 3,914 and 9,988 records from changed pages, respectively. They still assembled 55,238 and 55,239 final spans. [Mixed-pass collection](../../../packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts) · [Source ordering](../../../packages/graph/src/lib/scene/webgl/mixedPathPlan.ts)

## Measurement

The Nirvana fixture has 13,916 blocks and 18,604 connections. Both stories ran with the MiniMap disabled, one WebGL context, a 1600 × 1000 CSS-pixel viewport and DPR 2 on Apple M3 Pro with Chromium/ANGLE Metal. Canvas runs the library's Canvas interpreter on the same graph and operations. Each warmed editing pass runs eight warmup actions before 24 measured changes. The first-edit sequence uses separate warmup IDs and 24 distinct measured IDs. The repeated sequence alternates between the original and alternate target. The harness verifies graph membership, endpoint and draw for each operation. On ETL the measured edge starts at `p264/sessionize/out-0` and switches from `p264/lake/in-2` to `p01/extract/in-0` and back. This changes both the target block and the resolved input anchor.

An edit window starts at the input action and samples browser animation-frame intervals while the action settles. The harness converts each interval to microseconds, rounds it, and counts values strictly above 16,700. The p95 is the nearest-rank observation. Backend draw time covers CPU-side execution of the renderer and any driver wait inside that call. Input-to-rAF is the latency from the public edit to the observed browser animation callback. The separate GPU timer series measures command execution on the device. None of these measures alone establishes time to display a particular pixel.

## Checkpoint before caching depth bands

A separate Canvas/G/T/T/G/Canvas series compared G with T (`247cdec28bde`). T introduced the indexed repair, reusable physical-page ranges and the unchanged-plan address check. Each cell below follows G / T / Canvas order.

| Endpoint change | CPU draws >16.7 ms of 48 | Late rAF intervals / observed | Backend draw p95, ms | Edit-to-rAF p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Nirvana, 24 distinct edges per pass | 4 / 1 / 48 | 3/762 · 0/767 · 48/597 | 20.9 / 10.3 / 54.3 | 30.8 / 19.4 / 62.8 |
| Nirvana, repeated reconnect/restore | 3 / 1 / 48 | 8/752 · 4/751 · 48/629 | 17.0 / 15.1 / 44.4 | 31.0 / 29.4 / 54.9 |
| ETL, repeated reconnect/restore | 0 / 1 / 48 | 3/758 · 8/756 · 48/624 | 15.2 / 15.0 / 43.2 | 25.4 / 26.9 / 52.6 |

T brought the p95 of CPU draw under 16.7 ms in these three workloads. One CPU draw in each series still exceeded the budget. First-edit and repeated Nirvana input latency exceeded a frame at p95, and ETL had five additional long rAF gaps versus G. In the instrumented Nirvana runs, whole-frame GPU p95 was 26.40 / 31.24 ms on G / T for distinct edits and 23.63 / 19.52 ms for repeated edits.

A separate G/T/T/G Nirvana camera run recorded 36 / 44 long intervals on pan and 12 / 12 on zoom. A command-level comparison checked 100 pan poses and 100 zoom poses. Both builds selected the same LOD and issued the same draws, instance counts and upload bytes at every pose. The active address hashes also agreed in the 100 pan and 63 zoom poses that used the mixed pass. Full T camera results are available in the compressed receipt.

## Choosing the address encoder

R also tracked the previous immutable list, the changed span interval and per-chunk overview descriptor revisions. It could decode just the changed IDs, move the unchanged suffix and adjust offsets. T keeps the address index and the full-rebuild page cache. Its address encoder adds only the unchanged-plan check to the previous implementation. The extra interval metadata and descriptor revisions were removed.

An independent R/T/T/R comparison replayed the same 24 first edits and 24 repeats twice on each build. First-edit draw p95 was 20.5 ms for R and 19.1 ms for T, with 2/767 and 1/763 late rAF intervals. Repeat draw p95 was 7.6 and 12.3 ms, with zero late intervals in both series (768 and 767 observations). In paired observations median T minus R draw time was +0.6 ms for distinct edges and −1.0 ms for the repeated edge. As the extra encoder did not consistently reduce delay across these edits, the simpler version was selected. This comparison tests the address writer separately from the overall G-to-final change.

## Repairing a change in source membership

In the first-edit fixture, actions 0 (`block_24/block_46`) and 20 (`block_13460/block_13572`) gained an eight-chord source for their edited primitive. T therefore rebuilt its full schedule on these two edits. Experimental U used the same address index to find the old primitive, verify its uninterrupted painter position and check its new locations for collisions. It repaired all 24 edits. Its 48 address streams and command boundaries matched the real GPU readback from G and an independent forced-fresh path. A CPU replay also matched all 24 recorded schedule signatures, including full recomputation of both changed-source cases.

In the T/U/U/T timing series, backend draw for action 0 changed from 18.6 to 11.8 ms in the first pair and from 9.3 to 12.8 ms in the second. For action 20 the changes were 17.1 to 10.2 and 7.6 to 9.6 ms. Among the other 44 first-edit pairs, U was slower on 38 (86%) and faster on six, with a median increase of 3.85 ms. Across all distinct edges, draw median / p95 rose from 4.85 / 9.3 to 9.25 / 11.8 ms. Repeat draw rose from 6.9 / 10.6 to 9.7 / 12.3 ms. These observations establish the cost of the complete variant on this machine. They do not attribute the change in common-case time to a particular line of code. U was discarded.

A final cold-only control compared production X with X plus U's repair, so both variants had the same texture reserve. Both uploaded 1,271,732 bytes and produced matching addresses. Although the added repair removed the full build, seven of eight draws on each variant exceeded 16.7 ms. The median moved from 24.25 to 22.95 ms, the maximum from 33.9 to 27.0 ms, and windows with a late rAF interval from six of eight to seven of eight. With eight observations per build the nearest-rank p95 equals the maximum. The source-membership repair remains outside production X.

## Reusing painter ranges during a full plan build

V kept the full planner for a changed set of sources. For stock paths it partitions the inputs by root depth in bands of 128 keys and retains each band's sorted span list. When the exact ordered input references for a band match the previous full build, the scheduler can reuse that list. It sorts the changed bands, emits the bands in increasing depth order and joins consecutive physical spans at their boundaries. Full collection, band assignment and assembly still traverse the input or output references. Native barriers use the existing full scheduler.

In a T/V/V/T comparison V reduced CPU time on all four samples covering edits 0 and 20, by a median 9.8 ms. Across all 48 first changes, draw p95 fell from 20.2 to 13.6 ms and late rAF intervals from 1/764 to 0/768. V was faster on six of the remaining 44 first-edit pairs. Median CPU time on these pairs increased by 2.25 ms. Repeated reconnect p95 moved from 8.4 to 10.2 ms and long intervals from 0/768 to 1/764. This isolated run measures the change in scheduling separately from the earlier address and collection changes.

W is the production version of this depth-band strategy. An independent W/T/T/W first-edit comparison yielded median / p95 draw of 8.25 / 16.0 ms on W and 6.0 / 14.6 ms on T. Each had three late intervals (764 and 753 observations). W was faster on two of four source-membership changes. This run did not reproduce V's advantage over T. W met the 16.7 ms p95 target in both of its clean first-edit comparisons. Together they contained 96 measured draws with p95 16.5 ms. The four draws over budget were 16.9, 19.1, 19.6 and 26.5 ms. These samples support using the cached full-planner strategy within the CPU target on this fixture. They do not establish an editing speedup over T for every connection.

The page cache also received a selection and zoom control on Nirvana. Selection required 12 full schedules for 12 actions. Across these builds the collector handled 4,679,184 candidate physical records, with 4,608 records actually reread from the pages. Zoom selected the full plan on 41 of 100 camera steps and reread 389,932 of 7,790,636 candidate records. Reusing the resident record contents during a CPU schedule build requires no new GPU geometry upload.

## Checkpoint with depth-band caching

Before the texture-allocation change, an independent G/W/Canvas comparison measured draw p95 of 17.3 / 16.5 / 62.8 ms on distinct Nirvana edges, 19.1 / 13.7 / 49.3 ms on repeats, and 16.7 / 16.3 / 45.2 ms on ETL. G / W / Canvas had 3 / 2 / 48, 19 / 0 / 48 and 2 / 2 / 48 draws over budget in those three 48-edit workloads. W's whole-frame GPU p95, measured separately on Nirvana, was 27.41 ms on first edits and 19.20 ms on repeats.

In the main W camera comparison, G / W had 56 / 86 long intervals on Nirvana pan and 18 / 28 on zoom, per 200 steps. The independent G/W/W/G run reversed that result, with 69 / 61 on pan and 29 / 24 on zoom. The actual draw commands, instance counts, address readbacks and camera state matched at all 200 sampled poses. The variation between these trials limits any conclusion about a change in navigation smoothness caused by caching depth bands.

## Device-side experiment

A separate R/S experiment held the geometry, positions, order, instance addresses and commands fixed. The mixed shader submits 34 vertices per instance. A straight line uses four of these vertices for covered triangles, and an eight-chord curve uses eighteen. The remaining strip vertices repeat the endpoint pair. In the captured first-change draw, at least 3,248,064 of 10,752,296 vertex invocations had this property. S skipped the color, effect and related texture reads for these vertices after computing their original clip position. Every shader outside the mixed paths retained its original source.

Each variant received two independent clean passes and two separate whole-frame GPU-timer passes per action. For the first edits, GPU median / p95 was 16.90 / 19.83 ms on R and 17.52 / 21.66 ms on S. For repeat edits it was 18.37 / 21.83 ms on R and 17.85 / 20.41 ms on S. Clean first-edit runs had two late intervals out of 763 in both variants. Repeat runs had zero of 768 on R and one of 761 on S. Repeated edit-to-rAF p95 moved from 23.1 to 26.2 ms. All 28 sampled first-change and close-up images matched the reference RGBA exactly. The experiment found no consistent benefit across the two workloads. The selected implementation retains the original shader.


## Cold memory and retained schedules

Two independent Nirvana browser sessions per variant sampled the JavaScript heap after explicit collection at initial fit, after 24 distinct edits, and once after restoring the connections. Mean heap sizes at those points were 322.04 / 322.81 / 322.98 MB for G, 326.17 / 326.98 / 327.16 MB for T, and 326.82 / 327.69 / 327.87 MB for W. Thus W added about 4.78 MB over G at fit, including about 0.65 MB over the physical-page and address-index implementation T. The W band cache held 146 groups throughout, with 55,237 packed spans at fit and after restore and 55,239 after the 24 edits. At initial load each variant encoded 106,788 items and uploaded 85,763,176 bytes. The initial backend draw lasted 95.1 / 98.1 ms on G, 92.5 / 93.0 ms on T, and 94.5 / 92.5 ms on W in the two sessions. This experiment covers one edit/restore cycle.

A separate six-session experiment reconnected the same first connection with zero preceding edit actions. On G the three backend draws lasted 52.6, 54.8 and 41.1 ms. On W they lasted **153.0, 39.1 and 43.0 ms**. The corresponding edit-to-rAF latencies were 65.6, 67.5 and 51.1 ms on G and **164.0, 48.7 and 53.3 ms** on W. All six first edits exceeded the target. Three observations per variant do not establish a cold percentile or explain the 153 ms result.

A separate W/X resource run on 24 public reconnects and 24 restores recorded one texture replacement and 33,533,440 bytes of path-record writes on W. X recorded zero replacements and 359,680 bytes of path-record writes. At initial fit the summed RGBA32F texture dimensions represented 62,429,760 bytes on W and 62,626,080 on X. After restoring the graph, W's allocation represented 95,542,400 bytes and X remained at 62,626,080. These GPU storage estimates use dimensions and format. The initial upload volume in that run was identical at 87,027,764 bytes.

## Output and checks

At fixed time all 104 reference frames matched X across 657,536,000 physical pixels. Every comparison had zero channel differences and matching HTML and scene metadata. T and W had also matched those 104 reference frames. The sample comprises 54 ordinary editing and display states, 24 distinct overview reconnects with four close-ups, and 22 camera poses spanning the level-of-detail transitions. Readback of the entire active GPU address buffer and its command boundaries matched G for 24 first and 24 repeated edits. The same 48 X readbacks matched a forced-fresh reference with the mixed plan, physical-page cache and depth-band cache cleared.

The X worktree rebuilt to the identical complete JavaScript bundle (SHA-256 `6edaeab3dbac8a1a725f92494867562d1123099e3871ab0d4ca23d1bc1c4861c`). Workspace typecheck and build passed. All 2,042 unit tests in 195 suites and all nine snapshots passed, with six existing TODOs. Scoped formatting passed and lint reported 17 warnings and zero errors. A targeted Chromium regression adds a single record after two full texture rows. The previous W bundle uploaded 215,980 bytes and failed the test's local-write budget of less than 75,168 bytes. X passed this regression and all 129 Chromium/ANGLE Metal tests in 60.2 seconds, with zero skipped, flaky or unexpected outcomes. [Resident texture growth regression](../../../apps/e2e/tests/connection/scene-overview-lod.spec.ts)

The following command reproduces the selected renderer's Nirvana first-edit counts and nearest-rank draw p95. Run it in the report directory.

```sh
python3 - <<'PY'
import gzip, json, math

name = "2026-11-18-nirvana-reconnect-frame-budget.json.gz"
with gzip.open(name, "rt") as file:
    run = json.load(file)["selected"]
case = "plain/reconnectSpread"
passes = run["perPass"][case]["candidate"]
rows = [r for p in passes for r in run["cleanSamples"][case][p]]
draws = sorted(r["backendMs"] for r in rows)
gaps = [t for r in rows for t in r["rafIntervals"]]
over = lambda t: round(t * 1000) > 16700
print(len(draws), sum(map(over, draws)), round(draws[math.ceil(.95 * len(draws)) - 1], 1))
print(len(gaps), sum(map(over, gaps)))
PY
```
