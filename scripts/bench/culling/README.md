# Culling benchmark

Measures the main-thread duration of one GraphLayer update while panning and zooming large scenes,
for several versions of `packages/graph` side by side, and checks that they draw the same pixels.

- **Scenes:** `nirvana` mirrors the Storybook `NirvanaMaxGraphTest` (13,916 blocks, bezier connections
  with arrows, no anchors); `playground` mirrors the Playground "10 000" preset (10,476 action blocks with
  two anchors each, straight connections). Both are generated with fixed seeds.
- **Views:** `near` is 1600x1000 CSS px, `full` is 1600x1600; DPR 2.
- **Variants:** `name=ref`, where `ref` is a git ref or `.` for the working tree. The first variant is the
  pixel reference.
- Every variant runs the same zoom history before measuring: the hot path is sensitive to JIT feedback.

```bash
node scripts/bench/culling/run.mjs --variants base=origin/v2,current=. --scales 0.01,0.02,0.05,0.1
node scripts/bench/culling/run.mjs --scenes nirvana --views near,full --scales 0.01 --repeats 5
node scripts/bench/culling/run.mjs --first --repeats 4
```

Options: `--scenes`, `--scales`, `--views`, `--modes pan,zoom`, `--repeats`, `--steps`, `--noop` (replace
fill/stroke calls with no-ops to isolate JavaScript cost), `--first` (only the first two frames after
mounting), `--shots <dir>` (keep the compared screenshots), `--headed`.

The screenshot is taken after the measured camera moves, once the camera is back at the measured view.
In the densest views (scale 0.01) GPU rasterization is not bit-exact between page loads: the same version
can differ from itself by a few grey levels in a few hundred pixels. A culling error, such as a missing
or extra block or connection, differs by a much larger delta.

Chromium comes from Playwright (`npx playwright install chromium`). On macOS it uses ANGLE Metal for a
hardware canvas. Inside a sandbox that blocks Mach ports, run it outside the sandbox.
