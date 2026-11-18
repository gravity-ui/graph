# Frame stability on real graph workflows

Measured at `78a6cb0f` on Apple M3 Pro, Chromium 145 and ANGLE Metal. The actual ETL at Scale story uses 10,000 blocks and 10,000 links. The frozen Nirvana Max story has 13,916 blocks and 18,604 resolved links. One WebGL context, MiniMap off, DPR 2. The Nirvana application source was inspected separately. Its shipped v1 integration and the v2 Storybook fixture represent different evidence.

The working 60 Hz deadline is 16.7 ms. For continuous motion, the comparison uses consecutive rAF intervals, p95, p99, maximum and count above 17 ms to tolerate timer rounding around the deadline. For isolated edits, it uses action to first rAF, first backend draw and the worst rAF gap during the action. Waiting for the next tick contributes to API-to-rAF latency. CPU submission, GPU time queries and rAF are separate measurements. Physical presentation was outside the measurement. Raw data and exact settings are in the [measurement artifact](2026-11-18-architecture-workflows-measurements.json).

## What accounts for the missed frames

| Real workload | Observation | Dominant cost in the recorded path |
| --- | --- | --- |
| ETL one stage changes status | Same-visibility paused/succeeded tag switch at fit gives 33.35 ms median to rAF and zero encodes or path source writes. The story's stage action also updates an attached flow and takes 67.95 ms median to rAF. | Tag-only still invalidates visibility across sources. Stage action adds 48.7 ms median translucent ordering, with two encodes per action. |
| Warm complete graph replacement | Four same-data snapshots take 1.37–1.53 s on ETL and 0.50–0.67 s on Nirvana. Nonrigid whole-layout replacement takes 1.67–1.80 s and 0.59–0.71 s respectively. | Same-data snapshot already traverses and prepares every retained entity. ETL sends 260,000 encodes for about 2.30 MB of path source writes per clone. Nirvana sends 37,208 encodes and about 62.39 MB per clone. |
| Partial layout update and undo | Applying ten positions and one reconnect through `updateEntities` costs 83.95 ms median to rAF on ETL and 79.20 ms on Nirvana with complete typed rows. | Whole-list reconciliation before draw. The same-batch intervention below isolates this. |
| Camera | ETL pans fit and detailed within p95 9.2 and 9.4 ms. At Nirvana overview, pan p95 is 25.8 ms and the worst gap 41.0 ms. | Camera-only updates remain source-write-free. Nirvana overview spends median 27.74 ms on GPU with 1.8 ms CPU draw. |
| Local interaction | Real pointer in/out of one block at scale 0.8 stays within 16.0 ms ETL and 12.1 ms Nirvana pointer-to-rAF maximum in 12 samples. Selecting ten blocks and one link at fit takes 57.7 ms ETL and 37.1 ms Nirvana median to rAF. | Hover and selection have different effects on work. The pointer case changes one hover tag with zero encodes. The selection case changes width and depth order, while aggregate selection triggers membership reads on unrelated mounted views. |

The hot layout run perturbs coordinates of the existing full layout with the same IDs and exercises real store, scheduler and renderer paths. Layout calculation and the caller's payload clone happen before the measured call. The undo/redo control alternates two complete versions of the changed entries on the real graphs. It exercises the library path used by a history command, without running Nirvana's Redux history controller. Selection measurements use consecutive public API calls for blocks and links. The browser harness contained a second copy of Signals in its original outer helper, so these calls were not an atomic Graph batch. The corrected patch experiment below uses the actual Graph batch.

### Known entities and the cost of collection publication

`Graph.updateEntities` batches into the block and connection stores. Updating existing rows still republishes both collections. `Blocks.updateChildren` and `BlockConnections.updateChildren` generate the descriptors of the full collections. `CoreComponent.__updateChildren` revisits retained children. The CPU trace of six ETL edits sampled 60.1 ms in descriptor reconciliation, 36.3 ms in event parent traversal, 31.4 ms in block `willIterate` and 25.2 ms in `prepareUpdate` as self time. Those figures sum work across six operations. The trace also captured GC activity. The large difference survives a route change with the same effective geometry and the same internal batch.

The intervention uses full valid input rows on both sides. It temporarily routes the known existing positions and target fields to the public per-ID methods inside the original `Graph.updateEntities` batch. There are eight operations per route and fixture, in a short A/B sequence.

| Median, ms | ETL bulk → known fields | Nirvana bulk → known fields |
| --- | ---: | ---: |
| Scheduler time outside backend draw | 58.00 → 4.85 | 53.45 → 3.65 |
| API to next rAF | 83.95 → 41.30 | 79.20 → 45.45 |
| Synchronous API call | 2.70 → 3.55 | 1.70 → 0.40 |

Both routes used 40 encodes per ETL operation and 24 per Nirvana operation. The written path source bytes also matched for both routes: 26,080 on the forward ETL edit and 16,480 on restore, and 55,200 and 54,720 respectively for Nirvana. This isolates the cost of passing a known update through an upsert and collection reconciliation. It covers only existing IDs and known changed fields. Structural edits, changes to the registered view class and public collection subscriptions still need their documented behavior.

[Graph.updateEntities](../../../packages/graph/src/graph.ts#L354), [block collection publication](../../../packages/graph/src/store/block/BlocksList.ts#L296), [connection collection publication](../../../packages/graph/src/store/connection/ConnectionList.ts#L167), [retained child reconciliation](../../../packages/graph/src/lib/CoreComponent.ts#L456).

### Full snapshots, lifetime and DX

For an identical, already mounted ETL snapshot, median scheduler time is 1,365 ms, of which 818 ms is `applyMany` and 26 ms is backend draw. In Nirvana the corresponding times are 444, 190 and 69 ms. Synchronous `texSubImage2D` and `bufferSubData` visits sum to approximately 0.15 ms per ETL clone and 5.9 ms per Nirvana clone. Texture residency and transfer costs matter, especially on Nirvana, while the mass invalidation starts earlier.

An independent public-API contract probe used a warm store and a fresh graph with identical final data. The warm graph retained an omitted old port, label and block anchor. The link still pointed to its old port. This generic defect is reachable when changing endpoint addressing under a stable edge ID. The inspected Nirvana normalizer explicitly supplies its two anchor IDs, label and bends. Nirvana's bulk reset calls `setEntities`, so its snapshot route is relevant even though that particular addressing defect was reproduced at the library boundary. Another contract probe confirmed that a direct `updateBlock({id, is})` keeps the old view class while a bulk update of the same row reinstalls the registered class. These small tests isolate the API contract and are not timing fixtures.

A stable renderer needs a short frame commit. For truly large snapshots, detect unchanged IDs and inputs and prepare the changed layout outside the active render pass. The handoff must publish a coherent combination of drawing, hit testing, ports, selection and HTML ownership. Stage and cancel obsolete preparation before attempting a worker migration. The per-frame deadline and the time until the new layout is ready are separate acceptance metrics.

### Paint, effects and local interaction

Paused and succeeded in ETL share the same inactive effect parts and differ in color. `SceneStore` emits only `styleId` for this action. Applying that row still advances global visibility and schedule revisions. `InstanceVisibility.update` re-evaluates cohorts across every source and `visibleTranslucentRuns` refilters the schedule. Tag-only samples have median 24.95 ms backend draw, including 13.2 ms visible-run work and 6.9 ms in path upload/preparation. These phases work even when no path source bytes are written. A real stage action changes a link's declared stroke, effect or extent too, so the cost includes a different ordering route. Focus updates a graph-wide population by design and deserves its own envelope.

The status-tag writer also copies and diffs the full membership map for each sparse add/delete. A deterministic probe measured visits growing from 10 to 100 to 1,000 old members with one changed signal. A scratch sparse map update passed 17 tests and 600 mixed operations, removed 20,000 observed old-member iterator visits on a 10k two-key edit, and exposed a change in inter-entity notification order. It remains a contract experiment. The measured rendering bottleneck is larger. A separate probe found that selecting one block checks N watched selection signals and changes one selected value with zero block-data emissions.

For the base renderer, changing color, visible parts and opacity should have separate work signatures from changing stroke width, effects, order and geometry. Stock hover and selection can also raise depth. Hit testing already queries spatial candidates before analytic stroke tests and follows scene paint order. An arbitrary custom line or effect can change its footprint or depth, so its bounds and render ordering must participate in invalidation. The meaningful optimization is exact scoped invalidation. At the API boundary callers should describe state and style through block/connection data, tags and declared effect parts. Application-specific state and undo stay with the app. Custom components provide reactive view inputs and accurate geometry/hit bounds through the existing interfaces.

[ETL status action](../../../apps/storybook/src/stories/canvas/sceneEffects/etlAtScale.ts#L305), [render invalidation](../../../packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts#L1076), [visibility predicates](../../../packages/graph/src/lib/scene/webgl/instanceVisibility.ts#L63).

### Camera and the pending spatial-index experiment

| Scene, motion | rAF p95 / p99 / max, ms | Intervals above 17 ms / 90 |
| --- | ---: | ---: |
| ETL fit pan | 9.2 / 9.4 / 9.4 | 0 |
| ETL zoom | 16.7 / 25.1 / 25.1 | 3 |
| ETL detailed pan | 9.4 / 16.7 / 16.7 | 0 |
| Nirvana overview pan | 25.8 / 41.0 / 41.0 | 16 |
| Nirvana zoom | 17.5 / 33.3 / 33.3 | 5 |
| Nirvana detailed pan | 9.1 / 9.2 / 9.2 | 0 |

There were no source encodes or source writes on these camera-only paths. The planned two-level index has measurable headroom. At one real Nirvana overview-scale pose centered on a visible middle block, the current coarse filter submitted 252,544 active path records. Conservative owner hulls admit 113,423 and piece hulls admit 50,407 of those records. At the sampled ETL overview-scale pose, the analogous numbers are 73,798, 60,306 and 60,306. These are counts within the current accepted physical ranges at fixed camera poses. They do not yet measure an indexed implementation or a GPU speedup. Earlier fine culling changed order/address plans often enough to lose its GPU gain through CPU preparation. The index experiment must retain canonical order, charge index maintenance and address updates, and bypass itself at poses with little rejection available. [Earlier culling experiments](2026-11-17-connection-submission.md)

### Where luma accounts for time

The lockfile pins luma 9.4.2. Its `Model.draw` prepares shader inputs, checks pipeline/vertex state and supplies bindings to the WebGL pass, which applies state and issues native draw calls. In a separate diagnostic, the browser captured the actual/native WebGL command sequence of a warm fixed-time frame and replayed it on the same framebuffer. Each of the four scene/scale comparisons matched every RGBA byte. Timing rotates wrapped backend and native replay after GPU completion, with 48 samples per route per pose. The replay includes capture-time commands only, so this bounds steady CPU submission overhead. The main workflow timing separately includes actual resource and Graph work.

| Warm frame | Native draws | Backend CPU median, ms | Inclusive Model.draw median, ms | Native replay CPU median, ms |
| --- | ---: | ---: | ---: | ---: |
| ETL, overview scale | 6 | 1.4 | 0.1 | <0.1 |
| ETL, scale 0.35 | 123 | 3.5 | 1.7 | 0.4 |
| Nirvana, scale 0.01 | 5 | 0.2 | <0.1 | <0.1 |
| Nirvana, scale 0.35 | 4 | 0.2 | <0.1 | <0.1 |

The 123-call ETL pose exposes a genuine submission tax. Pathological edits take much longer before these calls. The native replay does not establish that shader compilation, resource creation or driver stalls are consistently negligible. The hot replacement upload counters and the steady-frame replay each constrain a specific part of the hypothesis.

## Sequence under the existing development plan

1. Give known existing rows an internal delta path. Keep full reconciliation for membership, ordering and class changes. Compare both application routes with the same legal inputs and the same transaction. Target scheduler time outside draw and preserve the established subscriptions, ports and fresh-vs-hot semantics.
2. Make the visibility and order refresh consume changed owner/row information. A tag-only color update needs a smaller invalidation than a shape change or a raise. Test the ETL stage action and real connection selection along with the current retarget acceptance. Prove unchanged upper filtered ranges from actual upload spans before caching them.
3. Advance the planned owner/piece spatial index for Nirvana overview. Measure rAF misses, CPU preparation, GPU and pixel equality together. Keep the ETL fit guard and the existing shader/antialiasing contracts.
4. Hold the current scene while heavy snapshots prepare and commit new state atomically. Define a coherent rendered/hit-test epoch and validate complete replacement against fresh construction. The existing worker estimate becomes relevant only after the serialization and preparation boundary is measured.

No runtime code changed in this checkpoint. The evidence changes the order of work within the existing plan. It preserves the one-context architecture, with the frame budget evaluated per operation family.
