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
have labels). Each Canvas result reports `stroke(Path2D)` and `fill(Path2D)` separately from `strokeRect` and `fillRect` for one
frame at the measured view. Counting happens after the timed frames.

`--renderers canvas,webgl` (default `canvas`): every variant x renderer is a column named `variant/renderer`, and
the first column is the pixel reference. The API is detected per variant from the bundle's exports:

- **Unified scene** uses the graph's `renderer` setting and reports the active backend through `graph.scene.$renderer`.
  Both columns use `SceneLine`. Older unified revisions expose `WebGLLine` and omit the separate renderer diagnostics.
  Use the scene benchmark for timing the full scene frame.
- **Separate WebGLLine renderer** (`WebGLLine` and the diagnostics are exported): the renderer comes from the connection class. The WebGL column uses
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

## ETL selection, drag and edits

The selection benchmark uses the **ETL at scale** story with 10,000 blocks and 10,000 connections.
Build the workspace packages and start the development Storybook on port 6017.

```sh
pnpm run build
pnpm --filter @gravity-ui/graph-storybook exec storybook dev -p 6017
```

Run the selection benchmark from the worktree root in another terminal.

```sh
node scripts/bench/etl-selection-drag.mjs /tmp/etl-selection-drag.json 3
```

The runner compares group selection and drag on Canvas and WebGL with Live, HTML cards and the minimap off.
It selects the 19 stages in pipeline `p01`, then drags the selection with pointer input at 60 Hz.
The JSON separates the selection action (`select`), its following frame (`selectionPresent`) and the drag.
For a slow drag, compare the browser frame interval (`p95`), synchronous scene update (`scene95`) and time
handling delivered pointer moves (`input95`).

The standalone test `node --test scripts/bench/test/etl-camera-motion.test.mjs` checks camera motion, restart and
cancellation with a deterministic clock.

For a **Live** profile, take the longest animation-frame interval overlapping each simulation tick and its first
scene paint. The story updates every 500 ms, so including idle frames can hide stalls at a status change.

## Scene bench (WebGL scene research, E1 and E2)

`scene-run.mjs` measures the working tree only. It draws one Nirvana-like scene in two columns:

- `walk`: today's component walk. `NirvanaLikeBlock` (a `LegacyCanvasBlock`, walked and drawn on the GraphLayer
  canvas), core anchors, `MultipointConnection` on the Path2D batch and a `BlockGroups` layer. Since plan 3a the
  anchors are retained scene components: the walk no longer visits them, the scene draws them as child elements of
  their blocks' (empty) elements, and the `anchors` count of `visible()` is the number of child elements in view.
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

Under each column's main line the runner prints one more line, `median (min-max) of <repeats>`:

- `mount`: the synchronous `setEntities` + `start` + three `graph.scheduler.performUpdate()` calls, in ms. It is
  measured at the default camera, before the bench calls `centerAt(scale)` (so the camera is not yet at the measured
  scale), and the three updates are the only ticks it includes. Only the `walk` column mounts real components; the
  other columns print `n/a`. Later tasks must measure mount the same way.
- `heap`: JS heap in MB after the scene has settled: two forced `gc()` calls separated by one animation frame. The
  runner launches Chromium with `--js-flags=--expose-gc` and `--enable-precise-memory-info`; without them the number
  is NaN or coarse.
- `select-all`, `drag-start-1000`, `change-all`: `window.bench.bulk({ count: 1000 })`, run last in every repeat (each
  repeat has its own fresh page, so the actions never touch another repeat's measurements). Each is the synchronous
  action plus the two scheduler ticks that draw it: select every block; start a drag of 1000 selected blocks (the
  `DragService` state, then `handleDragStart` of each, batched by `graph.scene.batchRaises` where it exists); change
  the status of every block. Task 17i fix round 1 adds the WebGL uploads of select-all and change-all (KB, calls and
  the ms of the calls, from the patched `WebGL2RenderingContext`), the ms of change-all's two ticks, and each upload
  call of the last repeat's change-all (`change-all calls`).
- `--bulk-spin [ms]` (off by default; 400 when given without a value; a finite number of ms of at least 0, anything
  else exits with an error): every column's page runs a busy loop of `ms` (arithmetic only: no allocation, no heap
  reads) right before `bulk()`, in the same `page.evaluate`. The bulk actions are bursts of 50–300 ms that start right
  after the drag run, and a burst after a mostly idle main thread runs its first ~100 ms slower (Task 17f: consistent
  with CPU power/scheduling state; GC does not explain the excess). `blocks-webgl` ticks cost 3–5 ms, so its main
  thread is idle most of the frame before `bulk()` and its `updateBlock` share comes out ~15–25 ms above `blocks`;
  with `--bulk-spin 400` both start busy and the gap falls to ~1–7 ms. The header line ends with `bulk-spin <ms>`.
  Numbers with and without it are not comparable; the gates are measured without it.
- `--export [level]` (off by default; `schematic` when given without a value): after the bulk actions (and the visit),
  each real-blocks column (`walk`, `blocks`, `blocks-webgl`, `blocks-default`) times `graph.scene.toImage()` of the
  whole scene (the hit test's usable rect) at the measured scale and that level, three runs per page (Task 17g). At
  0.038 the camera is at the minimalistic level, so the export creates the anchor components of every block that the
  camera never showed at schematic, draws, and drops them. Two lines: the total with its prepare / draw / cleanup split,
  the ticks after the export (until an idle one), the first run of each page, the anchors created, and the store size
  before, at the peak and after; then the JS heap after a forced GC before, at the peak (a GC forced inside the third
  run, right after the preparation; that run's times are not reported) and after. The header line ends with
  `export <level>`.

- `--camera-aware-names [family]` (Task 17i, off by default): the `blocks` and `blocks-webgl` columns draw each block's
  name as a camera-aware text over its body (12 screen px, at most 48 world units, bold, centred both ways in the body
  with 12 units of padding: one to three lines from scale 1 down to 0.25), in `family` when given (`system-ui`: a font
  whose widths do not scale linearly, laid out again at every size). The other columns and the pixel comparison at
  the measured scale (no text is drawn at 0.038) are unchanged.
- `--sweep [from,to,steps]` (Task 17i, off by default; `0.25,1,30` when given without a value): after the modes, the
  `blocks` and `blocks-webgl` columns zoom about the scene's centre from `from` to `to` and back in `steps` geometric
  steps each way, once unmeasured (lazy anchors, caches) and once measured. One line: the scheduler ticks of each step
  (until an idle one; median, p95, max), the frame intervals (median, p95; vsync-bound), the texts the WebGL backend
  laid out again per step (`stats.lastTextRelayouts`, summed over the step's draws) and those laid out again with the
  same glyphs (`lastTextRelayoutsKept`, nothing written), their share of the blocks in view, the bytes and calls of
  every WebGL upload of the step (counted on `WebGL2RenderingContext`'s `bufferSubData`, `bufferData`,
  `texSubImage2D` and `texImage2D`, so any tree measures the same way) and the time of those calls, the re-layout ms,
  and on steps that lay texts out the uploaded bytes over the glyph bytes of those texts (`lastTextRelayoutGlyphs` x
  112).
- `--toggle [scale]` (Task 17i, off by default; 0.25 when given without a value): after the sweep, the `blocks` and
  `blocks-webgl` columns time the frame that turns the `cameraAwareText` setting off and the one that turns it on
  again at `scale` (three rounds per page): the synchronous `updateSettings` and the ticks until an idle one, with the
  re-layouts, the upload bytes and calls, and the glyph bytes of the texts laid out again.
- `--upload-policy gap,spans[,enclose]` (Task 17i): sets `instanceUploadPolicy` (the dirty-span merge threshold in
  bytes, the per-frame span cap of `InstanceRanges`, and, fix round 2, whether a dense change goes up as its enclosing
  span: 1, the default, or 0) before the column is set up; a tree without it exits with an error.
- `--no-bulk`: skips the bulk actions at the end of each repeat (their columns print `n/a`).

Note on `first two frames`: `instrument()` now runs after the column is set up, so the walk column's mount ticks (now
counted in `mount`) are no longer part of `first two frames`. Numbers from before this change are not comparable; use
only the baseline recorded after it.

Reading these numbers:

- **Drag** is the cost of one isolated drag step: the time to the final picture. In a continuous drag the walk's
  second redraw would merge into the next frame's tick, so a per-frame comparison is closer to pan.
- **Timer.** A `file://` page is not cross-origin isolated, so `performance.now()` is coarsened to ~0.1 ms. An idle
  tick can then read above `IDLE_TICK_MS` and count as a working tick; that is part of every `(1.1 ticks)`.
- **Anchor counter.** Anchors no longer render: `visible()` counts the scene's child elements in the camera's world
  rect (`graph.scene.query`), so nothing is installed on `Anchor` during the measured ticks.

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

`--run-cap N` limits each stroke to N consecutive opaque paths with the same style. A list such as
`--run-cap none,200` measures one interpreter column per value, with `none` as the unbounded default.
Each value must be `none` or a positive integer and appear only once. The capped column is named `interpreter-capN`.
The interpreter paints each polygon and translucent path in scene order.

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

`--drag-offset N` (default 3): the `drag` mode moves the block with the most connections by N world units back and
forth, in every column. The default keeps it inside its group. With `--drag-offset 200` on the guarantee scene the
block lies over its right neighbour on every other step, so with `--block-opacity` the overlap levels of the webgl
column change on every step (the neighbour's instances are then drawn from where they lie, see C16).

`--query-timing [rounds]` (default 40): after the screenshot, each interpreter column times the tile-index query, the
sort of its result, `SceneStore.query()` and one `drawScene()` apart at the measured view, and prints the medians.

`webgl` (`--renderers walk,interpreter,cached,webgl`, needs `--gpu`) draws the same store with a `SceneRendererLayer`
and the lazily loaded WebGL backend. Its store uses the default z buckets (groups 50, connections 100, blocks and
anchors 200) instead of the 0/1/2 of the other columns; `setup()` waits for the `webgl` state and a
`webgl-fallback` is a hard error. Its `elements` count is `store.query()` over the view; a `webgl:` line adds
`deviceMs`, `lastReplayMs` (initial replay), the last frame's `instances` and `drawCalls` (with the translucent pass's
share: for each overlap level, for each step, one draw call per program), `translucent levels N` with the time of the
last level update and of the last sort of the translucent instances (`lastLevelsMs`, `lastTranslucentOrderMs`: after
`pan` and `zoom` these are the full build of the first frame, since a pan or a zoom rebuilds nothing; after `drag`,
the last moved block's), and the SKIPPED counts of
polygons and icons: the slice has no support for them, so the webgl column draws fewer primitives than the others
(the bench scene has one arrow polygon per connection). **The webgl tick is CPU
only** (layer render and the submission of `backend.draw`); GPU execution is not in it, so compare `frames` p50/p95 with
the other columns, not the tick.

`--block-opacity X` (webgl column only; the other columns ignore it) puts a style with `opacity: X` on every block
element, so every block is drawn in the translucent pass. The `webgl:` line then names the opacity, and its translucent
draw calls show the cost of the overlap levels: the guarantee scene's blocks lie over their groups (level 1) and not
over each other, so the pass is a few draw calls (the groups' rects, then the blocks' bodies, texts and anchors).
Pixels of that column differ from `walk`, which draws opaque blocks.

`node scripts/bench/culling/scene-size.mjs` (M1, no browser) bundles `WebGLSceneBackend.ts` with esbuild (minified ESM)
and prints raw and gzip bytes, the bytes by package (`@luma.gl/*`, `@mapbox/tiny-sdf`, `@math.gl/*`, `@probe.gl/*`,
our code) and the top 10 inputs; then bundles `SceneRendererLayer.ts` with splitting, prints every chunk, and fails if
the main chunk ("layer plus core") contains any `@luma.gl` input.

## WebGL scene slice harness (`scene-slice.mjs`)

`node scripts/bench/culling/scene-slice.mjs` (outside the sandbox: it needs the GPU and Playwright) bundles
`scene/slice.ts` the way `scene-run.mjs` bundles `scene/entry.ts`, opens it in Chromium with the real GPU (ANGLE Metal on
macOS) at 800x600, DPR 2, and runs the checks of the WebGL vertical slice: C1 draw order and text, C2 z raise, C3
translucent blend, C4 overlap by order, C5 animated dash and idle frames, C6 camera-aware border width at three scales,
C7 HTML over the canvas (a `page.screenshot` decoded in the page), C8 range upload after a primitive change, C9 context
loss and restore with a moving block, C10 style change without re-encode, C11 growth with 3000 elements, C12
`visible: false` hides the whole primitive, C13 styles in WebGL (three lines: a translucent border override blended
like the Canvas2D picture of the same scene, drawn offscreen with `drawElements`; a style's `raise` above a later block
of the same bucket; a base colour filling a rect without a fill, with no re-encode), C14 `dim` (three lines: an element
with `dim: 0.5` matches the Canvas2D picture in its body, border band, black title and unparted circle and against the
analytic mix with the dim colour, with no re-encode; its rect instances stay in the opaque pass, read from the backend's
per-pass counts, so a translucent rect of a lower bucket added after it stays under it; a part's `dim: 0` wins over the
element's, and a translucent colour with `dim` matches the premultiplied Canvas2D picture), C15 `opacity` (three lines: an
element with `opacity: 0.5` matches the premultiplied Canvas2D picture in its body, its border band over the body (each
primitive fades on its own) and an unparted circle, and against the analytic "over"; its white title's brightest red
matches; it is re-encoded; the translucent draw calls are 0 before and 3 after; two faded blocks of one bucket, the later
one's body over the earlier one's title, compared by the title's brightest red with Canvas2D and the analytic value, the
wrong order's value printed next to it; a faded path over a faded rect of an earlier element of the same bucket), C16
translucent batching by overlap levels (five lines: a 10 x 10 grid of faded elements that do not overlap, each a body
rect and a title, draws with at most 6 translucent draw calls on one level and matches Canvas2D; a stack of three
overlapping faded elements keeps scene order in the triple overlap and under the second body, with 6 draw calls on 3
levels; dragging the middle one of three faded elements onto the first by an `x` update puts its body over the first
one's title in the next frame and leaves the third one's picture alone, with 2 draw calls before and 6 after: the
move changes no range (the rect list's layout revision is unchanged), so the dragged element's instances are drawn
from where they lie, between the other two; adding faded rects past the translucent rect buffer's capacity in one
frame, after a frame that drew from rect instances 1 and 2, grows the buffer (its generation changes) and still
matches Canvas2D; with 10,000 faded elements and three opaque ones in one band, off screen, raising an opaque one
(which renumbers the ranks of the whole band) runs no level update and rebuilds no draw runs, while raising a faded one
updates the levels; the line prints the call and tick times of each raise and the first tick after adding them), C17
level masks (one element with a red rect for minimalistic, a green for schematic and a blue for detailed at one place:
each level, reached by zooming, shows its own rect and matches Canvas2D, with no re-encode), C18 child elements (five
lines on an owner P with a child circle C on its right edge, a later owner Q of the same bucket over C's right half
and an owner X of that bucket between them, off screen: order, where C draws above P and under Q, raising P brings C
above Q with no re-encode, also outside P where only Q lies under C (X makes the ranks move by two, so a child texel
that kept P's old key would fall under Q), hiding P hides C, and P's `dim` and C's own `opacity` show on C as in the
Canvas2D picture; re-basing, where a later sibling C2 stays over C when C grows so that its circle moves to sub 3,
with 4 primitives re-encoded; childOrder, where moving C after C2 draws it over C2 in the next frame; translucent,
where faded P, Q and C, with C in the translucent set before P, match Canvas2D on at least 3 overlap levels; one frame,
where moving C, deleting P and adding P hidden and C again without a read keeps C hidden until P is shown, in the
`webgl` state), C19 real blocks through the scene (two default `Block`s overlap and the later one covers the first
one's right border and its OUT anchor, a child element; WebGL matches the Canvas2D picture in the body, the inside
border band, the anchor and the title's darkest pixel; selecting the first block recolours its border and raises it
with its anchor over the second one, with no re-encode), C20 export (in the `webgl` state `graph.scene.toImage()` of
the current view draws the scene through the interpreter over the layer canvases under it; at A's body, the line L and
B's body its opaque pixels match the WebGL picture), C21 the adaptive depth budget (three lines on
a default `Block` W1 with 40 anchors, 20 IN and then 20 OUT, 5 + 80 primitives, and a later block W2 over its OUT
anchors 10..19: budget, where W1 stays on WebGL with no state change, no backend failure or limit error and a sub-order
width of 7 bits, read from the backend's `stats.subBits`; order, where its OUT anchors 0..9 draw over its body and
border and its anchors 10..19, at subs 65..83 past the old fixed 32, under W2's body, as on Canvas2D; growth, where
going from 10 anchors (5 bits) to 40 (7 bits) encodes only the 30 new anchors' 60 primitives, and W1's own only if its
look changed: a width change re-encodes nothing, only the shader's `scene_subs` changes), C22 camera-aware text in a box
that holds its line or not (Task 17h: a 48-high black block with a white 13 px "NOON", `size: 13, cameraAware: {
maxWorld: 104 }`, centred by `align: "center"` and `verticalAlign: "middle"` in its `height: 48` box, `lineHeight` 16;
the block's centre at CSS (400, 300); at scales 1 and 0.5 the ink's coverage-weighted centre is v1's (the line's top half
the pitch above the box's centre, the capitals on the baseline the shared metrics put below it, the ink centre from
`measureText`'s glyph box) within 1 CSS px on both WebGL and the Canvas2D picture, WebGL's coverage within 10 % of
Canvas2D's with the brightest red matching, and the coverage within 25 % across the two scales (a 13 px name); at 0.125
the block is 6 px high and the 13 px line does not fit: neither renderer draws ink), C23 text reuse on re-encode, C24 the encode fast paths (after each step every list's GPU buffer, read
back, holds its CPU floats, and the opaque glyph pass is written and uploaded as the step needs: nothing for a keep, the
glyph subs only (their own buffer, a range) for a re-sub, both for an encode; steps run in a row on the same backend,
so adopted records feed later steps; after each step the backend's instances of the elements, in every batch, equal bit
for bit, with each table's element index, the ones of the same primitives added as fresh far-away elements: C23 an
owner with a body, two titles and a progress rect that comes and goes, the glyph subs alone written when the rect moved
the titles' subs, the glyphs too when a title changed; C24 a child with a text under an owner that changes only a fill
and then gains a rect, a translucent rect that comes and goes with `stats.translucentLevels`, a path added to and
removed from an element without one), and C25 a re-subbed title over a primitive inserted before it (a black plate
inserted between a black body and a white "NOON", then removed: WebGL's coverage of the name within 10 % of its first
step's and of Canvas2D's, and only the glyph subs written and uploaded; a sub left behind on the GPU ties the plate's
depth and hides the name), C26 one clip rule in both renderers (Task 17h fix round 1: three white texts on black bodies
whose layouts overflow their boxes, a world text kept on one line wider than its box, a world text with a line pitch under
its size whose third line's em box passes the box, and a camera-aware 14 px line that outgrows its box as the camera zooms
out; through scales 2 to 0.15 each overflows at one scale at least, the ink outside each box grown by 1 CSS px is 0 on
WebGL and on the Canvas2D picture, with ink inside where a line fits; a fourth text that fits its box is not clipped, so
its "Å" ring and "j" overhang it in both renderers at scales 2 to 0.5, as in v1), C27 the same
line breaks in both renderers (a corpus with long words split by characters, several spaces, newlines and tabs, an
ellipsis, world and camera-aware sizes: each text's ink lines, runs of rows with ink, are as many as the shared
layout's lines on both renderers and agree within 1 CSS px at their tops and bottoms and 1.5 at their ends) and C28
re-layout while drawing (a zoom across a line break draws the new lines on WebGL in the same frame with a text
re-layout counted in it, and a 1 % zoom inside the breaks re-lays out and encodes nothing; a camera-aware text left
stale off the view draws its new lines in the first frame a pan shows it, after which `stats.staleTexts` is 0; the
`cameraAwareText` setting redraws the world lines in the next frame and back; a web font loaded under the text's family
recreates the backend on `loadingdone`, and the lines come from the new metrics on both renderers; a second C28 line
zooms a camera-aware text in a translucent colour across a break: its glyphs alone are re-encoded, and its lines and a
faded stripe of the same element match Canvas2D, recorded as C28b), and C29 break-change uploads (Task 17i: 30
elements with camera-aware names, three in `system-ui`, three translucent and three under a translucent stripe, zoomed
0.6 to 0.2 in 24 steps and then through the `cameraAwareText` setting off and on: each frame that lays texts out again
uploads at most twice the glyph bytes of those texts, no list whole, and only the glyph instance lists; a frame that
lays nothing out uploads nothing; in the middle, at the end and after the setting, every element's floats equal a
fresh encode's, every GPU buffer holds its CPU floats, and the picture equals the one a full replay draws). C30 —
anchor classes: a `getAnchorClass` square matches Canvas2D; a class that declares the minimalistic level is created and
drawn there (C30b: a block removed and added back in one frame keeps that anchor, bound to its new state, and draws
it there). C31 — nested children: the pre-order draws as Canvas2D does; hiding a child hides what is nested in it
on WebGL. C32 — child scene components: a button child draws over its block and under its anchor as Canvas2D does; a
hovered rule recolours it without re-encoding. C33 — the handover: a block an HTML view holds is not drawn at the
detailed level, with no re-encode, and is drawn in the first frame after a zoom-out. C34 — the same-frame re-add family
(Task 3y), in pixels of the graph layer's canvas: a connection removed and added back before a frame is drawn, and a
block that left a collapsed group by such a re-add draws its connection from its own port, not from the group's edge. C35 — bounds grown by a style (Task 6), in pixels of the Canvas 2D
renderer (it runs last, with the renderer set to "canvas"): a hovered anchor whose own bounds lie left of the viewport,
but whose dot scaled ×1.8 reaches into it, is drawn there. M5 is a
zoom sweep over 400 camera-aware names: the texts re-laid out per step, the glyphs written, the time, the upload kinds
and bytes, and the opaque glyph buffer's size. M8 (Task 17i fix round 1) is the worst case of upload calls: 10,000
camera-aware texts in view, every hundredth one laid out again in each frame (the texts, bytes, writes and the time of
the upload calls). M6 reports, per font family (`system-ui`, `sans-serif`, `YS Text, sans-serif`, Arial, monospace) and
character group (Latin, Cyrillic, emoji), whether its widths scale linearly (a non-linear text is
measured at each size). A
buffer grows only when ranges were added, and then the backend sorts the translucent instances
first, so the first draw of each program in that frame starts at instance 0: the fourth line passes with or without
the backend's rebind after a resize; it guards the picture, not that code path. It also
prints a HEADER line with
the context's `DEPTH_BITS` and `SAMPLES` (a SETUP FAIL if the depth buffer is under 24 bits), and prints
M2 (device and first-frame time, time to the `webgl` state), M3 (replay time) and M4 (when luma is loaded).

Each line is `<id> PASS|FAIL <details>` with the numbers read (INFO for measurements); the exit code is 1 if any check
fails. A FAIL is a finding: the thresholds are not tuned to pass. Pixels are read with `gl.readPixels` in the same task
as a synchronous `graph.scheduler.performUpdate()` (the drawing buffer is not preserved) and are premultiplied; every
sampled point lies over an opaque pixel or on a transparent one, so no un-premultiplication is needed. Points are given
in world units; the camera puts world (0, 0) at CSS (100, 100) so that negative world x is on screen. B's title sits at
the bottom of B so that C4 can look for white pixels in A's title box.

Both the harness and the webgl column of `scene-run.mjs` run on `graph.scene`: elements are written to
`graph.scene.store` (`@internal`), the renderer is switched with `graph.updateSettings({ renderer: "webgl" })`, the
state is read from `graph.scene.$renderer` and the backend from `graph.scene.layer.getBackend()` (also `@internal`,
for the benches only). They no longer add a standalone `SceneRendererLayer`.

### `blocks` columns (plan 3a: real scene blocks)

`--renderers blocks,blocks-webgl,blocks-default` measure the real path: `CanvasBlock` subclasses that draw from level
methods (`schematic`/`detailed`), their core anchors as child scene elements, `MultipointConnection` on GraphLayer's
Path2D batch and a `BlockGroups` layer.

- `blocks`: scene renderer `canvas`, the Nirvana-like look (`SceneNirvanaBlock`, `scene/blocks.ts`).
- `blocks-webgl`: the same on the WebGL backend (needs `--gpu`). The mount starts only once the backend is `webgl`, so
  every element goes through `applyMany`. Its tick still includes GraphLayer's connections on Canvas2D.
- `blocks-default`: canvas renderer with the default `Block` look (nothing registered for `nirvana-like`).
- `--minimap`: adds a `MiniMapLayer` to the blocks columns (compare the pan tick with and without it).
- `--no-anchors`: the `walk` and blocks columns set `useBlocksAnchors: false`, so no `Anchor` components and no anchor
  child elements exist; the first output line ends with `no-anchors`. Compare with a run without it to get the anchors'
  share of pan, mount, heap and the bulk actions. Connections still end at their anchor ports.
- `--far-anchors` (plan 3b, Task 13, report only): the blocks columns' blocks return an anchor class created and drawn
  at the minimalistic level too (`BenchFarAnchor`, a 6 x 6 square; `CREATION_LEVELS` lists all three levels), so every
  anchor in view exists at the far zoom: the worst case of a class that draws far away. The first output line ends with
  `far-anchors`. Compare with a run without it (mount, heap, pan, zoom and drag ticks at 0.038 and 0.3).
- `--child-looks [N]` (plan 3b, Task 13, report only; N defaults to 4, one of the two new-path cases, so it cannot be
  combined with `--far-anchors`): every block of the blocks columns gets N `SceneComponent` children, each a 12 x 12
  chip drawn on the schematic level (`BenchChip`). The first output line ends with `child-looks N`.
- `--modes hover` (plan 3b, Task 13): per step the pointer moves through the graph root's DOM listener, as a mouse does:
  body, then an OUT anchor, then body of one block, then the next block, over 30 blocks of the view. The tick is the
  scheduler work the move causes, `action` the time the graph takes to handle the `pointermove` (hit test, hover
  dispatch, tag writes); `minimap draws` counts the redraws of the minimap (`drawInterpreted` calls) over the repeats.
  The path is checked (its 30 stops hit their block and anchor components) and a run fails when the graph reports
  fewer `pointerenter` events than moves. `--hover-path <file>` writes the stops on the first hover run and reads them
  (and checks them again) on every later one, in either library tree, so two trees move the same path.
- **Lazy anchors** (Task 17c): anchors have no look at the minimalistic level, and a block creates its `Anchor`
  components only once the camera shows it at the schematic or detailed level. So the mount creates the anchors of the
  blocks the default camera shows (scale 0.5 at the world origin), and the measured view at 0.038 creates none. The
  median line of the `walk` and blocks columns ends with `scene elements after mount` (block elements plus those
  anchors). The blocks columns' mount waits for the block elements only.
- `--visit [scale]` (default 0.225, the first schematic scale): after the bulk actions of every repeat, the `walk` and
  blocks columns run `window.bench.visit()` and print two more lines:
  - `visit`: the pan at the measured scale (the same `run()` as the `pan` mode) before and after a zoom to `scale` at
    the view's centre and back, and their difference; and the interpreter's `store.query()` over the view at the
    current level before and after (median of 30 calls, with its element count and the store size). The anchors
    created by the visit stay mounted, and the level-filtered query skips their elements at the minimalistic level.
  - `first zoom-in`: the first zoom to `scale` (one `centerAt`) as an action: the synchronous camera change, which runs
    the anchors' view test (one hit-test search of the view), plus the scheduler ticks that draw it, in which the
    blocks in view create their anchors; `anchors created` counts the new scene elements. `second zoom-in` repeats it
    once the anchors exist. `pan at <scale>` is 40 camera moves at the schematic level, each with its ticks, and the
    view test's mean ms per camera change (`anchorViewStats`), per repeat.

Scene share: `scene` after a mode's numbers is the median ms per action spent in `graph.scene.update` (the rest of
the tick is GraphLayer's connections and groups). The mount line prints `mount <ms> (scene <ms>)` and the bulk
actions `(scene <ms>)`: level methods + element writes (`sceneComponentStats`) + the backend applies of the ticks
(`stats.lastApplyMs`). The mount, heap, select-all, drag-start-1000 and change-all lines of `blocks` compare against
the `walk` column.

```bash
node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan,zoom,drag \
  --renderers walk,cached,webgl,blocks,blocks-webgl,blocks-default --repeats 3
node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan \
  --renderers blocks --repeats 3 --minimap
node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan \
  --renderers walk,blocks,blocks-webgl,blocks-default --repeats 3 --visit
```

Plan 3a numbers (guarantee scene at 0.038, `--gpu`, 5 repeats, Apple M3 Pro, Chromium 145, ANGLE Metal), against the
baseline before plan 3a (ce527c07, 3 repeats). Median ms (MB for heap); the scene share in parentheses. Canvas 2D
columns vary by about ±1 ms run to run, so compare a column with `cached` of the same run.

| Column             | pan           | mount         | heap  | select-all  | drag-start-1000 | change-all   |
| ------------------ | ------------- | ------------- | ----- | ----------- | --------------- | ------------ |
| `walk`, baseline   | 37.45         | 753.8         | 279.1 | 98.8        | 40.8            | 267.0        |
| `walk`             | 17.78         | 514.4         | 194.6 | 79.5        | 24.6            | 116.5        |
| `cached`, baseline | 13.72         | n/a           | 34.9  | 4.2         | 0.1             | 0.9          |
| `cached`           | 14.78         | n/a           | 35.9  | 5.1         | 0.0             | 0.8          |
| `webgl`, baseline  | 1.04          | n/a           | 115.5 | 10.6        | 0.1             | 1.7          |
| `webgl`            | 0.78          | n/a           | 130.4 | 12.9        | 0.1             | 1.5          |
| `blocks`           | 14.03 (11.50) | 523.7 (46.6)  | 193.5 | 59.2 (0.0)  | 19.3 (0.0)      | 139.0 (27.9) |
| `blocks-webgl`     | 3.06 (0.27)   | 718.9 (295.8) | 267.5 | 77.4 (11.4) | 9.6 (0.7)       | 187.3 (55.7) |
| `blocks-default`   | 11.55 (8.93)  | 525.9 (47.9)  | 195.3 | 59.2 (0.0)  | 17.6 (0.0)      | 123.4 (21.9) |
