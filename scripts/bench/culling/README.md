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

`--renderers canvas,webgl` (default `canvas`) sets the `connectionsRenderer` setting; every variant x renderer is a
column named `variant/renderer`, and the first column is the pixel reference. `--effect none|dash|static-dash|style` installs a
connection class that overrides `getStroke()` (`dash`: animated dash pattern; `static-dash`: the same pattern, still;
`style`: color and width from the connection id); variants without `getStroke()` draw those connections as usual. `--modes` also accepts `idle` (no
camera change, one frame per step) and `drag` (moves the block with the most connections by 3 world units back and
forth). Each mode prints `<mode> <mean update ms> ms frames <p50>/<p95>`: the frames are the
intervals between measured steps. In `pan`, `zoom` and `drag` each step waits for a graph-layer update, so the frames are
update-gated and include GPU-bound frames the update time does not see; in `idle` they are pure `requestAnimationFrame`
intervals. `timeouts N` appears when N measured steps waited 20 frames without an update, which inflates the p95. In `idle`
the update time is 0 when no GraphLayer update ran. WebGL columns add `gl <ms> ms <calls> calls <instances> inst <items> items`:
the main-thread time of WebGL draws per measured frame, and the instanced draw calls, instances (cubic pieces) and
connection items with an appearance per WebGL draw (items compare with the visible connections despite curve
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
