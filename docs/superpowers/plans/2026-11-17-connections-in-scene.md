# Connections in the unified scene

**Goal:** Draw line, Bézier and polyline connections through `graph.scene` in both renderers. In WebGL mode the graph owns one WebGL rendering context for blocks, ports and connections.

**Architecture:** Keep the existing port store as the authority for connection endpoints. A connection owns one scene element with stroke, arrow and label parts and one draw/hit order. First measure a shared representation using existing CPU geometry and scene paths, then test whether looking up endpoints in the shader improves that same pipeline.

**Sources:** `docs/design/scene-blocks-3b/2026-11-09-webgl-block-design-questions.md` §7, §10 and the Obsidian notes “Graph — связи на GPU через ссылки на концы” and “Graph — сдвиг 1000 блоков перед переносом связей”.

## Contracts

- Use `graph.settings.renderer` and the scene's renderer state, including Canvas2D during context loss. The scene owns the connection layers' depth and selection order, with default buckets 100/101 for connections and 200/201 for blocks. HTML remains above the scene.
- Resolve endpoint position from the last port in the existing delegation chain. A connection keeps its logical source and target when a port delegates, redelegates or returns to its owner. Multiple edges referencing one port share the port record. An anchor need not have a scene component. A resolved port without a scene owner uses a world position, including the group's own edge ports at this stage. A missing logical port or an unresolved final delegate hides the connection and removes its hit area.
- Preserve built-in line, both Bézier orientations, arrowheads, dash phase, labels and analytic hit tests. Keep a route's saved bends in world coordinates. The new built-in polyline uses effective source, bends, effective target. For existing multipoint data, establish whether its `points` are an absolute full route or bends. Provide the narrow adapter that preserves each supported existing route shape and attaches to delegated ends with no write to saved points. Verify against Nirvana compare and manual routes before choosing the migration rule.
- When both logical owners are hidden, preserve the current connection visibility rule. A delegate's position governs geometry, while the logical owners govern visibility, selection and events.
- Canvas2D uses the existing TypeScript geometry, with the base stroke when an effect is WebGL-only. WebGL and Canvas2D use the same stored route and port resolution. Use current segment helpers for rounded or custom polylines and advanced curves until evidence warrants a shader specialization.

## 1. Capture the existing contract and prove shared drawing

- [x] Run the existing port, group-rebind, and connection-geometry Jest suites. Check the behavior of absolute `points` on delegation independently of the desired contract.
- [x] Use the existing `scripts/bench/culling/scene-slice.mjs` runner for a focused browser probe. Add three scene elements at z=100 with different `path` shapes. Give them real ports on blocks and a shared delegated source. Read pixels for the shaft of each path, block occlusion, and the changed and restored positions. Draw in the same scene in Canvas2D and WebGL. Check the graph's actual renderer and count its WebGL canvases.
- [x] Exercise collapse, move while collapsed, expand, two-hop delegation, replacing a delegate at the same position and an unresolved port. Capture the current distinction between the effective position and an explicit absolute multipoint route.

### Files for the first probe

- `packages/graph/src/store/connection/ConnectionState.ts` and `store/connection/port/Port.ts` supply real endpoints.
- `packages/graph/src/components/canvas/connections/geometry/geometries.ts` supplies the TypeScript line, Bézier and rounded polyline.
- `packages/graph/src/lib/scene/SceneStore.ts` and the existing `path` primitive supply the same geometry to each renderer. The probe has fixture-only wiring under `docs/superpowers/research/`.

### Results and reproduction

On `cdcd7b5e`, 62 focused Jest tests and 50 browser checks passed. Chromium 145 used ANGLE Metal at DPR 2.
The probe published the three shafts into the scene using the existing CPU geometry. Its WebGL scene had one context in the graph root. The legacy connection pass used Canvas in that fixture and the checked pixels came directly from the scene canvas.

The legacy polyline starts at its stored first point (140, 140) when the logical source delegates to the collapsed edge (260, 114). Rebuilding the scene path from the effective endpoints and stored interior bends follows the group through (260, 194) and back to the block, with the saved path intact. Keep this as the migration fixture. An unresolved final delegate currently leaks its placeholder (0, 0) through `$geometry` when the logical port is resolved. Extend the endpoint resolution check in the new pipeline to the final delegate. The shader representation needs a rebind signal independent of x/y, because a delegate can change while coordinates match.

Run the focused probe from the Graph worktree with its installed dependencies:

```sh
probe_dir=$(mktemp -d)
probe_bench="$probe_dir/scripts/bench/culling"
mkdir -p "$probe_bench/scene"
ln -s "$PWD/packages" "$probe_dir/packages"
ln -s "$PWD/node_modules" "$probe_dir/node_modules"
cp scripts/bench/culling/scene-slice.mjs "$probe_bench/"
ln -s "$PWD/docs/superpowers/research/2026-11-17-connection-scene-probe.ts" "$probe_bench/scene/slice.ts"
node "$probe_bench/scene-slice.mjs"
```

## 2. Establish the CPU geometry implementation as the reference

- [x] Publish one scene element per built-in connection and use one geometry for rendering, culling and hit-testing. Keep threshold and paint tests for the arrow, labels and same-ID replacement.
- [x] Supply path, text, rect and filled-triangle primitives. Browser coverage includes opaque and translucent triangle fill. Exact coverage at translucent polyline joins is still open.
- [x] Move the built-in shaft, arrow and label to the scene. Normal-entry-point browser tests count one live WebGL context, cover context loss and restoration, Canvas switching and export, and verify real group collapse, drag and expansion. Custom imperative Canvas lines retain the Canvas compatibility batch.
- [x] Record the shared CPU implementation as A. Profile it and remove redundant depth writes, solid path length calculation, opaque scratch copies and unchanged companion uploads. Use the same render data and port dispatch for Canvas and WebGL.

### Measurements and style audit

The measured runs used Chromium 145, Apple M3 Pro, ANGLE Metal, DPR 2, 1600×1000, scale 0.038, 10,000 blocks,
9,900 Bézier connections and 1,000 groups. Moving 1,000 blocks affected 1,939 paths. In four runs ordered
before/after/after/before, averaging the 30 measured steps of each run, API update plus scheduler time changed
from 77.7 to 61.0 ms, and the scene portion from 37.0 to 20.7 ms. In the final three-repeat WebGL run,
pan and zoom each took 1.53 ms in the scheduler. Drag took 34.43 ms in the scheduler plus 14.24 ms in the API
action, of which 16.97 ms was in the scene. Drag frame intervals were 49.9 ms p50 and 60.8 ms p95.

A final Canvas A/B/B/A kept all connection migration code fixed and varied rectangle path reuse and sorted
viewport query reuse. Three repeats × 30 steps per run gave pan 20.54–21.36 → 10.99–11.27 ms, below the
13.5 ms design target. Drag scheduler time was 35.64–36.00 → 32.51–32.67 ms. All four settled PNG outputs
were byte-identical (SHA-256 `6f737faf23bd1e3f604b4a356c5cacb7f122bd2c7d36a7b84343889d0ba76763`).
The historical 42.7 ms drag result for the two-context variant used a separate session. The measured scene
omits labels and effects.

Reproduction overlay: `docs/superpowers/research/2026-11-17-unified-connections-drag.patch`. Use the existing
scene runner on a disposable copy of the scripts. Run `--gpu --scenes guarantee --scales 0.038 --modes pan,drag
--renderers blocks-webgl,blocks --repeats 3 --steps 30 --no-bulk`. The overlay runs both scene backends at the
same view. Apply it to the CPU scene implementation, including the updated block counter.

Design §§3, 7, 8 and 10 require one renderer setting, shared order, named parts, tag rules over data values,
and base strokes on Canvas without shader effects. The connections expose `line`, `arrow`, `labelBackground`
and `label`. A regression test verifies a tag's opaque color override leaves the geometry reference unchanged.
Both renderers and the hit test resolve camera-aware path widths. Tagged WebGL effects support separate
uniform signals, a per-connection parameter array, and an explicit `null` override. The selection and hover raise
comes from theme rules. The native hover/selection stroke still follows the line's data and `getStroke()`, and a
matching tag rule can override the paint.

### Storybook ETL at Scale

The solid-path benchmark missed a regression with animated block and edge effects. The actual Storybook story
has 1,064 stages and 1,400 connections. Open `/iframe.html?id=canvas-sceneeffects--etl-at-scale&viewMode=story`
at 1600×1000, DPR 2, with WebGL, Fit all (scale 0.0782), HTML and Live on. Sample intervals from
`requestAnimationFrame` and time `graph.scheduler.performUpdate()` and the scene backend's `draw()` separately.
For the pan, alternate 2 CSS pixels left and right on successive frames. For Focus, turn Live off, freeze the
camera and sample with Focus off/on/off.

On Apple M3 Pro with Chromium 145 and ANGLE Metal, the original story had a 75.5 ms p50 / 91.8 ms p95 frame
interval, 76.2 ms median scene draw, 5,798 draw calls and 237 overlap levels. Most calls were from unnecessary
ordering constraints between effect paths. Bounds from the minimum allowed zoom included large CSS halos and
inactive level variants. The updated renderer bounds effect elements using the visible primitives of the active
level and scale interval, including their shader halo and anti-aliasing. Ordinary translucent paints keep their
stable geometry bounds across zoom to avoid reordering and re-uploading text. The shader and blend order are
unchanged for visible overlaps.

With the fix, 360-frame Live samples had 8.3 ms p50 / 9.1 ms p95 frame intervals both idle and during pan.
Scheduler p95 was 3.2 ms idle and 3.3 ms during pan. Draw calls fell to 198 and overlap levels to 7. Live updates
could still take up to 19.3 ms in an individual scheduler tick. Focus puts `dim: 0.75` on the relevant stages, so
it preserves their alpha. With Live off, both Focus states had the same draw count, levels and encode count,
before and after the fix. SwiftShader at DPR 2 still had a 967 ms median frame interval, despite a 12.2 ms median
scene draw on its main thread.

### Compatibility

A custom geometry that describes an open arrow or a convex filled arrow draws in both renderers. A connection
using imperative Canvas rendering keeps its existing Canvas batch order. A legacy Canvas block beneath the scene
can have a different visual and hit order at an overlap. Arbitrary-scale exports use the connection label layout
from the live camera. The custom Nirvana route keeps its ordered interior bends and preview data in the product.
Its current Canvas code adds detached chevrons, execution styling, a Compare underlay and a last-segment label.
This work leaves those drawing hooks available for a v2 adapter.

### Verification

Monorepo tests, package and app typechecks, lint and the packed-package consumer contracts completed.
The core suite had 1,836 passing tests.
Chromium E2E had 315 passing tests. The connection specs had 8 passes each in WebKit and Chromium with Metal.
The real-GPU scene slice had 53 passing checks, including remove/re-add with group delegation.
The implementation remains local to this worktree.

## 3. Compare with endpoint references

- [ ] Implement B as a thin experiment in the same scene backend. Store a connection's endpoint IDs and a shape kind. A port row represents owner element index plus local offset, or an absolute point, and uses the effective delegate. Keep the endpoint row mapping in the renderer. Update rows or references when the effective target or local geometry changes. A block translation changes its existing element texel.
- [ ] Start B with straight and standard Bézier. Use the same equations for controls and tangents as the existing TypeScript builders. Check reverse direction, close or coincident endpoints and both orientations against A. For polyline, keep resolved bends and prepared segments in A initially. Test a port-referenced polyline with two stored bends only after B shows a benefit on straight and Bézier. Verify corner shape and premultiplied alpha at a join, continuous dash or effect distance, and matching hit geometry.
- [ ] Use conservative bounds from endpoints and the Bézier control hull to update culling without producing a full render buffer; materialize the exact curve for hit tests, labels and the Canvas interpreter as needed. Compare visible sets and hits after a long edge crosses the viewport and after both endpoints move in one batch.
- [ ] Check shared delegates, chained/replaced delegates, unresolved/ownerless ports, collapse/drag/expand without a stale frame, same-ID state replacement, and recovery after context loss. Test that moving a block with an unchanged offset performs no per-edge geometry upload on B. Verify CPU culling and label work separately.

## 4. Choose and verify

- [ ] Run interleaved A/B on the same renderer, hardware, route data, camera history and DPR. Use the saved 10k-block scene. Measure pan, zoom and moving one block, moving 1000 blocks, and moving a collapsed group with many shared delegates. Cover line, Bézier and a polyline-heavy fixture. Record update plus scheduler time, frame p50/p95, mounts, JS heap, CPU geometry recomputes and upload bytes by table and instance buffer. The old two-context implementation is a historical control.
- [ ] Keep B only for shapes where the improvement exceeds run-to-run variation and the image, order, visibility and hit tests agree. The CPU path is the reference for all supported shapes and for custom routes. Revisit any Canvas2D regressions on the same scene before changing the defaults.
- [ ] Run the existing scene GPU slice, TypeScript, lint, package tests and relevant Chromium/WebKit E2E before declaring the switch ready. Keep the work in this worktree. Commit or publish only when requested.

## Review focus

| Case | Evidence required |
| --- | --- |
| One port delegates to a moving group edge and later expands | Same-frame coordinates and hits, original route data intact |
| Port resolves without an Anchor or scene owner | Visible connection from the real port, including far LOD and group edge. An unresolved final delegate must not emit geometry at its placeholder position |
| Route changes from a line to repeated or acute bends | Correct joins, no duplicate alpha and continuous dash phase |
| Line or label overlaps a block | Same draw/hit order in both renderers before and after selection |
| Context lost or endpoint deleted and reinserted | No stale shape, duplicate context or leaked scene element |
