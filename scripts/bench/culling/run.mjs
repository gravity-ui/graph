#!/usr/bin/env node
/**
 * Culling benchmark: main-thread duration of one GraphLayer update while panning or zooming large
 * scenes, for several versions of packages/graph side by side. See README.md.
 *
 *   node scripts/bench/culling/run.mjs --variants base=origin/v2,current=. --scales 0.01,0.02,0.05
 */
import { chromium } from "@playwright/test";
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
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

const variants = list(option("variants", "base=origin/v2,current=.")).map((entry) => {
  const [name, ref = name] = entry.split("=");
  return { name, ref };
});
const scenes = list(option("scenes", "nirvana,playground"));
const scales = list(option("scales", "0.01,0.02,0.05,0.1")).map(Number);
const views = list(option("views", "near"));
const modes = list(option("modes", "pan,zoom"));
const repeats = Number(option("repeats", 3));
const steps = Number(option("steps", 40));
const noopCanvas = Boolean(option("noop", false));
const firstOnly = Boolean(option("first", false));
const headed = Boolean(option("headed", false));
const shotsDir = option("shots", undefined);

const VIEWS = { full: { width: 1600, height: 1600 }, near: { width: 1600, height: 1000 } };

const work = fs.mkdtempSync(path.join(os.tmpdir(), "graph-culling-bench-"));

/** Builds one variant's bundle and page; `.` is the working tree, anything else a git ref. */
async function build({ name, ref }) {
  let source = path.join(repo, "packages/graph/src");
  if (fs.existsSync(ref) && fs.statSync(ref).isDirectory() && ref !== ".") {
    // A copy of packages/graph/src, for example with one change reverted.
    source = path.resolve(ref);
  } else if (ref !== ".") {
    const target = path.join(work, `src-${name}`);
    fs.mkdirSync(target, { recursive: true });
    const archive = execFileSync("git", ["archive", ref, "packages/graph/src"], { cwd: repo, maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-C", target], { input: archive });
    source = path.join(target, "packages/graph/src");
  }
  await esbuild.build({
    entryPoints: [path.join(here, "entry.ts")],
    bundle: true,
    outfile: path.join(work, `${name}.js`),
    format: "iife",
    platform: "browser",
    // Compile every variant like the published package. Otherwise esbuild picks up whatever tsconfig it
    // finds above each source copy, and class field semantics differ between variants.
    target: ["es2020"],
    tsconfig: path.join(repo, "packages/graph/tsconfig.json"),
    alias: { GRAPH: path.join(source, "index.ts") },
    nodePaths: [path.join(repo, "node_modules")],
    plugins: [
      {
        // Layer styles position the canvases; inject them like the library's consumers do.
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
  const page = path.join(work, `${name}.html`);
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><style>html,body{margin:0}#root{position:relative}</style></head>` +
      `<body><div id="root"></div><script src="./${name}.js"></script></body></html>`
  );
  return page;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function countDifferentPixels(browser, a, b) {
  const page = await browser.newPage();
  const url = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
  const count = await page.evaluate(
    async ([first, second]) => {
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
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < left.length; i += 4) {
        const d = Math.max(
          Math.abs(left[i] - right[i]),
          Math.abs(left[i + 1] - right[i + 1]),
          Math.abs(left[i + 2] - right[i + 2])
        );
        if (d) {
          different++;
          delta = Math.max(delta, d);
          const x = (i / 4) % width;
          const y = Math.floor(i / 4 / width);
          box[0] = Math.min(box[0], x);
          box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x);
          box[3] = Math.max(box[3], y);
        }
      }
      return `${different} px differ by up to ${delta} in [${box.join(", ")}]`;
    },
    [url(a), url(b)]
  );
  await page.close();
  return count;
}

const pages = {};
for (const variant of variants) pages[variant.name] = await build(variant);

const browser = await chromium.launch({
  headless: !headed,
  channel: "chromium",
  // Hardware canvas on macOS; elsewhere Chromium picks its default backend.
  args: process.platform === "darwin" ? ["--use-angle=metal", "--use-gl=angle"] : [],
  ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
});

console.log(`repeats=${repeats} steps=${steps}${noopCanvas ? " noop-canvas" : ""}`);
for (const scene of scenes) {
  for (const scale of firstOnly ? [0.01] : scales) {
    for (const view of views) {
      const results = Object.fromEntries(variants.map(({ name }) => [name, { first: [], pan: [], zoom: [] }]));
      const shots = {};
      for (let repeat = 0; repeat < repeats; repeat++) {
        // Rotate the order so no variant always runs first.
        const order = variants.map((_, i) => variants[(i + repeat) % variants.length]);
        for (const { name } of order) {
          const context = await browser.newContext({ viewport: { width: 1700, height: 1700 }, deviceScaleFactor: 2 });
          const page = await context.newPage();
          page.on("pageerror", (error) => console.error(name, error.message));
          await page.goto(`file://${pages[name]}`);
          const info = await page.evaluate((o) => window.bench.setup(o), {
            ...VIEWS[view],
            scene,
            scale,
            noopCanvas,
          });
          results[name].info = info;
          results[name].first.push(info.first[0] + (info.first[1] ?? 0));
          if (!firstOnly) {
            for (const mode of modes) {
              const samples = await page.evaluate((o) => window.bench.run(o), {
                mode,
                warmup: Math.floor(steps / 2),
                steps,
                scale,
              });
              results[name][mode].push(mean(samples));
            }
            if (repeat === 0) {
              await page.evaluate((o) => window.bench.settle(o), { scale });
              shots[name] = await page.screenshot();
              if (shotsDir) {
                fs.mkdirSync(shotsDir, { recursive: true });
                fs.writeFileSync(path.join(shotsDir, `${scene}-${scale}-${view}-${name}.png`), shots[name]);
              }
            }
          }
          await context.close();
        }
      }
      for (const { name } of variants) {
        const result = results[name];
        const columns = [`first two frames ${median(result.first).toFixed(0)} ms`];
        if (!firstOnly) for (const mode of modes) columns.push(`${mode} ${median(result[mode]).toFixed(2)} ms`);
        console.log(
          `${scene.padEnd(10)} scale=${String(scale).padEnd(5)} ${view.padEnd(4)} ${name.padEnd(10)}`,
          columns.join(" | ")
        );
      }
      if (!firstOnly) {
        const reference = variants[0].name;
        for (const { name } of variants.slice(1)) {
          const same = Buffer.compare(shots[reference], shots[name]) === 0;
          const detail = same ? "identical" : await countDifferentPixels(browser, shots[reference], shots[name]);
          console.log(`${" ".repeat(10)} pixels ${name} vs ${reference}: ${detail}`);
        }
      }
    }
  }
}
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
