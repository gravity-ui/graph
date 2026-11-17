# Isolated single-connection reconnect

Measured on 2026-11-18 against reference `75106ba7b297168ae8d13059c189e9a48fd2a9e1`. The three renderer files in `8d816e4951f6196d643865953717d849d8d8b640` match the measured build. The Storybook control is in `2c76bfe2`.

The final ETL result is a reduction in input-to-next-rAF p95 from **62.60 to 38.40 ms**, and backend CPU p95 from **52.90 to 28.70 ms**. This fixes unnecessary work caused by one connection changing the overlap levels of thousands of blocks. The resulting p95 remains above the 16.7 ms frame budget. Nirvana remains a control for the independent mixed-path preparation cost.

[Raw samples, machine details, source and bundle hashes, camera checks, and image hashes](2026-11-18-single-connection-reconnect-measurements.json) are the durable measurement record. Earlier diagnostic and candidate screens in that file are explicitly separate from the final results.

## Final measurements

Each row pools two fresh 100-operation runs per build. Runs were ordered reference → candidate → candidate → reference, with a separate browser launch for each fixture in each run. Values are **arithmetic median / p95**, in milliseconds. p95 is `sorted[floor(0.95 * n)]`.

| Fixture and metric | Reference | Final |
| --- | ---: | ---: |
| ETL, input → next rAF callback | 51.20 / 62.60 | **33.20 / 38.40** |
| ETL, backend CPU | 42.20 / 52.90 | **24.05 / 28.70** |
| ETL, translucent ordering, including overlap maintenance | 31.50 / 41.70 | **13.80 / 17.20** |
| ETL, path upload/preparation phase | 3.10 / 4.70 | **1.70 / 2.80** |
| Nirvana, input → next rAF callback | 37.80 / 43.30 | 33.40 / 41.80 |
| Nirvana, backend CPU | 27.80 / 30.70 | 23.50 / 29.20 |

Nirvana's two candidate runs differed noticeably in mixed-path preparation time. Nirvana uses a separate mixed-path plan and has zero translucent owners in the overlap index. Its p95 stayed within the observed run-to-run variation.

ETL's later visible-run filtering still costs 4.80 / 5.90 ms in the final build, versus 4.00 / 4.80 ms in the reference. The separate visibility revision reduced time in the earlier `uploadPaths` phase. Scheduler time already includes the backend and its nested phases.

GPU queries sampled every sixth operation produced 34 samples per build and fixture. ETL GPU median/p95 was 10.49/16.28 → 9.02/15.72 ms. Nirvana was 16.88/18.58 → 16.75/18.14 ms. The sparse queries provide context for the CPU measurements.

## Fixture and operation

Chromium `145.0.7632.6`, ANGLE Metal on Apple M3 Pro, browser viewport 1600 × 1000 CSS pixels, DPR 2. The benchmark bundles the actual Storybook components from frozen sources in development mode. No other performance jobs, package builds, or Storybook edits ran during the final acquisition.

| Setting | ETL at Scale | Plain Nirvana |
| --- | --- | --- |
| Blocks / resolved connections | 10,000 / 10,000 | 13,916 / 18,604 |
| Fixture fingerprint, ordered FNV | `4269558956` | `3691322869` |
| Fit scale | `0.025135101168782203` | `0.01` |
| Graph viewport | 1600 × 965 | 1600 × 1000 |
| Camera center | `(61720, 12884)` | `(34475, 325)` |
| MiniMap / live data | off / off | absent / static |
| HTML / effect minimum scale | on / `0.1` | stock fixture |

The harness asserts **zero mounted MiniMap layers**. Both fixtures have exactly one live WebGL context. ETL uses explicit `blockCount=10000`, `connectionCount=10000`, `renderer=webgl`, `html=true`, `minimap=false`, `live=false`, `view=fit`, `selectionGlow=0.6`, `effectMinScale=0.1`, `focusOnFailures=false`, and `cameraMotion=manual`. The pointer is outside the graph.

The same existing edge alternates between two valid targets.

- ETL uses `p264/sessionize:out-0→p264/lake:in-2`, from `p264/lake` / `in-2` to `p01/extract` / `in-0`, and back.
- Nirvana uses `block_6593/block_7654`, from `block_7654` to `block_6`, and back.

Both source blocks have nonzero degree. Every operation asserts the requested target, resolved geometry, unchanged connection count, a changed geometry object, and a rendered backend frame. The statistics describe these two long retargets. Other endpoints can intersect different numbers of neighbors.

Ten warm operations precede each measured run. Each next input waits until at least 100 ms after the preceding input, followed by two animation frames. This separates consecutive edits. There was exactly **one backend frame per measured operation**.

Input-to-rAF measures completion of the first requested animation-frame callback after the public API call. Compositor presentation time falls outside this window. The observed ETL maximum was 112.30 ms in the reference and 40.80 ms in the final build. The cause of the reference outlier is unknown because the timing runs had GC tracing disabled.

## Confirmed mechanism and resource cost

The reference overlap index contains 9,140 connections at z=100 and 7,379 blocks at z=200, for a total of 16,519 owners. Retargeting this one edge changes **4,298 overlap levels**, including 4,292 blocks and six connections. Forward movement exhausts the incremental scan budget. Restoring the previously wide edge immediately falls back to a full grid computation. All nine nonempty source bucket lists then change.

The final version partitions only by authoritative painter bands. It propagates single-move level changes conservatively, retains an exact changed-ID delta, skips unaffected source-position work, and reuses a proven unchanged upper merged schedule. On the real fixture, all six diagnostic operations evaluated **six levels**, changed the same six connection IDs, and had **zero grid-compute fallbacks**. Block levels and the upper portions of the sorted source lists stay unchanged. Three source lists still change below that boundary. This diagnostic is separate from headline timing.

The semantic visibility revision also avoids rescanning unrelated instance predicates for geometry-only changes; actual visibility, style, owner, and LOD changes remain invalidations. The implementation spans three modules.

- `packages/graph/src/lib/scene/webgl/overlapLevels.ts`
- `packages/graph/src/lib/scene/webgl/translucentOrder.ts`
- `packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts`

Per 100 operations, ETL performs 200 encodes and uploads **568,000 bytes of canonical path source data** in both builds. Nirvana performs 200 encodes and uploads **696,000 bytes** in both. Compact draw-address and other table uploads are reported separately in the JSON.

After warmup, unique overlap typed-array backing buffers total **2,033,811 → 2,144,671 bytes** (+110,860), including the new 66,076-byte band-base array. These figures cover the backing storage of the typed arrays. ETL path high-water count (1,117,579 records) and CPU path capacities (252,675,653 bytes) are identical before and after each 100-operation run. The existing bucket cache still retains JavaScript bucket objects. Some preparation work still scales with scene size.

## Image and camera checks

The full WebGL framebuffers match byte-for-byte in all 12 comparisons. Each graph was sampled at fit and scale 0.35, before retargeting, after retargeting and after restoring the original target, with `frame.time=2.5`. The baseline forward frame differs from its own before frame in both views of both fixtures, and restoring the target returns exactly to the original pixels. The JSON records buffer dimensions, hashes and target IDs. The comparison covers the WebGL scene before HTML compositing.

A separate warmed ETL camera cycle crosses 0.01 → 0.95 → 0.01 in 160 frames.

- Zero source encodes and zero canonical source uploads in both builds.
- Both builds submitted 345,462 instances at the median and 488,528 at p95.
- rAF p95 16.70 → 16.60 ms; backend p95 10.90 → 10.70 ms.
- At unchanged scale 0.35 with active effects, backend p95 went from 3.60 to 3.70 ms and rAF p95 from 8.50 to 9.10 ms. Calls went from 131 to 132, with 16 fewer submitted instances.
- At unchanged overview scale, both builds render zero backend frames during the idle sample.

The camera measurements come from one short paired run.

## Reproduction

For a visual check, choose **View → One pipeline** in ETL at Scale and toggle **Retarget Orders DB flow**. The existing Orders DB link switches from Extract orders (in-0) to Ingest events (in-1) and back. The graph instance and connection count stay fixed, and Live status follows the current target. The timing scenario below uses the longer cross-pipeline link identified above. [ETL at Scale](http://localhost:6017/?path=/story/canvas-sceneeffects--etl-at-scale&args=view:pipeline)

Use the ETL Storybook component at `canvas-sceneeffects--etl-at-scale` with the settings above, or `stories-main-grapheditor--nirvana-max-graph-test` with a frozen graph. Both builds used seed 7 and the same saved Nirvana input. Its SHA-256 and original local input path are in the JSON. For a new comparison, save one generated graph and load it on both revisions.

The timing runs use phase timers, source-upload counters and sparse GPU queries. The following loop exercises the public API on a mounted `graph`.

```js
const targets = [
  {targetBlockId: alternateBlockId, targetAnchorId: alternateAnchorId},
  {targetBlockId: originalBlockId, targetAnchorId: originalAnchorId},
];
const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
const samples = [];
for (let i = 0; i < 110; i++) {
  const inputAt = performance.now();
  graph.api.updateConnection(edgeId, targets[i % 2]);
  const rafAt = await frame();
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 100 - (performance.now() - inputAt))));
  await frame();
  await frame();
  if (i >= 10) samples.push({direction: i % 2 ? 'restored' : 'forward', inputToRaf: rafAt - inputAt});
}
```

The saved harness additionally asserts geometry/count invariants, separates the warm and measured loops with settling frames, and reads full fixed-time framebuffers after the timed acquisition. The artifact contains the SHA-256 bundle hashes (reference `35b98a70…`, final `bf12770c…`) and local paths to the raw logs and captures.

A physical initial-packing experiment was rejected. It reduced ETL scheduling CPU and preserved pixels but increased warm-zoom GPU median from 4.56 to 8.14 ms, submitted more geometry, and added roughly 200 ms to cold backend preparation. The final renderer keeps the original physical packing.

## Verification

The graph unit suite passed 1,980 tests with six existing todos. All 178 selected browser cases passed in Chromium Metal and WebKit. Graph, Storybook and E2E type checks passed, as did the package build. ESLint reported zero errors and eight warnings in the WebGL backend.
