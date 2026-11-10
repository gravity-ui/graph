#!/usr/bin/env node
// scripts/bench/culling/scene-slice.mjs
// WebGL scene vertical slice: checks C1-C12 and measurements M2-M4 (scene/slice.ts) in Chromium with the real GPU.
// Prints "<id> PASS|FAIL <details>" per check; exit code 1 when a check fails.
import { chromium } from "@playwright/test";
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const VIEW = { width: 800, height: 600 };
const work = fs.mkdtempSync(path.join(os.tmpdir(), "graph-scene-slice-"));

async function build() {
  const source = path.join(repo, "packages/graph/src");
  await esbuild.build({
    entryPoints: [path.join(here, "scene/slice.ts")],
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

const pagePath = await build();
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "darwin" ? ["--use-angle=metal", "--use-gl=angle"] : [],
  channel: "chromium",
  ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
});
let failed = 0;
try {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (message) => logs.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
  await page.exposeFunction("sliceScreenshot", async () =>
    (await page.screenshot({ clip: { x: 0, y: 0, ...VIEW } })).toString("base64")
  );
  await page.goto(`file://${pagePath}`);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : "no webgl2";
  });
  console.log(`chromium ${browser.version()} view=${VIEW.width}x${VIEW.height} dpr=2 renderer: ${renderer}`);
  let results;
  try {
    results = await page.evaluate(() => window.slice.run({ screenshot: () => window.sliceScreenshot() }));
  } catch (error) {
    console.log(`HARNESS ERROR ${String(error)}`);
    results = [];
    failed++;
  }
  for (const { id, pass, details } of results) {
    const label = pass === "info" ? "INFO" : pass ? "PASS" : "FAIL";
    if (pass === false) failed++;
    console.log(`${id} ${label} ${details}`);
  }
  for (const line of logs) console.log(`console: ${line}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
