// Run against an already running Storybook, from the worktree root:
// node scripts/bench/etl-block-highlight.mjs /tmp/etl-outline.json [repetitions]
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "@playwright/test";

const [output, repeatCount = "3"] = process.argv.slice(2);
if (!output) throw new Error("Pass an output JSON path");
const rounds = Number(repeatCount);
assert(Number.isInteger(rounds) && rounds > 0);
const modes = ["off", "base", "outline", "outline-and-halo"];
const sceneURL = "http://localhost:6017/iframe.html?id=canvas-sceneeffects--etl-at-scale&viewMode=story";
const scenario = {
  sceneURL,
  viewport: { width: 1600, height: 1000 },
  dpr: 2,
  blocks: 10000,
  connections: 10000,
  pipeline: "p01",
  view: "pipeline",
  live: false,
  minimap: false,
  html: false,
  selectionActions: 30,
  pointerHz: 60,
  pointerDurationMs: 1000,
  pointerDeltaCSS: [136, 68],
  platform: process.platform,
  architecture: process.arch,
  interval: "Successive requestAnimationFrame timestamps in ms, rounded to one microsecond; >16.7 ms is late.",
  elapsed: "Successive actual rAF callback entry times in ms.",
  scene: "Synchronous time spent in graph.scene.update during the interval, in ms.",
  inputs: "Window capture to bubble duration for delivered pressed mousemove events, in ms.",
  select: "The frame receiving select(REPLACE); the following frame is reported separately as selectionPresent.",
};

// Register the sampler before the graph schedules its first rAF. The next rAF timestamp closes
// the interval for an action; the scheduler and the renderer run naturally between the two callbacks.
function installSampler() {
  let previous = 0;
  let previousEntry = 0;
  let previousMoves = 0;
  window.benchInputs = [];
  window.addEventListener(
    "mousemove",
    () => {
      window.benchEventStart = performance.now();
    },
    true
  );
  window.addEventListener("mousemove", (event) => {
    if (event.buttons === 1 && window.benchRecording)
      window.benchInputs.push(performance.now() - window.benchEventStart);
  });
  let next;
  window.benchIntervals = [];
  const backendTimes = { scene: 0 };
  window.benchTimer = backendTimes;
  function frame(timestamp) {
    const entry = performance.now();
    if (next) {
      window.benchIntervals.push({
        phase: next,
        moved: window.benchMoves > previousMoves,
        timestamp,
        entry,
        interval: +(timestamp - previous).toFixed(3),
        elapsed: +(entry - previousEntry).toFixed(3),
        scene: +backendTimes.scene.toFixed(3),
      });
    }
    previous = timestamp;
    previousEntry = entry;
    previousMoves = window.benchMoves ?? 0;
    backendTimes.scene = 0;
    next = window.benchStep?.();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function findGraph(renderer) {
  for (const node of document.querySelectorAll(".graph-canvas")) {
    // The development Storybook renders GraphCanvas with the graph prop.
    for (
      let fiber = node[Object.keys(node).find((key) => key.startsWith("__reactFiber"))];
      fiber;
      fiber = fiber.return
    ) {
      const g = fiber.memoizedProps?.graph;
      if (
        g?.scene?.$renderer.peek() === renderer &&
        g.rootStore.blocksList.$blocks.peek().length === 10000 &&
        g.rootStore.connectionsList.$connections.peek().length === 10000 &&
        g.scene.$level.peek() === "schematic"
      ) {
        window.benchGraph = g;
        return true;
      }
    }
  }
  return false;
}

function setup() {
  const graph = window.benchGraph;
  const blocks = graph.rootStore.blocksList.$blocks.peek();
  const members = blocks.filter((b) => b.$state.peek().group === "p01");
  const initial = blocks.map((b) => [b.x, b.y]);
  const camera = graph.cameraService.getCameraState();
  const canvas = graph.getGraphCanvas().getBoundingClientRect();
  const ids = members.map((b) => b.id);
  const idSet = new Set(ids);
  const screenCenter = (block) => {
    const b = block.$state.peek();
    return {
      x: canvas.left + camera.x + (b.x + b.width / 2) * camera.scale,
      y: canvas.top + camera.y + (b.y + b.height / 2) * camera.scale,
    };
  };
  const inside = members.every((b) => {
    const p = screenCenter(b);
    return p.x >= canvas.left && p.x < canvas.right && p.y >= canvas.top && p.y < canvas.bottom;
  });
  const handle = members[Math.floor(members.length / 2)];
  const sceneUpdate = graph.scene.update;
  graph.scene.update = function (...args) {
    const t = performance.now();
    try {
      return sceneUpdate.apply(this, args);
    } finally {
      window.benchTimer.scene += performance.now() - t;
    }
  };
  window.benchSelect = (enabled) => graph.selectionService.select("block", enabled ? ids : [], "replace");
  window.benchHandle = () => screenCenter(handle);
  window.benchVerify = (expectMoved) => {
    const dx = handle.x - initial[blocks.indexOf(handle)][0];
    const dy = handle.y - initial[blocks.indexOf(handle)][1];
    const wrong = blocks.filter((b, i) => {
      const member = idSet.has(b.id);
      return (
        Math.abs(b.x - initial[i][0] - (member ? dx : 0)) > 0.001 ||
        Math.abs(b.y - initial[i][1] - (member ? dy : 0)) > 0.001
      );
    });
    if (wrong.length || (expectMoved && Math.hypot(dx, dy) < 2) || !members.every((b) => b.$selected.peek())) {
      throw new Error("Incorrect group drag: " + JSON.stringify({ dx, dy, wrong: wrong.map((b) => b.id).slice(0, 5) }));
    }
    return [dx, dy];
  };
  document.addEventListener(
    "mousemove",
    (e) => {
      if (e.isTrusted && e.buttons & 1) window.benchMoves++;
    },
    true
  );
  window.benchMoves = 0;
  return {
    ids,
    inside,
    camera,
    layers: graph.layers.getLayers().map((l) => l.constructor.name),
    handle: screenCenter(handle),
    gpu: (() => {
      const gl = graph.scene.layer.getBackend()?.gl;
      const e = gl?.getExtension("WEBGL_debug_renderer_info");
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null;
    })(),
    level: graph.scene.$level.peek(),
    dpr: devicePixelRatio,
  };
}

function selectFrames(n) {
  let tick = 0;
  return new Promise((resolve) => {
    window.benchStep = () => {
      if (tick === n * 4) {
        window.benchStep = undefined;
        resolve();
        return;
      }
      const phase = tick++ % 4;
      if (phase === 0) {
        window.benchSelect(true);
        return "select";
      }
      if (phase === 1) return "selectionPresent";
      if (phase === 2) window.benchSelect(false);
    };
  });
}

async function drag(page, dx, dy) {
  const start = await page.evaluate(() => window.benchHandle());
  const client = await page.context().newCDPSession(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Cross the native drag threshold identically before measuring the continuous, fixed-rate input.
  await page.mouse.move(start.x + 8, start.y + 4);
  await page.mouse.move(start.x + 16, start.y + 8);
  await page.waitForFunction(() => window.benchGraph.dragService.$state.peek().isDragging);
  await page.evaluate(() => {
    window.benchMoves = 0;
    window.benchRecording = true;
    window.benchStep = () =>
      window.benchMoves && window.benchGraph.dragService.$state.peek().isDragging ? "drag" : undefined;
  });
  const steps = (scenario.pointerHz * scenario.pointerDurationMs) / 1000;
  const pending = [];
  const started = performance.now();
  for (let i = 1; i <= steps; i++) {
    const delay = started + (i * scenario.pointerDurationMs) / steps - performance.now();
    if (delay > 0) await wait(delay);
    // Chromium may coalesce moves when the application misses a frame. Never pace the next input on its acknowledgement.
    pending.push(
      client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: start.x + 16 + (dx * i) / steps,
        y: start.y + 8 + (dy * i) / steps,
        buttons: 1,
      })
    );
  }
  await Promise.all(pending);
  const sourceMs = performance.now() - started;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    x: start.x + 16 + dx,
    y: start.y + 8 + dy,
    clickCount: 1,
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const delta = await page.evaluate(() => {
    window.benchStep = undefined;
    return window.benchVerify(true);
  });
  return { delta, sourceMs, steps };
}

function summary(samples) {
  const sorted = samples.map((row) => row.interval).sort((a, b) => a - b);
  const entry = samples.map((row) => row.elapsed).sort((a, b) => a - b);
  const scene = samples.map((row) => row.scene).sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return {
    n: sorted.length,
    p95: sorted[index],
    over: sorted.filter((v) => v > 16.7).length,
    entry95: entry[index],
    entryOver: entry.filter((v) => v > 16.7).length,
    scene95: scene[index],
  };
}

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--use-gl=angle"],
  ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
});
const results = [];
try {
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[(i + round) % modes.length];
      for (const renderer of i % 2 ? ["webgl", "canvas"] : ["canvas", "webgl"]) {
        const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: scenario.dpr });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript(installSampler);
        const args = {
          blockCount: 10000,
          connectionCount: 10000,
          renderer,
          view: "pipeline",
          html: "!false",
          minimap: "!false",
          live: "!false",
          blockHighlight: mode,
        };
        await page.goto(
          sceneURL +
            "&args=" +
            Object.entries(args)
              .map(([k, v]) => k + ":" + v)
              .join(";")
        );
        await page.waitForFunction(findGraph, renderer, { timeout: 120000 });
        await page.waitForTimeout(1200);
        const config = await page.evaluate(setup);
        assert.equal(await page.locator("[data-block-highlight]").getAttribute("data-block-highlight"), mode);
        assert.equal(config.ids.length, 19);
        assert(config.inside && !config.layers.some((id) => id.includes("MiniMap")));
        await page.evaluate(selectFrames, 3);
        await page.evaluate(() => {
          window.benchIntervals.length = 0;
        });
        await page.evaluate(selectFrames, scenario.selectionActions);
        await page.evaluate(() => window.benchSelect(true));
        await page.waitForTimeout(180);
        const paints = await page.evaluate(() => {
          const g = window.benchGraph;
          const entries = [];
          g.scene.store.forEach((el) => {
            if (el.entityType === "block-outline") entries.push(el.primitives.length);
          });
          const member = g.rootStore.blocksList.$blocks.peek().find((b) => b.$selected.peek());
          const owner = g.scene.store.get(member.getViewComponent().getSceneElementId());
          return {
            entries,
            outline: g.scene.store.getStyles()[owner.styleId].outline ?? null,
            selected: g.selectionService.$selectedComponents.peek().length,
          };
        });
        assert.equal(paints.selected, 19);
        assert.equal(Boolean(paints.outline?.halo), mode === "outline-and-halo");
        if (mode === "off" || mode === "base") assert.equal(paints.entries.length, 0);
        else assert.equal(paints.entries.length, 19);
        const { delta, sourceMs, steps } = await drag(page, ...scenario.pointerDeltaCSS);
        const result = await page.evaluate(() => ({
          samples: window.benchIntervals,
          moves: window.benchMoves,
          inputs: window.benchInputs,
        }));
        assert.equal(result.samples.filter((r) => r.phase === "select").length, 30);
        const dragSamples = result.samples.filter((r) => r.phase === "drag");
        const totalTime = (key) => dragSamples.reduce((sum, r) => sum + r[key], 0);
        assert(dragSamples.length >= 2 && result.moves >= 2 && result.moves <= steps);
        assert(Math.abs(totalTime("interval") - totalTime("elapsed")) < 40, "rAF clocks disagree over the drag");
        assert(totalTime("elapsed") > 850 && totalTime("elapsed") < 1600 && sourceMs < 1600, "input timing drift");
        assert.deepEqual(errors, []);
        if (results.length) {
          assert.deepEqual(config.ids, results[0].config.ids);
          assert.deepEqual(config.handle, results[0].config.handle);
          assert.deepEqual(config.camera, results[0].config.camera);
          assert.deepEqual(delta, results[0].delta);
        }
        results.push({ round, renderer, mode, config, delta, sourceMs, steps, paints, ...result });
        const metrics = Object.fromEntries(
          ["select", "selectionPresent", "drag"].map((phase) => [
            phase,
            summary(result.samples.filter((r) => r.phase === phase)),
          ])
        );
        writeFileSync(output, JSON.stringify({ browser: browser.version(), scenario, results }));
        console.log(JSON.stringify({ round, renderer, mode, delta, moves: result.moves, ...metrics }));
        await page.close();
      }
    }
  }
  const pooled = [];
  for (const renderer of ["canvas", "webgl"]) {
    for (const mode of modes) {
      const cases = results.filter((r) => r.mode === mode && r.renderer === renderer);
      const samples = cases.flatMap((r) => r.samples);
      const inputs = cases.flatMap((r) => r.inputs).sort((a, b) => a - b);
      const input95 = +inputs[Math.ceil(inputs.length * 0.95) - 1].toFixed(3);
      for (const phase of ["select", "selectionPresent", "drag"]) {
        pooled.push({
          renderer,
          mode,
          phase,
          ...summary(samples.filter((r) => r.phase === phase)),
          ...(phase === "drag" ? { input95 } : {}),
        });
      }
    }
  }
  writeFileSync(output, JSON.stringify({ browser: browser.version(), scenario, pooled, results }));
  console.table(pooled);
} finally {
  await browser.close();
}
