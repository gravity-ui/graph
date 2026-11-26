// node scripts/bench/pointer-hover.mjs <e2e graph.bundle.js> <results.json> [rounds] [native|half]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";

import { chromium } from "@playwright/test";
import { build } from "esbuild";

const [bundle, output, roundsArg = "3", frameMode = "native"] = process.argv.slice(2);
const rounds = Number(roundsArg);
assert(
  bundle && output && Number.isInteger(rounds) && rounds > 0,
  "Pass a bundle, results file and optional round count"
);
assert(["native", "half"].includes(frameMode), "Expected native or half frame rate");
const source = await readFile(bundle, "utf8");
const viewport = { width: 1200, height: 800 };
const etl = await build({
  entryPoints: ["apps/storybook/src/stories/canvas/sceneEffects/etlAtScale.ts"],
  bundle: true,
  format: "iife",
  globalName: "Etl",
  write: false,
  external: ["@gravity-ui/graph"],
  banner: {
    js: 'var require = id => { if (id === "@gravity-ui/graph") return GraphModule; throw new Error(id); };',
  },
});

// On the 120 Hz test host this delivers graph frames at 60 Hz. Pointer timers and the elapsed clock stay native.
function halveAnimationFrameRate() {
  const nativeFrame = window.requestAnimationFrame.bind(window);
  const pending = new Map();
  let scheduled = false;
  let id = 0;
  window.cancelAnimationFrame = (handle) => pending.delete(handle);
  window.requestAnimationFrame = (callback) => {
    pending.set(++id, callback);
    if (!scheduled) {
      scheduled = true;
      nativeFrame(() =>
        nativeFrame((time) => {
          scheduled = false;
          for (const handle of [...pending.keys()]) {
            const cb = pending.get(handle);
            pending.delete(handle);
            cb?.(time);
          }
        })
      );
    }
    return id;
  };
}

function mount(scale) {
  const { Graph, CanvasBlock } = window.GraphModule;
  const graph = new Graph({ settings: { renderer: "canvas", useBlocksAnchors: true } }, document.querySelector("main"));
  const { blocks, connections } = window.Etl.createEtlAtScale(10000, 10000, graph.graphConstants);
  for (const block of blocks) block.is = CanvasBlock.IS;
  graph.setEntities({ blocks, connections });
  graph.start();
  graph.cameraService.set({ x: 80, y: 80, scale });
  window.benchGraph = graph;
}

async function replay({ hz, path }) {
  const graph = window.benchGraph;
  const root = graph.layers.$root;
  const camera = graph.cameraService.getCameraState();
  const bounds = graph.getGraphCanvas().getBoundingClientRect();
  const start = graph.blocks.getBlockState("p01/orders");
  const end = graph.blocks.getBlockState("p01/extract");
  const toX = (b) => bounds.left + camera.x + (b.x + b.$state.peek().width / 2) * camera.scale;
  const x1 = toX(start);
  const x2 = toX(end);
  const y = bounds.top + camera.y + (end.y + 30) * camera.scale;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const move = (x) =>
    root.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
  const hovered = () => graph.input.$hoveredComponent.peek();
  root.dispatchEvent(new PointerEvent("pointerleave", { pointerId: 1, pointerType: "mouse" }));
  move(x1);
  await wait(180);
  if (hovered() !== start.getViewComponent()) throw new Error("Trace must start on Orders DB");

  const queries = [];
  let graphFrame = 0;
  const offFrame = graph.scene.onFrameEnd(() => graphFrame++);
  let events = 0;
  const tags = graph.scene.tags.$of("block", end.id);
  const tagTimes = [];
  const offTag = tags.subscribe((value) => {
    if (value.has(window.GraphModule.hoveredTag)) tagTimes.push(performance.now());
  });
  const frames = [];
  let frameId;
  function frame(time) {
    frames.push(time);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  const testPoint = graph.hitTest.testPoint;
  graph.hitTest.testPoint = function (...args) {
    const time = performance.now();
    const result = testPoint.apply(this, args);
    queries.push({ time, graphFrame, ms: performance.now() - time });
    return result;
  };
  const off = ["pointerleave", "pointerout", "pointerenter", "pointerover"].map((type) =>
    graph.on(type, () => events++)
  );

  const due = performance.now();
  const samples = path === "slow" ? hz : hz / 2 + 1;
  const moves = [];
  for (let i = 1; i <= samples; i++) {
    await wait(Math.max(0, due + (i * 1000) / hz - performance.now()));
    moves.push(performance.now());
    move(path === "slow" ? x1 + ((x2 - x1) * i) / samples : i % 2 ? x2 : x1);
  }
  const movingQueries = queries.length;
  const movingEvents = events;
  const stop = moves.at(-1);
  const finalOnStop = tags.peek().has(window.GraphModule.hoveredTag);
  await wait(180);
  const settleQueries = queries.length - movingQueries;
  const settleEvents = events - movingEvents;
  if (hovered() !== end.getViewComponent() || !tags.peek().has(window.GraphModule.hoveredTag))
    throw new Error("Trace must end with Extract orders highlighted without another move");
  await wait(120);
  const idleQueries = queries.length - movingQueries - settleQueries;
  const idleEvents = events - movingEvents - settleEvents;
  cancelAnimationFrame(frameId);
  offFrame();
  offTag();
  for (const unsubscribe of off) unsubscribe();
  graph.hitTest.testPoint = testPoint;
  const tagged = tagTimes.find((time) => time >= stop);
  if (tagged === undefined && !finalOnStop) throw new Error("Missing publication of the final hover");
  return {
    hz,
    path,
    level: graph.scene.$level.peek(),
    scale: camera.scale,
    x1,
    x2,
    y,
    blocks: graph.rootStore.blocksList.$blocks.peek().length,
    connections: graph.rootStore.connectionsList.$connections.peek().length,
    movingQueries,
    settleQueries,
    idleQueries,
    movingEvents,
    settleEvents,
    idleEvents,
    latencyMs: Math.max(0, (tagged ?? stop) - stop),
    moves,
    frames,
    queries,
  };
}

function summarize(rows) {
  const p95 = (values) => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  const range = (values) =>
    Math.min(...values) === Math.max(...values)
      ? String(values[0])
      : [Math.min(...values), Math.max(...values)].join("–");
  return [...new Set(rows.map((r) => [r.level, r.hz, r.path].join("/")))].map((scenario) => {
    const cases = rows.filter((r) => [r.level, r.hz, r.path].join("/") === scenario);
    const inFrame = cases.flatMap((r) => {
      const counts = new Map();
      for (const { graphFrame } of r.queries) counts.set(graphFrame, (counts.get(graphFrame) ?? 0) + 1);
      return [...counts.values()];
    });
    return {
      scenario,
      moveQueries: range(cases.map((r) => r.movingQueries)),
      settleQueries: range(cases.map((r) => r.settleQueries)),
      moveEvents: range(cases.map((r) => r.movingEvents)),
      settleEvents: range(cases.map((r) => r.settleEvents)),
      maxQueriesPerFrame: Math.max(...inFrame),
      queryCount: cases.reduce((n, r) => n + r.queries.length, 0),
      queryP95Ms: +p95(cases.flatMap((r) => r.queries.map((q) => q.ms))).toFixed(3),
      settleLatencyMs: range(cases.map((r) => +r.latencyMs.toFixed(2))),
    };
  });
}

const browser = await chromium.launch();
const results = [];
try {
  for (const [scale, level] of [
    [0.15, "minimalistic"],
    [1, "detailed"],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    // An isolated local document enables Chromium's fine-grained performance clock.
    await page.route("http://localhost/bench", (route) =>
      route.fulfill({
        headers: {
          "Content-Type": "text/html",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        },
        body: "<style>*{margin:0}main{width:100vw;height:100vh}</style><main></main>",
      })
    );
    await page.goto("http://localhost/bench");
    assert(await page.evaluate(() => crossOriginIsolated));
    if (frameMode === "half") await page.evaluate(halveAnimationFrameRate);
    await page.addScriptTag({ content: source });
    await page.addScriptTag({ content: etl.outputFiles[0].text });
    await page.evaluate(mount, scale);
    await page.waitForFunction(
      () => window.benchGraph.scene.state === "ready" && !window.benchGraph.hitTest.hasPendingUpdates()
    );
    for (let round = 0; round < rounds; round++) {
      for (const hz of [60, 120]) {
        for (const path of ["slow", "reversals"]) {
          const row = await page.evaluate(replay, { hz, path });
          assert.equal(row.level, level);
          assert.equal(row.blocks, 10000);
          assert.equal(row.connections, 10000);
          assert.equal(row.idleQueries, 0);
          assert.equal(row.idleEvents, 0);
          assert(row.x1 >= 0 && row.x2 < viewport.width && row.y >= 0 && row.y < viewport.height);
          assert(
            Math.abs(row.moves.at(-1) - row.moves[0] - ((row.moves.length - 1) * 1000) / hz) < 100,
            "Input pacing drifted"
          );
          results.push({ round, ...row });
          console.log(
            level,
            hz,
            path,
            row.movingQueries,
            row.settleQueries,
            row.movingEvents,
            row.settleEvents,
            row.latencyMs.toFixed(2)
          );
        }
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  const bundleHash = createHash("sha256").update(source).digest("hex");
  const summary = summarize(results);
  console.table(summary);
  await writeFile(
    output,
    JSON.stringify({
      bundleHash,
      frameMode,
      summary,
      chromium: browser.version(),
      node: process.version,
      os: os.version(),
      cpu: os.cpus()[0].model,
      viewport,
      results,
    })
  );
} finally {
  await browser.close();
}
