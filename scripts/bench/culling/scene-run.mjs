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
  if (!["walk", "interpreter", "cached"].includes(renderer)) {
    console.error(`scene-run: --renderers: "${renderer}" is not one of walk, interpreter, cached`);
    process.exit(1);
  }
}
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
    alias: { GRAPH: path.join(source, "index.ts"), GRAPH_SRC: source },
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
  `repeats=${repeats} steps=${steps} view=${VIEW.width}x${VIEW.height} columns=${columns.map((c) => c.name).join(",")}`
);
console.log(`chromium ${browser.version()} gpu=${gpu} renderer: ${await rendererName()}`);
for (const scene of scenes) {
  for (const scale of scales) {
    const shots = {};
    for (const { renderer, maxRun, name } of columns) {
      const results = Object.fromEntries(
        modes.map((mode) => [mode, { samples: [], frames: [], ticks: [], timeouts: 0, actionMs: [] }])
      );
      let first = [];
      let sizes;
      let counts;
      let timing;
      for (let repeat = 0; repeat < repeats; repeat++) {
        const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
        const page = await context.newPage();
        await page.goto(`file://${pagePath}`);
        sizes = await page.evaluate((options) => window.bench.setup(options), {
          scene,
          renderer,
          width: VIEW.width,
          height: VIEW.height,
          scale,
          maxRun,
        });
        first.push(...sizes.first);
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
        }
        if (repeat === 0) {
          counts = await page.evaluate((options) => window.bench.visible(options), { scale });
          await page.evaluate((options) => window.bench.settle(options), { scale });
          shots[name] = await page.screenshot();
          if (shotsDir) {
            fs.mkdirSync(shotsDir, { recursive: true });
            fs.writeFileSync(path.join(shotsDir, `${scene}-${scale}-${name}.png`), shots[name]);
          }
          // After the screenshot: drawScene() below draws over the picture.
          if (queryRounds) {
            timing = await page.evaluate((options) => window.bench.queryTiming(options), {
              scale,
              rounds: queryRounds,
            });
          }
        }
        await context.close();
      }
      const parts = modes.map((mode) => {
        const r = results[mode];
        const timeouts = r.timeouts ? ` timeouts ${r.timeouts}` : "";
        const frames = `${median(r.frames).toFixed(1)}/${percentile(r.frames, 0.95).toFixed(1)}`;
        const ticks = mean(r.ticks).toFixed(1);
        const action = ` action ${mean(r.actionMs).toFixed(2)} ms`;
        return `${mode} ${mean(r.samples).toFixed(2)} ms (${ticks} ticks) frames ${frames}${timeouts}${action}`;
      });
      console.log(
        `${scene.padEnd(9)} scale=${String(scale).padEnd(5)} ${name.padEnd(18)} ` +
          `[${sizes.blocks} blocks ${sizes.connections} connections ${sizes.groups} groups] ` +
          `first two frames ${Math.round(first.reduce((sum, value) => sum + value, 0) / repeats)} ms | ` +
          `${parts.join(" | ")} | visible blocks ${counts.blocks} anchors ${counts.anchors} ` +
          `elements ${counts.elements}` +
          (counts.batched === undefined ? "" : ` batched ${counts.batched} chunks ${counts.chunks}`)
      );
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
