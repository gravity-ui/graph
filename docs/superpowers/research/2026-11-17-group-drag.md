# Group dragging: measured bottleneck and narrow fix

Date: 2026-11-17. Baseline: `646bbce5` plus the ETL MiniMap toggle `b46485be`. Measurements use the actual `EtlAtScale` Storybook component and its pipeline grouping, bundled directly from the same source. The fix changes only `BlockGroups.ts` and adds focused regression tests; scene rendering, connection routing, MiniMap cadence and public APIs are unchanged.

## Result

Moving one 19-block ETL pipeline in a 5,000-block / 6,000-connection graph previously caused **95,000 deep block snapshots per drag step**. Each member update synchronously recomputed every group's bounds, and those bounds copied each block's entire metadata and anchors. This cost approximately 220 ms before rendering, in both Canvas and WebGL.

Batching the member updates reduces the global derivation to one pass; reading cached shallow state for the bounds removes unrelated deep copies. The measured handler falls from **240–264 ms to 1.3–1.6 ms**. WebGL without MiniMap falls from **259.1 ms to 16.9 ms p95 rAF interval**. With MiniMap, periodic image refreshes remain visible; they are measured separately below.

## Matched measurements

Environment: Apple M3 Pro, Chromium using ANGLE Metal, device pixel ratio 2, 1600 × 1000 browser viewport (graph area 1600 × 965), no concurrent GPU or heavy CPU job. ETL: deterministic generator, 5,000 blocks, 6,000 resolved connections, Live off, HTML blocks off, fit camera scale `0.03450060376056581`. MiniMap is explicitly mounted or unmounted, rather than hidden with CSS. Its cold mount cost is excluded.

The benchmark invokes the existing pipeline `Group.handleDragStart/handleDrag/handleDragEnd` methods and allows the ordinary scheduler and renderer to complete each frame. It moves group `p01` (19 members), alternating cumulative world deltas `(40,20)` and `(0,0)`, with 4 warm-up steps and 24 measured steps. All member coordinates return to their initial values. The harness includes actual group/store/scene work, but **does not measure pointer event transport or input-to-display latency**. Real pointer routing and delegated-group browser regressions are separate validation.

Values are milliseconds. p50 and p95 are empirical order statistics over the 24 measured steps; this is a focused same-fixture comparison, not a broad device/FPS guarantee.

| Renderer | MiniMap | Handler before p50 / p95 | Handler after p50 / p95 | rAF before p50 / p95 | rAF after p50 / p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| WebGL | Off | 240.2 / 248.2 | 1.3 / 1.6 | 250.5 / 259.1 | 16.7 / 16.9 |
| WebGL | On | 245.4 / 251.1 | 1.3 / 1.5 | 266.8 / 283.5 | 16.7 / 41.3 |
| Canvas | Off | 243.9 / 254.1 | 1.4 / 1.6 | 275.0 / 283.2 | 33.4 / 41.6 |
| Canvas | On | 249.5 / 264.1 | 1.3 / 1.6 | 291.6 / 324.4 | 33.6 / 58.8 |

The batch-only ablation isolates the two changes: WebGL without MiniMap moves from 95,000 to 5,000 deep snapshots, from 19 to 1 group derivation, and to handler p50/p95 **14.9/15.4 ms**. Removing deep copies then reaches **1.3/1.6 ms**. An initial scratch ablation accidentally imported a second copy of `signals-core`; it could not batch the graph's signals and is excluded from all conclusions. The corrected ablation resolves the exact dependency instance used by the graph package.

## Attribution and preserved work

The pre-fix call chain is `Group.handleDrag` → `BlockGroups.updateBlocks` → one `BlockState.updateXY(..., true)` per member → raw-state signal update → grouping/bounds derivation → `groupsList.setGroups`.

| Work per measured WebGL drag step | Before | After |
| --- | ---: | ---: |
| Deep `asTBlock()` snapshots for group bounds | 95,000; about 218–236 ms | 0 |
| `setGroups` derivations | 19 | 1; p50 0.1 ms |
| `GroupState.updateGroup` calls | 5,016 (264 groups × 19) | One pass over the 264 groups |
| Connection geometry updates | 23 | 23; p50 about 0.2 ms |
| WebGL upload bytes | 115,744 | 115,744 |
| WebGL draw calls | 47 | 47 |

The final WebGL scheduler without MiniMap is p50/p95 **13.4/14.9 ms**; its backend draw is **11.4/12.4 ms**. These nested timings overlap and must not be added. The GPU stream and path update size did not shrink: the major improvement comes from removing redundant main-thread derivation, not changing rendered geometry or quality. Connection endpoint/routing work is already coalesced and is not the bottleneck in this scenario; a GPU endpoint table is not justified by this evidence.

The implementation wraps only the existing member loop in the existing signal library's `batch`. Every member still uses the same synchronous cancellable `block-change`/store/view update path. Earlier accepted writes are readable by later member callbacks; detached/replaced states retain their identity guard. Derived subscriptions settle after the loop. Bounds in both computed and predefined grouping use `block.$state.value`, preserving fractional and large-world coordinates; the integer-rounded `$geometry` signal is deliberately not substituted.

No changes were made to group selection, snapping, child order, port delegation, manual bends, the connection geometry algorithm, drag service, renderer, or MiniMap throttle.

## MiniMap residual cost

After the group fix, MiniMap picture refreshes occur at the existing 100 ms cadence rather than on every slow frame. In the matched WebGL run there are 3 refreshes among 24 measured steps; their picture cost is about 21–22 ms. A separate short attribution run captured these nested samples:

| Refresh | Scene query | Canvas interpreter | Whole picture |
| --- | ---: | ---: | ---: |
| 1 | 7.2 ms | 14.2 ms | 22.6 ms |
| 2 | 3.9 ms | 13.8 ms | 18.7 ms |
| 3 | 6.4 ms | 13.4 ms | 20.7 ms |

The MiniMap query currently collects the ordered scene and then filters entity types; the layer subsequently restores block-list order. A narrower typed lookup could reduce its query cost, but most measured time is drawing all 5,000 cards into the MiniMap picture. That is a separate optimization requiring equivalent custom block, hidden/collapsed block, minimalistic-level, clipping and legacy-block behavior. This change leaves those semantics and the documented final-picture/click mapping cadence intact. The new Storybook toggle exposes the actual difference without promising MiniMap-free performance when it is enabled.

## Validation and scope

- New `groupDrag.test.ts` covers both `withBlockGrouping` and `withPredefinedGroups`: one settled derivation per step, no traversal of unrelated metadata, exact fractional bounds above 32-bit coordinate range, synchronous member event order, veto, deletion/replacement during an event, unchanged outsiders, and geometry flush containing only accepted attached updates.
- Red phase: 4 of 6 new tests failed for the expected repeated derivation/deep metadata traversal; event/identity tests passed on the baseline.
- Green phase: **46 tests passed** across the new tests, group rebinding and connection safety suites.
- Independent review found no blocking issue; its separate focused run passed 52 tests. The final full core run passed 184 suites / 1912 tests / 9 snapshots (6 existing todo), followed by a successful core build, package typecheck and focused lint. Fresh-bundle Chromium Metal passed all 107 selected group, drag, scene-connection and MiniMap browser tests, including real collapsed-group delegation and MiniMap throttling. The actual Storybook pointer smoke also passed with MiniMap on and off: all 19 pipeline members moved uniformly, all 4,981 outsiders stayed fixed, all 6,000 effective endpoint pairs were checked, and all 23 affected scene shafts followed their ports. There was one attached live WebGL2 context and no browser/GL errors. This used pipeline view at scale 0.4924, DPR 2, HTML and Live off; it is correctness evidence, not an input-latency measurement. Evidence: `/private/tmp/graph-etl-storybook-pointer.log`.
- This profile covers a real 19-member pipeline in a large graph. It does not establish the cost of dragging 1,000 members simultaneously, arbitrary consumer grouping callbacks, Live updates during drag, or HTML-heavy detailed views. The redundant global recomputation is removed for those paths too, but their remaining geometry/DOM costs need separate evidence.

Local raw evidence: `/private/tmp/graph-group-drag/{baseline,batch-correct,final,minimap-profile}.log`. Reproduction harness: `build.cjs` bundles the actual source Storybook component; `run.cjs` runs the four matched configurations; `profile.cjs` adds the MiniMap query/interpreter attribution. These scratch artifacts are not package dependencies. Related design context: [resident-path results](2026-11-17-resident-path-results.md) and [OffscreenCanvas assessment](2026-11-17-offscreen-rendering.md); a renderer worker would not have removed the measured pre-fix group-state deep-copy storm.
