# Culling benchmark

Measures the main-thread duration of one GraphLayer update while panning and zooming large scenes,
for several versions of `packages/graph` side by side, and checks that they draw the same pixels.

- **Scenes:** `nirvana` mirrors the Storybook `NirvanaMaxGraphTest` (13,916 blocks, bezier connections
  with arrows, no anchors); `playground` mirrors the Playground "10 000" preset (10,476 action blocks with
  two anchors each, straight connections). Both are generated with fixed seeds.
- **Views:** `near` is 1600x1000 CSS px, `full` is 1600x1600; DPR 2.
- **Variants:** `name=ref`, where `ref` is a git ref, `.` for the working tree, or a directory with a copy
  of `packages/graph/src` (for example with one change reverted). The first variant is the pixel reference.
- Every variant runs the same zoom history before measuring: the hot path is sensitive to JIT feedback.
- Every variant is compiled like the published package (`packages/graph/tsconfig.json`, target es2020).
  Without that, a git-ref copy in a temporary directory gets native class fields while the working tree
  gets constructor assignments, which alone moves dense frames by about a millisecond.

```bash
node scripts/bench/culling/run.mjs --variants base=origin/v2,current=. --scales 0.01,0.02,0.05,0.1
node scripts/bench/culling/run.mjs --scenes nirvana --views near,full --scales 0.01 --repeats 5
node scripts/bench/culling/run.mjs --first --repeats 4
```

Options: `--scenes`, `--scales`, `--views`, `--modes pan,zoom,idle,drag`, `--repeats`, `--steps`, `--noop` (replace
fill/stroke calls with no-ops to isolate JavaScript cost), `--first` (only the first two frames after
mounting), `--shuffle` (register connections in a seeded random order), `--shots <dir>` (keep the compared
screenshots), `--headed`, `--chunk-size N` and `--cell-tiles N` (set `connection.PATH2D_CHUNK_SIZE` and
`connection.PATH2D_CHUNK_TILES` for every variant; `--chunk-size 1` strokes every connection alone, which compares
culling without the blending of overlaps inside a chunk), `--labels` (draw connection labels; Nirvana connections
have labels). Each canvas result line ends with the Path2D strokes and fills of one frame at the measured view,
counted after the timed frames; WebGL columns do not print them, because they count Path2D calls only.

`--renderers canvas,webgl` (default `canvas`): every variant x renderer is a column named `variant/renderer`, and
the first column is the pixel reference. The API is detected per variant from the bundle's exports:

- **New API** (`WebGLLine` is exported): the renderer comes from the connection class. The WebGL column uses
  `class extends BlockConnection { static line = WebGLLine }` (or a `WebGLLine` subclass for `--effect`), the canvas
  column `Path2DLine`. Each column prints `[canvas]`, `[webgl]` or `[webgl-fallback]`, read from
  `graph.getGraphLayer().$connectionsRenderer`.
- **Prototype** (`getWebGLConnectionsStats` is exported, no `WebGLLine`, for example `04f1f313`): the
  `connectionsRenderer` setting, and `--effect` overrides `getStroke()` of the connection component.
- **Neither** (for example `origin/v2`): canvas only; a note is printed and the variant's WebGL column is skipped.

`--effect none|dash|static-dash|style|effects-1|effects-4|effects-16`: `static-dash` is a still dash pattern and
`style` takes color and width from the connection id, on every renderer. `dash` is `dashFlow` on WebGL (a running dash)
and the still dash on canvas: **Path2D cannot animate**, so canvas has no running dash and the pixel comparison prints
`n/a` for `dash`. `effects-N` (new API, WebGL only; other variants draw plain connections and print a note) defines N
effect objects with distinct GLSL sources (each darkens the color by a factor from its index, `animated: false`), so N
programs exist, and spreads connections over them by a hash of the id; canvas columns draw plain connections. `--modes` also accepts `idle` (no
camera change, one frame per step) and `drag` (moves the block with the most connections by 3 world units back and
forth). Each mode prints `<mode> <mean update ms> ms frames <p50>/<p95>`: the frames are the
intervals between measured steps. In `pan`, `zoom` and `drag` each step waits for a graph-layer update, so the frames are
update-gated and include GPU-bound frames the update time does not see; in `idle` they are pure `requestAnimationFrame`
intervals. `timeouts N` appears when N measured steps waited 20 frames without an update, which inflates the p95. In `idle`
the update time is 0 when no GraphLayer update ran. WebGL columns add `gl <ms> ms <calls> calls <instances> inst <items> items`:
the main-thread time of WebGL draws per measured frame, and the instanced draw calls, instances (cubic pieces) and
connection items with an appearance per WebGL draw; stats that have them add `(<line> line + <curve> curve)` instances (items compare with the visible connections despite curve
subdivision). `gl` ms includes WebGL draws inside graph-layer updates, which `update` already counts, so `gl` is reported
next to `update` and never added to it; it also covers draws in WebGL's own animation loop. With
`--shots`, a column name's `/` becomes `-` in the file name.

Both scenes register connections layer by layer along X, so registration order is already spatial. `--shuffle`
measures the order of graphs loaded from a store. Variants that chunk connection batches by registration order
(for example `e3a62d8c`) cull worse with it; variants that chunk by grid cell (`connection.PATH2D_CHUNK_TILES`)
should not depend on it.

The screenshot is taken after the measured camera moves, once the camera is back at the measured view.
In the densest views (scale 0.01) GPU rasterization is not bit-exact between page loads: the same version
can differ from itself by a few grey levels in a few hundred pixels. A culling error, such as a missing
or extra block or connection, differs by a much larger delta.

Chromium comes from Playwright (`npx playwright install chromium`). On macOS it uses ANGLE Metal for a
hardware canvas. Inside a sandbox that blocks Mach ports, run it outside the sandbox.

## Scene bench (WebGL scene research, E1 and E2)

`scene-run.mjs` measures the working tree only. It draws one Nirvana-like scene in two columns:

- `walk`: today's component walk. `NirvanaLikeBlock`, core anchors, `MultipointConnection` on the Path2D batch and a
  `BlockGroups` layer.
- `interpreter`: the scene prototype (`packages/graph/src/lib/scene`). A `SceneCanvasLayer` draws the same look from
  scene data without walking components.

Both columns draw blocks through the same `drawElements()`, and the `pixels` line checks that the pictures match. The
expected residue is a few levels of anti-aliasing and alpha rounding on edges. The `severe` count (pixels off by more
than 8 levels) stays under ~100 with `--gpu`. With SwiftShader it reaches tens of thousands at scales 0.3 and 0.6, on
thin vertical lines where connection segments overlap. The likely cause, supported but not proven: the two columns
group overlapping segments into different `stroke` calls (walk: per chunk; interpreter: per run). SwiftShader draws one
stroke over coincident lines as one line, but separate strokes darken the edges. A run cap can raise or lower the
count.

A tick is one run of the global scheduler (`graph.scheduler.performUpdate()`), with every layer included. A sample is
the work of one action (a camera step or a drag step): the durations of consecutive ticks from the first tick after the
action until the first idle tick (under 0.05 ms), at most 5 ticks. It is summed because walk drag spills into the next
tick (`api.updateBlock` / `updateConnection` re-render one tick later); the first tick alone would under-measure it.
`(<n> ticks)` is the mean number of working ticks per action. `frames` are the intervals between the first ticks of
consecutive actions.

Reading these numbers:

- **Drag** is the cost of one isolated drag step: the time to the final picture. In a continuous drag the walk's
  second redraw would merge into the next frame's tick, so a per-frame comparison is closer to pan.
- **Timer.** A `file://` page is not cross-origin isolated, so `performance.now()` is coarsened to ~0.1 ms. An idle
  tick can then read above `IDLE_TICK_MS` and count as a working tick; that is part of every `(1.1 ticks)`.
- **Anchor counter.** The wrapper on `Anchor.prototype.render` that counts visible anchors stays installed during the
  walk's measured ticks.

At the 1600×1000 view the guarantee scene fits at scale ≈ 0.038 (all 10,000 blocks visible). At 0.05 only ~59% of
its blocks are visible.

The scenes:

- `guarantee`: the sizes Nirvana guarantees. ~10k blocks with ≥3 anchors, ~10k orthogonal connections with arrows, ~1k
  groups.
- `median`: 130 blocks.
- `stress`: 100k blocks.

Labels and custom elements are not part of these scenes yet (E11, E8).

```bash
node scripts/bench/culling/scene-run.mjs --scenes median,guarantee --scales 0.05,0.15,0.3,0.6 --modes pan,zoom,drag
node scripts/bench/culling/scene-run.mjs --scenes guarantee --scales 0.05 --modes pan --repeats 1 --profile /tmp/scene-profiles
```

`--profile <dir>` writes a Chrome CPU profile of the first `pan` run per column (open it in Chrome DevTools →
Performance). `--shots <dir>` keeps the compared screenshots.

By default Playwright's Chromium renders with SwiftShader, a software rasterizer: the Canvas2D calls and the canvas
raster then cost main-thread time that a hardware canvas does not. `--gpu` launches Chromium as `run.mjs` does
(`channel: "chromium"`, ANGLE Metal on macOS, no SwiftShader fallback). The second line of the output names the WebGL
renderer, so every run says which one it used.

`--run-cap N` passes `maxRun` to the interpreter's `drawElements()`: a run of same-style paths and polygons is drawn
after N of them. The column is then named `interpreter-capN`. A list such as `--run-cap none,200` measures one
interpreter column per value; `none` is the unbounded default. Each value must be `none` or a positive integer, and
none may repeat. The cap exists because Chromium's `Path2D.closePath()` costs time in proportion to the path built so
far: one run with all connection arrows of a zoomed-out frame costs quadratic time.

`cached` (E2b, `--renderers walk,interpreter,cached`) is the interpreter with the connections held in a
`ScenePathBatch` (`zIndex: 1`, cell 8192, chunk 200) instead of the store. The batch caches chunk paths per grid cell
as the walk's `BatchPath2DRenderer` does, so it answers whether the interpreter still loses once it stops
rebuilding connection paths every frame. Known differences from the walk: the bounds carry a 2-unit pad; arrows are
drawn over the lines (the walk draws them under); there is no per-connection label pass; a drag can move items into
other chunks. A drag updates the moved connections with `batch.update()`. `--run-cap` does
not apply to this column (there is one `cached` column and no `maxRun`): its store holds no paths or polygons. Its
visible line adds `batched N chunks M`, the primitives and chunks the batch drew in the frame; `elements` counts store
elements only. Its pixels are compared with `walk` like the other columns. E2b command line (outside the sandbox):

```
node scripts/bench/culling/scene-run.mjs --gpu --scenes median --scales 0.05,0.3 \
  --renderers walk,interpreter,cached --run-cap 25 --repeats 1
```

Each mode's line ends with `action N ms`: the mean synchronous cost of the call that performs one measured action
(`column.drag()` or the camera call), timed outside the scheduler ticks. A sample is only the ticks, so the full cost of
an action is the measured ticks plus `action`. In `drag`, `interpreter` and `cached` compute the routes and geometry of
the moved connections inside `action`, while the walk does that work inside its ticks (about 2.1 ticks against 1.1), so
compare drag columns on ticks plus `action`, not on ticks alone.

`--query-timing [rounds]` (default 40): after the screenshot, each interpreter column times the tile-index query, the
sort of its result, `SceneStore.query()` and one `drawScene()` apart at the measured view, and prints the medians.
