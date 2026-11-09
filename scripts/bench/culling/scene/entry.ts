// scripts/bench/culling/scene/entry.ts
// Browser side of the scene bench (E1, E2): one frame = one tick of the global scheduler, every layer included.
import { Anchor } from "GRAPH";
import type { Graph } from "GRAPH";

import { buildScene } from "./scenes";
import type { TBenchScene, TSceneKind } from "./scenes";
import { setupInterpreter } from "./interpreter";
import { resetWalkCounters, setupWalk } from "./walk";
import type { TColumn, TQueryTiming } from "./walk";

const raf = (): Promise<number> => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const state: {
  column?: TColumn;
  scene?: TBenchScene;
  samples: number[];
  center: { x: number; y: number };
  anchors: number;
} = {
  samples: [],
  center: { x: 0, y: 0 },
  anchors: 0,
};

function graph(): Graph {
  if (!state.column) throw new Error("setup() first");
  return state.column.graph;
}

function centerAt(scale: number): void {
  const camera = graph().cameraService;
  const { width, height } = camera.getCameraState();
  camera.set({ scale, x: width / 2 - state.center.x * scale, y: height / 2 - state.center.y * scale });
}

/** A scheduler tick shorter than this did no work: nothing was scheduled by the action any more. */
const IDLE_TICK_MS = 0.05;
/** An action's work is summed over at most this many consecutive ticks. */
const MAX_ACTION_TICKS = 5;

/** Waits up to 20 frames for a scheduler tick after `previous` samples; false when none arrived. */
async function waitForTick(previous: number): Promise<boolean> {
  for (let i = 0; i < 20 && state.samples.length === previous; i++) await raf();
  return state.samples.length !== previous;
}

function instrument(target: Graph): void {
  const scheduler = target.scheduler as unknown as { performUpdate(): void };
  const original = scheduler.performUpdate.bind(scheduler);
  scheduler.performUpdate = (): void => {
    const start = performance.now();
    original();
    state.samples.push(performance.now() - start);
  };
  const anchorProto = Anchor.prototype as unknown as { render(): void };
  const render = anchorProto.render;
  anchorProto.render = function (this: unknown): void {
    state.anchors++;
    render.call(this);
  };
}

async function setup(options: {
  scene: TSceneKind;
  renderer: "walk" | "interpreter" | "cached";
  width: number;
  height: number;
  scale: number;
  /** Interpreter only: ends a path run after this many paths and polygons (drawElements' maxRun). */
  maxRun?: number;
}): Promise<{ blocks: number; connections: number; groups: number; first: number[] }> {
  const root = document.getElementById("root") as HTMLDivElement;
  root.style.width = `${options.width}px`;
  root.style.height = `${options.height}px`;
  const scene = buildScene(options.scene);
  state.scene = scene;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of scene.blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + block.width);
    maxY = Math.max(maxY, block.y + block.height);
  }
  state.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  if (options.renderer === "walk") state.column = setupWalk(root, scene);
  else if (options.renderer === "cached") state.column = setupInterpreter(root, scene, { batchConnections: true });
  else state.column = setupInterpreter(root, scene, { maxRun: options.maxRun });
  instrument(state.column.graph);
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  const first = state.samples.slice(0, 2);
  state.samples = [];
  return { blocks: scene.blocks.length, connections: scene.connections.length, groups: scene.groups.length, first };
}

/** Same history for every column before measuring (JIT feedback), then `warmup + steps` measured actions. */
async function run(options: {
  mode: "pan" | "zoom" | "drag";
  warmup: number;
  steps: number;
  scale: number;
}): Promise<{ samples: number[]; frames: number[]; timeouts: number; ticks: number[]; actionMs: number }> {
  if (options.warmup < 1) throw new Error("run() needs warmup >= 1: the first zoom step does not change the scale");
  const column = state.column;
  if (!column) throw new Error("setup() first");
  const camera = column.graph.cameraService;
  centerAt(0.01);
  await raf();
  for (let i = 0; i < 60; i++) {
    const previous = state.samples.length;
    const k = i < 30 ? i / 30 : (60 - i) / 30;
    const { width, height } = camera.getCameraState();
    camera.zoom(width / 2, height / 2, 0.01 * (1 + 3 * k));
    await waitForTick(previous);
  }
  centerAt(options.scale);
  await raf();
  await raf();
  const base = camera.getCameraState().scale;
  const measured: number[] = [];
  const tickCounts: number[] = [];
  const stamps: number[] = [];
  /** The synchronous cost of each measured action call (outside the scheduler ticks), summed. */
  let actionTotal = 0;
  let timeouts = 0;
  for (let i = 0; i < options.warmup + options.steps; i++) {
    const previous = state.samples.length;
    const actionStart = performance.now();
    if (options.mode === "pan") {
      const direction = Math.floor(i / 15) % 2 === 0 ? 1 : -1;
      camera.move(2 * direction, direction);
    } else if (options.mode === "zoom") {
      const phase = i % 30;
      const { width, height } = camera.getCameraState();
      camera.zoom(width / 2, height / 2, base * (1 + 0.003 * (phase < 15 ? phase : 30 - phase)));
    } else {
      column.drag(i % 2 ? 0 : 3);
    }
    if (i >= options.warmup) actionTotal += performance.now() - actionStart;
    const ticked = await waitForTick(previous);
    const stamp = performance.now();
    // The work of one action is every tick from the first one until the first idle tick (walk drag spills into the
    // next one).
    let work = 0;
    let worked = 0;
    if (ticked) {
      let index = previous;
      while (worked < MAX_ACTION_TICKS) {
        if (state.samples.length === index) await raf();
        if (state.samples.length === index) break;
        const duration = state.samples[index++];
        if (duration < IDLE_TICK_MS) break;
        work += duration;
        worked++;
      }
    }
    if (i >= options.warmup) {
      if (ticked) {
        measured.push(work);
        tickCounts.push(worked);
      } else timeouts++;
      stamps.push(stamp);
    }
  }
  if (options.mode === "drag") {
    column.drag(0);
    await raf();
  }
  const frames = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  return { samples: measured, frames, timeouts, ticks: tickCounts, actionMs: actionTotal / options.steps };
}

async function settle(options: { scale: number }): Promise<void> {
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
}

/** Blocks, anchors and scene elements drawn by one frame at the measured view. */
async function visible(options: {
  scale: number;
}): Promise<{ blocks: number; anchors: number; elements: number; batched?: number; chunks?: number }> {
  const column = state.column;
  if (!column) throw new Error("setup() first");
  centerAt(options.scale);
  await raf();
  resetWalkCounters();
  state.anchors = 0;
  const previous = state.samples.length;
  column.graph.cameraService.move(1, 0);
  await waitForTick(previous);
  const counts = column.visible();
  // Counts core Anchor.render calls: non-zero only in the walk column; the interpreter draws anchors as primitives
  // inside `elements`.
  return { ...counts, anchors: state.anchors };
}

/** Interpreter only: the query, the sort and the drawing of one frame at the measured view, timed apart. */
async function queryTiming(options: { scale: number; rounds: number }): Promise<TQueryTiming | undefined> {
  const column = state.column;
  if (!column?.timeQuery) return undefined;
  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  return column.timeQuery(options.rounds);
}

(window as unknown as { bench: unknown }).bench = { setup, run, settle, visible, queryTiming };
