#!/usr/bin/env node
// scripts/bench/culling/scene-run.mjs
// Scene bench (WebGL scene research, E1, E2, E2b): the working tree only, one column per renderer, scene and scale:
// walk = today's component walk, interpreter = the scene prototype drawing the same picture from data (one column per
// --run-cap value), cached = the interpreter with its connections in a ScenePathBatch (cached chunk paths).
import { chromium } from "@playwright/test";
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? true : value;
}
const list = (value) => String(value).split(",").filter(Boolean);

const scenes = list(option("scenes", "median,guarantee"));
const scales = list(option("scales", "0.05,0.15,0.3,0.6")).map(Number);
const modes = list(option("modes", "pan,zoom,drag"));
const renderers = list(option("renderers", "walk,interpreter"));
for (const renderer of renderers) {
  if (!["walk", "interpreter", "cached", "webgl", "blocks", "blocks-webgl", "blocks-default"].includes(renderer)) {
    console.error(`scene-run: --renderers: "${renderer}" is not one of walk, interpreter, cached, webgl, blocks, blocks-webgl, blocks-default`);
    process.exit(1);
  }
}
// --minimap: the blocks columns also add a MiniMapLayer (its cost per tick, review I12).
const minimap = Boolean(option("minimap", false));
// --hover-path <file>: the hover mode's checked stops (3b Task 14). The first hover run writes them when the file does
// not exist; every later run, in either library tree and with or without --minimap, reads the same stops and checks
// them again.
const hoverPathFile = option("hover-path", undefined);
if (hoverPathFile === true) fail("--hover-path: give a file");
let hoverPath =
  hoverPathFile && fs.existsSync(hoverPathFile) ? JSON.parse(fs.readFileSync(hoverPathFile, "utf8")) : undefined;
// --far-anchors: the blocks columns' anchors use a class created and drawn at the minimalistic level (3b Task 13).
const farAnchors = Boolean(option("far-anchors", false));
// --child-looks <N>: every block of the blocks columns gets N child components with a look (3b Task 13).
const childLooksOption = option("child-looks", 0);
const childLooks = childLooksOption === true ? 4 : Number(childLooksOption);
if (!(Number.isInteger(childLooks) && childLooks >= 0)) fail(`--child-looks: "${childLooksOption}" is not a count`);
if (farAnchors && childLooks > 0) fail("--far-anchors and --child-looks measure one new path each: pass one");
// --no-anchors: the walk and blocks columns turn useBlocksAnchors off (no anchor components or child elements).
const noAnchors = Boolean(option("no-anchors", false));
// --visit [scale]: after the bulk actions, the walk and blocks columns visit the schematic level (default 0.225, the
// first schematic scale) at the view's centre and come back: the first zoom-in (lazy anchors are created), a second
// one, a pan at the schematic level with the anchors' view test, and the pan at the measured scale before and after.
const visitOption = option("visit", false);
const visitScale = visitOption === false ? undefined : visitOption === true ? 0.225 : Number(visitOption);
if (visitScale !== undefined && !(visitScale > 0)) {
  console.error(`scene-run: --visit: "${visitOption}" is not a positive scale`);
  process.exit(1);
}
// --bulk-spin <ms> (default 0, off): every column's page runs a busy loop of <ms> (arithmetic only: no allocation, no
// heap reads) right before bulk(), so every column starts the bulk actions with a busy main thread. Without it a column
// whose frames are cheap (blocks-webgl: 3-5 ms ticks) enters bulk() from a mostly idle main thread, and the first
// ~100 ms of the burst run slower (Task 17f: CPU state, not GC).
const bulkSpinOption = option("bulk-spin", 0);
const bulkSpin = bulkSpinOption === true ? 400 : Number(bulkSpinOption);
if (!(Number.isFinite(bulkSpin) && bulkSpin >= 0)) {
  fail(`--bulk-spin: "${bulkSpinOption}" is not a finite number of ms of at least 0`);
}
// --export [level] (off by default; "schematic" when given without a value): after the bulk actions (and the visit),
// the real-blocks columns time graph.scene.toImage() of the whole scene at the measured scale and that level, three
// times: the anchors the export creates and drops (Task 17g), its prepare / draw / cleanup split, the next tick, and
// the JS heap before, at the peak (right after the preparation, after a forced GC) and after.
const exportOption = option("export", false);
const exportLevel = exportOption === false ? undefined : exportOption === true ? "schematic" : String(exportOption);
if (exportLevel !== undefined && !["minimalistic", "schematic", "detailed"].includes(exportLevel)) {
  fail(`--export: "${exportOption}" is not one of minimalistic, schematic, detailed`);
}
// --camera-aware-names [family] (Task 17i): the blocks columns draw each name as a camera-aware text over the body,
// in `family` when given (system-ui: a font whose widths do not scale linearly, laid out again at every size).
const cameraAwareNamesOption = option("camera-aware-names", false);
const cameraAwareNames =
  typeof cameraAwareNamesOption === "boolean" ? cameraAwareNamesOption : String(cameraAwareNamesOption);
// --sweep [from,to,steps] (Task 17i, default 0.25,1,30): after the modes, a zoom sweep from -> to -> from (once
// unmeasured, then measured): per step the ticks, the frame interval, the WebGL text re-layouts and every WebGL upload.
const sweepOption = option("sweep", false);
const sweepArgs =
  sweepOption === false ? undefined : (sweepOption === true ? "0.25,1,30" : String(sweepOption)).split(",");
const sweepSpec = sweepArgs && { from: Number(sweepArgs[0]), to: Number(sweepArgs[1]), steps: Number(sweepArgs[2]) };
if (sweepSpec && !(sweepSpec.from > 0 && sweepSpec.to > 0 && sweepSpec.steps >= 1)) {
  fail(`--sweep: "${sweepOption}" is not from,to,steps`);
}
// --toggle [scale] (Task 17i, default 0.25): after the sweep, the frames that turn cameraAwareText off and on again.
const toggleOption = option("toggle", false);
const toggleScale = toggleOption === false ? undefined : toggleOption === true ? 0.25 : Number(toggleOption);
// --upload-policy gap,spans[,enclose] (Task 17i): InstanceRanges' span merge threshold (bytes), per-frame span cap,
// and whether a dense change goes up as its enclosing span (1, the default, or 0).
const uploadPolicyOption = option("upload-policy", undefined);
const uploadPolicyArgs =
  uploadPolicyOption === undefined ? undefined : String(uploadPolicyOption).split(",").map(Number);
const uploadPolicy = uploadPolicyArgs && {
  mergeGapBytes: uploadPolicyArgs[0],
  maxSpans: uploadPolicyArgs[1],
  enclose: uploadPolicyArgs[2] !== 0,
};
// --no-bulk: skip the bulk actions (select-all, drag-start, change-all) at the end of each repeat.
const noBulk = Boolean(option("no-bulk", false));
const repeats = Number(option("repeats", 3));
const steps = Number(option("steps", 40));
const headed = Boolean(option("headed", false));
const profileDir = option("profile", undefined);
const shotsDir = option("shots", undefined);
// --gpu: launch Chromium as run.mjs does, for a hardware canvas (ANGLE Metal on macOS, no SwiftShader fallback).
// Without it Playwright's Chromium renders with SwiftShader, a software rasterizer.
const gpu = Boolean(option("gpu", false));
// --query-timing [rounds]: after the screenshot, time the interpreter's tile query, sort, store.query() and drawScene()
// apart at the measured view (median of `rounds` rounds, default 40).
const queryTimingOption = option("query-timing", false);
const queryRounds = queryTimingOption === false ? 0 : queryTimingOption === true ? 40 : Number(queryTimingOption);
function fail(message) {
  console.error(`scene-run: ${message}`);
  process.exit(1);
}
// --run-cap N (or a list such as none,200): the interpreter's maxRun; one interpreter column per value. Each value is
// "none" (unbounded) or a positive integer, and no value may repeat: anything else would mislabel a column.
const runCapValues = list(option("run-cap", "none"));
for (const [index, value] of runCapValues.entries()) {
  if (value !== "none" && !/^[1-9]\d*$/.test(value)) fail(`--run-cap: "${value}" is not "none" or a positive integer`);
  if (runCapValues.indexOf(value) !== index) fail(`--run-cap: "${value}" is given twice`);
}
const runCaps = runCapValues.map((value) => (value === "none" ? undefined : Number(value)));
// --block-opacity X: the webgl column puts a style with `opacity: X` on every block (the translucent pass in scene
// order); the other columns ignore it.
const blockOpacityOption = option("block-opacity", undefined);
const blockOpacity = blockOpacityOption === undefined ? undefined : Number(blockOpacityOption);
if (blockOpacity !== undefined && !(blockOpacity >= 0 && blockOpacity <= 1)) {
  fail(`--block-opacity: "${blockOpacityOption}" is not a number in [0, 1]`);
}
// --drag-offset N: the drag mode moves the block by N world units back and forth (default 3, inside its group). A
// larger offset (200 on the guarantee scene) lays the block over its neighbour on every other step, so with
// --block-opacity the overlap levels change on every step.
const dragOffsetOption = option("drag-offset", undefined);
const dragOffset = dragOffsetOption === undefined ? 3 : Number(dragOffsetOption);
if (!Number.isFinite(dragOffset)) fail(`--drag-offset: "${dragOffsetOption}" is not a number`);
// walk and cached (E2b) get no run cap: the cached store holds no paths or polygons.
const columns = renderers.flatMap((renderer) =>
  renderer === "interpreter"
    ? runCaps.map((maxRun) => ({
        renderer,
        maxRun,
        name: maxRun === undefined ? "interpreter" : `interpreter-cap${maxRun}`,
      }))
    : [{ renderer, maxRun: undefined, name: renderer }]
);
const VIEW = { width: 1600, height: 1000 };
/** Columns with real block components (and so lazy anchors): the ones `--visit` measures. */
const realBlocks = ["walk", "blocks", "blocks-webgl", "blocks-default"];
// A pixel whose channel differs by more than this is a real difference, not edge anti-aliasing or alpha rounding.
const SEVERE_DELTA = 8;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "graph-scene-bench-"));

async function build() {
  const source = path.join(repo, "packages/graph/src");
  await esbuild.build({
    entryPoints: [path.join(here, "scene/entry.ts")],
    bundle: true,
    outfile: path.join(work, "scene.js"),
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    tsconfig: path.join(repo, "packages/graph/tsconfig.json"),
    alias: {
      GRAPH: path.join(source, "index.ts"),
      GRAPH_SRC: source,
      GRAPH_MINIMAP: path.join(repo, "packages/graph-minimap/src/index.ts"),
      "@gravity-ui/graph": path.join(source, "index.ts"),
    },
    nodePaths: [path.join(repo, "packages/graph/node_modules"), path.join(repo, "node_modules")],
    plugins: [
      {
        name: "inline-css",
        setup(css) {
          css.onLoad({ filter: /\.css$/ }, async (file) => ({
            contents: `const s=document.createElement("style");s.textContent=${JSON.stringify(
              await fs.promises.readFile(file.path, "utf8")
            )};document.head.appendChild(s);`,
            loader: "js",
          }));
        },
      },
    ],
    logLevel: "error",
  });
  const page = path.join(work, "scene.html");
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><style>html,body{margin:0}#root{position:relative}</style></head>` +
      `<body><div id="root"></div><script src="./scene.js"></script></body></html>`
  );
  return page;
}

const sorted = (values) => [...values].sort((a, b) => a - b);
const median = (values) => {
  const s = sorted(values);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (values, q) => {
  const s = sorted(values);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function countDifferentPixels(browser, a, b, severeDelta) {
  const page = await browser.newPage();
  const url = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
  const result = await page.evaluate(
    async ([first, second, severeDelta]) => {
      const load = (src) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = src;
        });
      const pixels = async (src) => {
        const image = await load(src);
        const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height).data;
      };
      const [left, right] = await Promise.all([pixels(first), pixels(second)]);
      const width = (await load(first)).width;
      let different = 0;
      let delta = 0;
      let severe = 0;
      let box = null;
      for (let i = 0; i < left.length; i += 4) {
        const d = Math.max(
          Math.abs(left[i] - right[i]),
          Math.abs(left[i + 1] - right[i + 1]),
          Math.abs(left[i + 2] - right[i + 2]),
          Math.abs(left[i + 3] - right[i + 3])
        );
        if (d > 0) {
          different++;
          delta = Math.max(delta, d);
          if (d > severeDelta) {
            severe++;
            const pixel = i >> 2;
            const x = pixel % width;
            const y = (pixel / width) | 0;
            box = box
              ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
              : [x, y, x, y];
          }
        }
      }
      return { different, delta, severe, box };
    },
    [url(a), url(b), severeDelta]
  );
  await page.close();
  return result;
}

const pagePath = await build();
const browser = await chromium.launch({
  headless: !headed,
  args: [
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    ...(gpu && process.platform === "darwin" ? ["--use-angle=metal", "--use-gl=angle"] : []),
  ],
  ...(gpu ? { channel: "chromium", ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] } : {}),
});
/** The WebGL renderer string: says whether this browser rasterizes on the GPU or with SwiftShader. */
async function rendererName() {
  const page = await browser.newPage();
  const name = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : "no webgl2";
  });
  await page.close();
  return name;
}
console.log(
  `repeats=${repeats} steps=${steps} view=${VIEW.width}x${VIEW.height} columns=${columns.map((c) => c.name).join(",")}` +
    (modes.includes("drag") ? ` drag offset ${dragOffset}` : "") +
    (noAnchors ? " no-anchors" : "") +
    (farAnchors ? " far-anchors" : "") +
    (childLooks > 0 ? ` child-looks ${childLooks}` : "") +
    (bulkSpin > 0 ? ` bulk-spin ${bulkSpin}` : "") +
    (exportLevel === undefined ? "" : ` export ${exportLevel}`) +
    (cameraAwareNames === false ? "" : " camera-aware-names") +
    (typeof cameraAwareNames === "string" ? ` ${cameraAwareNames}` : "") +
    (sweepSpec ? ` sweep ${sweepSpec.from}<->${sweepSpec.to} x${sweepSpec.steps}` : "") +
    (toggleScale === undefined ? "" : ` toggle at ${toggleScale}`) +
    (uploadPolicy
      ? ` upload-policy ${uploadPolicy.mergeGapBytes},${uploadPolicy.maxSpans},${uploadPolicy.enclose ? 1 : 0}`
      : "")
);
console.log(`chromium ${browser.version()} gpu=${gpu} renderer: ${await rendererName()}`);
for (const scene of scenes) {
  for (const scale of scales) {
    const shots = {};
    for (const { renderer, maxRun, name } of columns) {
      const results = Object.fromEntries(
        modes.map((mode) => [
          mode,
          { samples: [], frames: [], ticks: [], timeouts: 0, actionMs: [], scene: [], minimapDraws: [] },
        ])
      );
      let first = [];
      const sweeps = [];
      const toggles = [];
      const mounts = [];
      const mountScenes = [];
      const heaps = [];
      const bulks = [];
      const visits = [];
      const exports = [];
      const mountElements = [];
      /** The scene renderer's state (`graph.scene.$renderer`) after setup and after the modes, over the repeats. */
      const rendererStates = new Set();
      let sizes;
      let counts;
      let timing;
      let webgl;
      for (let repeat = 0; repeat < repeats; repeat++) {
        const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
        const page = await context.newPage();
        // Fallback evidence: the page's warnings and errors about the WebGL backend or the scene limits.
        page.on("console", (message) => {
          const text = message.text();
          if (["warning", "error"].includes(message.type()) && /fall|watchSceneLimits|WebGL scene/i.test(text)) {
            console.log(`          page ${message.type()} (${name}, repeat ${repeat}): ${text}`);
          }
        });
        page.on("pageerror", (error) => console.log(`          page error (${name}, repeat ${repeat}): ${error.message}`));
        await page.goto(`file://${pagePath}`);
        sizes = await page.evaluate((options) => window.bench.setup(options), {
          scene,
          renderer,
          width: VIEW.width,
          height: VIEW.height,
          scale,
          maxRun,
          blockOpacity,
          minimap,
          anchors: !noAnchors,
          farAnchors,
          childLooks,
          cameraAwareNames,
          uploadPolicy,
        });
        first.push(...sizes.first);
        mounts.push(sizes.mountMs);
        mountScenes.push(sizes.mountSceneMs);
        heaps.push(sizes.heapMB);
        mountElements.push(sizes.sceneElements);
        if (realBlocks.includes(renderer) && renderer !== "walk") {
          rendererStates.add(`after setup: ${await page.evaluate(() => window.bench.rendererState())}`);
        }
        for (const mode of modes) {
          const profiling = profileDir && repeat === 0 && mode === "pan";
          const cdp = profiling ? await context.newCDPSession(page) : undefined;
          if (cdp) {
            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.start");
          }
          const result = await page.evaluate((options) => window.bench.run(options), {
            mode,
            warmup: 10,
            steps,
            scale,
            dragOffset,
            hoverPath,
          });
          if (cdp) {
            const { profile } = await cdp.send("Profiler.stop");
            fs.mkdirSync(profileDir, { recursive: true });
            fs.writeFileSync(
              path.join(profileDir, `${scene}-${scale}-${name}-pan.cpuprofile`),
              JSON.stringify(profile)
            );
          }
          results[mode].samples.push(...result.samples);
          results[mode].frames.push(...result.frames);
          results[mode].ticks.push(...result.ticks);
          results[mode].timeouts += result.timeouts;
          results[mode].actionMs.push(result.actionMs);
          if (result.sceneMs !== null) results[mode].scene.push(result.sceneMs);
          results[mode].minimapDraws.push(result.minimapDraws);
          if (mode === "hover") {
            // Every move of the path changes the target (body, anchor, body, the next body): fewer `pointerenter`
            // events than moves mean the run did not take the path it reports. `10` is the run's warmup.
            const moves = 10 + steps;
            if (result.hoverEnters < moves) fail(`hover: ${result.hoverEnters} target changes in ${moves} moves`);
            if (!hoverPath) {
              hoverPath = result.hoverPath;
              if (hoverPathFile) fs.writeFileSync(hoverPathFile, JSON.stringify(hoverPath, null, 2));
            }
          }
        }
        if (realBlocks.includes(renderer) && renderer !== "walk") {
          rendererStates.add(`after modes: ${await page.evaluate(() => window.bench.rendererState())}`);
        }
        if (repeat === 0) {
          counts = await page.evaluate((options) => window.bench.visible(options), { scale });
          await page.evaluate((options) => window.bench.settle(options), { scale });
          shots[name] = await page.screenshot();
          if (shotsDir) {
            fs.mkdirSync(shotsDir, { recursive: true });
            fs.writeFileSync(path.join(shotsDir, `${scene}-${scale}-${name}.png`), shots[name]);
          }
          if (renderer === "webgl") webgl = await page.evaluate(() => window.bench.webglStats());
          // After the screenshot: drawScene() below draws over the picture.
          if (queryRounds) {
            timing = await page.evaluate((options) => window.bench.queryTiming(options), {
              scale,
              rounds: queryRounds,
            });
          }
        }
        if (sweepSpec && (renderer === "blocks" || renderer === "blocks-webgl")) {
          sweeps.push(await page.evaluate((options) => window.bench.sweep(options), sweepSpec));
        }
        if (toggleScale !== undefined && (renderer === "blocks" || renderer === "blocks-webgl")) {
          const toggleOptions = { scale: toggleScale, rounds: 3 };
          toggles.push(await page.evaluate((options) => window.bench.toggle(options), toggleOptions));
        }
        // Last in every repeat, on its own fresh page: the bulk actions leave the scene selected and restyled. The spin
        // runs in the same evaluate as bulk(), so no protocol round trip lets the core idle between them.
        if (!noBulk) {
          bulks.push(
            await page.evaluate(
              (options) => {
                if (options.spin > 0) window.bench.spin(options.spin);
                return window.bench.bulk(options);
              },
              { count: 1000, spin: bulkSpin }
            )
          );
        }
        if (visitScale !== undefined && realBlocks.includes(renderer)) {
          visits.push(await page.evaluate((options) => window.bench.visit(options), { scale, visitScale, steps }));
        }
        if (exportLevel !== undefined && realBlocks.includes(renderer)) {
          const exportOptions = { scale, level: exportLevel };
          exports.push(await page.evaluate((options) => window.bench.exportScene(options), exportOptions));
        }
        await context.close();
      }
      const parts = modes.map((mode) => {
        const r = results[mode];
        const timeouts = r.timeouts ? ` timeouts ${r.timeouts}` : "";
        const frames = `${median(r.frames).toFixed(1)}/${percentile(r.frames, 0.95).toFixed(1)}`;
        const ticks = mean(r.ticks).toFixed(1);
        const action = ` action ${mean(r.actionMs).toFixed(2)} ms`;
        const scene = r.scene.length ? ` scene ${median(r.scene).toFixed(2)} ms` : "";
        const draws = mode === "hover" ? ` minimap draws ${r.minimapDraws.reduce((sum, count) => sum + count, 0)}` : "";
        return `${mode} ${mean(r.samples).toFixed(2)} ms (${ticks} ticks) frames ${frames}${timeouts}${action}${draws}${scene}`;
      });
      console.log(
        `${scene.padEnd(9)} scale=${String(scale).padEnd(5)} ${name.padEnd(18)} ` +
          `[${sizes.blocks} blocks ${sizes.connections} connections ${sizes.groups} groups] ` +
          `first two frames ${Math.round(first.reduce((sum, value) => sum + value, 0) / repeats)} ms | ` +
          `${parts.join(" | ")} | visible blocks ${counts.blocks} anchors ${counts.anchors} ` +
          `elements ${counts.elements}` +
          (counts.batched === undefined ? "" : ` batched ${counts.batched} chunks ${counts.chunks}`)
      );
      const range = (values) =>
        `${median(values).toFixed(1)} (${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)})`;
      const shown = (values) => (values.some((value) => value === null) ? "n/a" : `${range(values)} ms`);
      const bulkOf = (key) => {
        if (bulks.length === 0) return "n/a";
        const sceneKey = key.replace("Ms", "SceneMs");
        const scenes = bulks.map((result) => result[sceneKey]);
        return range(bulks.map((result) => result[key])) + (scenes.some((value) => value === null) ? "" : ` (scene ${range(scenes)})`);
      };
      const mountScene = mountScenes.some((value) => value === null) ? "" : ` (scene ${range(mountScenes)})`;
      const elementsAtMount =
        (realBlocks.includes(renderer) ? ` | scene elements after mount ${median(mountElements)}` : "") +
        (rendererStates.size ? ` | renderer ${[...rendererStates].join(", ")}` : "");
      const uploadsOf = (key) => {
        const uploads = bulks.map((result) => result[key]).filter(Boolean);
        if (uploads.length === 0 || uploads.every((u) => u.calls === 0)) return "";
        const kb = uploads.map((u) => u.bytes / 1024);
        return ` | ${key.replace("Uploads", "")} uploads ${range(kb)} KB in ${range(uploads.map((u) => u.calls))} ` +
          `calls, ${range(uploads.map((u) => u.ms))} ms`;
      };
      const lastCalls = bulks.length > 0 ? bulks[bulks.length - 1].changeAllUploads?.log : undefined;
      const callsOf = (log) =>
        log.map((call) => `${call.name} ${(call.bytes / 1024).toFixed(1)} KB ${call.ms.toFixed(2)} ms`).join(", ");
      const changeAllCalls = lastCalls?.length ? ` | change-all calls (last repeat): ${callsOf(lastCalls)}` : "";
      const bulkUploads = uploadsOf("selectAllUploads") + uploadsOf("changeAllUploads") + changeAllCalls;
      const splits = bulks.map((result) => result.changeAllSplit).filter(Boolean);
      const changeAllSplit = splits.length
        ? ` | change-all split: updateBlock calls ${range(splits.map((s) => s.actionMs))} ms; scene: level ` +
          `${range(splits.map((s) => s.levelMs))} write ${range(splits.map((s) => s.writeMs))} apply ` +
          `${range(splits.map((s) => s.applyMs))} ms; its two ticks ` +
          `${range(bulks.filter((r) => r.changeAllSplit).map((r) => r.changeAllMs - r.changeAllSplit.actionMs))} ms`
        : "";
      console.log(
        `          median (min-max) of ${repeats}: mount ${shown(mounts)}${mountScene} | heap ${range(heaps)} MB | ` +
          `select-all ${bulkOf("selectAllMs")} ms | drag-start-1000 ${bulkOf("dragStartMs")} ms | ` +
          `change-all ${bulkOf("changeAllMs")} ms${elementsAtMount}${changeAllSplit}${bulkUploads}`
      );
      if (sweeps.length) {
        const steps = sweeps.flatMap((result) => result.steps);
        const frames = sweeps.flatMap((result) => result.frames);
        const ticks = steps.map((step) => step.tickMs);
        const kb = (bytes) => (bytes / 1024).toFixed(1);
        const breaking = steps.filter((step) => step.relayouts > 0);
        const ratiosOf = (pick) => breaking.filter((s) => pick(s) > 0).map((s) => s.uploadBytes / pick(s));
        const ratios = ratiosOf((step) => step.relayoutBytes);
        const written = ratiosOf((step) => step.writtenBytes ?? 0);
        const drawn = ratiosOf((step) => step.drawnBytes ?? 0);
        const ratioText = (values) =>
          values.length ? `median ${median(values).toFixed(2)} max ${Math.max(...values).toFixed(2)}` : "n/a";
        const shares = breaking.filter((step) => step.blocks > 0).map((step) => step.relayouts / step.blocks);
        const share = (pick) => (100 * (shares.length ? pick(shares) : 0)).toFixed(1);
        const total = (pick) => steps.reduce((sum, step) => sum + pick(step), 0);
        const mean = (pick, digits) => (total(pick) / steps.length).toFixed(digits);
        const uploads = steps.map((s) => s.uploadBytes);
        const uploadMean = kb(total((s) => s.uploadBytes) / steps.length);
        const shareMax = share((values) => Math.max(...values));
        console.log(
          `          sweep ${sweepSpec.from}<->${sweepSpec.to} (${sweeps.length} repeats x ${sweeps[0].steps.length} ` +
            `steps): tick median ${median(ticks).toFixed(2)} p95 ${percentile(ticks, 0.95).toFixed(2)} max ` +
            `${Math.max(...ticks).toFixed(2)} ms | frames median ${median(frames).toFixed(1)} p95 ` +
            `${percentile(frames, 0.95).toFixed(1)} ms | re-laid-out texts per step mean ` +
            `${mean((s) => s.relayouts, 1)} max ${Math.max(...steps.map((s) => s.relayouts))}, ${breaking.length} ` +
            `of ${steps.length} steps (laid out again with the same glyphs, nothing written: mean ` +
            `${mean((s) => s.kept, 1)}); of the blocks in view on those steps median ${share(median)}% max ` +
            `${shareMax}% | uploaded per step mean ${uploadMean} ` +
            `KB median ${kb(median(uploads))} KB max ${kb(Math.max(...uploads))} KB in mean ` +
            `${mean((s) => s.uploadCalls, 1)} calls, ${mean((s) => s.uploadMs, 3)} ms of upload calls (mean) | ` +
            `re-layout ms per step mean ${mean((s) => s.relayoutMs, 3)} p95 ` +
            `${percentile(steps.map((s) => s.relayoutMs), 0.95).toFixed(3)} | on re-layout steps: uploaded / glyph ` +
            `bytes of the re-laid-out texts ${ratioText(ratios)}; / bytes they wrote ${ratioText(written)}; / bytes ` +
            `of the glyphs they draw ${ratioText(drawn)}`
        );
      }
      if (toggles.length) {
        const of = (side, pick) => range(toggles.flatMap((result) => result[side].map(pick)));
        const kb = (bytes) => `${(bytes / 1024).toFixed(1)}`;
        const side = (name) =>
          `${name} ${of(name, (f) => f.ms)} ms (re-layouts ${of(name, (f) => f.relayouts)} in ` +
          `${of(name, (f) => f.relayoutMs)} ms, uploaded ${of(name, (f) => Number(kb(f.uploadBytes)))} KB in ` +
          `${of(name, (f) => f.uploadCalls)} calls, ${of(name, (f) => f.uploadMs)} ms, for ` +
          `${of(name, (f) => Number(kb(f.relayoutBytes)))} KB of glyphs)`;
        console.log(
          `          toggle cameraAwareText at ${toggleScale} (${toggles.length} pages x ${toggles[0].off.length}): ` +
            `${side("off")} | ${side("on")}`
        );
      }
      if (visits.length) {
        const of = (pick) => range(visits.map(pick));
        const ticks = (pick) => visits[0] && pick(visits[0]).map((ms) => ms.toFixed(1)).join("/");
        console.log(
          `          visit ${visitScale} (median (min-max) of ${visits.length}): pan at ${scale} before ` +
            `${of((v) => v.panBefore)} ms, after ${of((v) => v.panAfter)} ms, after - before ` +
            `${of((v) => v.panAfter - v.panBefore)} ms | query at ${scale} before ${of((v) => v.queryBefore.ms)} ms ` +
            `(${visits[0].queryBefore.elements} elements), after ${of((v) => v.queryAfter.ms)} ms ` +
            `(${visits[0].queryAfter.elements} elements; store ${visits[0].elementsBefore} -> ${visits[0].elementsAfter})`
        );
        const zoomScene = visits.some((v) => v.zoomIn.sceneMs === null) ? "" : ` (scene ${of((v) => v.zoomIn.sceneMs)})`;
        console.log(
          `          first zoom-in ${of((v) => v.zoomIn.totalMs)} ms${zoomScene}: action ${of((v) => v.zoomIn.actionMs)} ` +
            `ms + ticks ${ticks((v) => v.zoomIn.ticks)} ms, anchors created ${of((v) => v.zoomIn.anchors)} | ` +
            `second zoom-in ${of((v) => v.zoomInAgain.totalMs)} ms (action ${of((v) => v.zoomInAgain.actionMs)} ms) | ` +
            `pan at ${visitScale}: ${of((v) => v.schematicPan.tickMs)} ms per step, view test ` +
            `${visits.map((v) => v.schematicPan.viewTestMs.toFixed(3)).join("/")} ms per camera change ` +
            `(${visits[0].schematicPan.viewTestRuns} runs, ${of((v) => v.schematicPan.requested)} blocks asked, anchors ` +
            `${of((v) => v.schematicPan.anchors)} after it)`
        );
      }
      if (exports.length) {
        const of = (pick) => range(exports.flatMap((e) => e.runs.map(pick)));
        const first = exports[0];
        console.log(
          `          export ${exportLevel} of the whole scene at ${scale} (${first.width} x ${first.height} px, ` +
            `median (min-max) of ${exports.length} pages x ${first.runs.length} runs): total ${of((r) => r.totalMs)} ms ` +
            `= prepare ${of((r) => r.prepareMs)} + draw ${of((r) => r.drawMs)} + cleanup ${of((r) => r.cleanupMs)} ms; ` +
            `next tick ${of((r) => r.nextTickMs)} ms | first run on each page ` +
            `${range(exports.map((e) => e.runs[0].totalMs))} ms | anchors created ${of((r) => r.anchors)} on ` +
            `${of((r) => r.blocks)} blocks; store ${first.elementsBefore} -> ` +
            `${first.elementsPeak} at the peak -> ${first.elementsAfter} after`
        );
        console.log(
          `          export heap (MB, after a forced GC): before ${range(exports.map((e) => e.heapBeforeMB))} | at the ` +
            `peak ${range(exports.map((e) => e.heapPeakMB))} | after ${range(exports.map((e) => e.heapAfterMB))}`
        );
      }
      if (renderer === "webgl" && webgl) {
        console.log(
          `          webgl: state ${webgl.state} | deviceMs ${webgl.deviceMs.toFixed(1)} | ` +
            `lastReplayMs ${webgl.lastReplayMs.toFixed(1)} | last frame instances ${webgl.instances} ` +
            `drawCalls ${webgl.drawCalls} (translucent ${webgl.translucentDrawCalls}) | ` +
            `translucent levels ${webgl.translucentLevels} (last level update ${webgl.lastLevelsMs.toFixed(2)} ms, ` +
            `last sort ${webgl.lastTranslucentOrderMs.toFixed(2)} ms) | ` +
            `${blockOpacity === undefined ? "" : `blocks at opacity ${blockOpacity} | `}` +
            `uploads ${webgl.uploads} lastUpload ${webgl.lastUploadKind} | ` +
            `SKIPPED (not drawn: no support in the slice) polygons ${webgl.skipped.polygon} icons ${webgl.skipped.icon}`
        );
        console.log(
          "          webgl note: the tick is CPU only (layer render + backend.draw submission); GPU execution is " +
            "not in it, so compare frames p50/p95 with the other columns"
        );
      }
      if (timing && renderer === "cached") {
        console.log("          query timing cached: connections are not in the store; they live in the ScenePathBatch");
      }
      if (timing) {
        const ms = (value) => `${value.toFixed(3)} ms`;
        console.log(
          `          query timing ${name} (median of ${queryRounds}, ${timing.elements} elements): ` +
            `index query ${ms(timing.indexQuery)} | sort ${ms(timing.sort)} | store.query ${ms(timing.storeQuery)} | ` +
            `drawScene ${ms(timing.drawScene)}`
        );
      }
    }
    for (const { name } of columns) {
      if (name === "walk" || !shots.walk || !shots[name]) continue;
      const { different, delta, severe, box } = await countDifferentPixels(
        browser,
        shots.walk,
        shots[name],
        SEVERE_DELTA
      );
      console.log(
        `          pixels ${name} vs walk: ${different} px differ by up to ${delta} | ` +
          `severe (>${SEVERE_DELTA}): ${severe}` +
          (box ? ` in box x ${box[0]}..${box[2]} y ${box[1]}..${box[3]}` : "")
      );
    }
  }
}
await browser.close();
