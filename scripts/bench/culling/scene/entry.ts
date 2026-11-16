// scripts/bench/culling/scene/entry.ts
// Browser side of the scene bench (E1, E2): one frame = one tick of the global scheduler, every layer included.
import { batch } from "@preact/signals-core";
import type { Graph } from "GRAPH";
import { anchorViewStats, exportAnchorStats } from "GRAPH_SRC/components/canvas/blocks/Blocks";
import * as instanceRanges from "GRAPH_SRC/lib/scene/webgl/InstanceRanges";
import { sceneExportStats } from "GRAPH_SRC/services/scene/GraphScene";
import type { TSceneLevel } from "GRAPH_SRC/services/scene/types";

import { STATUSES } from "./look";
import type { TBlockMeta } from "./look";
import { buildScene } from "./scenes";
import type { TBenchScene, TSceneKind } from "./scenes";
import { setupBlocks } from "./blocks";
import { setupInterpreter } from "./interpreter";
import { setupWebGL, webglStats } from "./webgl";
import { resetWalkCounters, setupWalk } from "./walk";
import type { THoverStop, TColumn, TQueryTiming } from "./walk";

const raf = (): Promise<number> => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const state: {
  column?: TColumn;
  scene?: TBenchScene;
  samples: number[];
  center: { x: number; y: number };
} = {
  samples: [],
  center: { x: 0, y: 0 },
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
}

/**
 * JS heap in MB, settled: two forced GCs (the runner launches Chromium with --expose-gc) separated by one animation
 * frame, then read. NaN without the API.
 */
async function heapMB(): Promise<number> {
  const collect = (): void => (window as unknown as { gc?: () => void }).gc?.();
  collect();
  await raf();
  collect();
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize / 2 ** 20 : NaN;
}

/** One synchronous scheduler tick; the instrumented scheduler records it in `state.samples` too. */
function tick(target: Graph): number {
  const start = performance.now();
  target.scheduler.performUpdate();
  return performance.now() - start;
}

/**
 * Bulk actions on the guarantee scene, each the synchronous call plus the two ticks that draw it: select every
 * block; start a drag of `count` selected blocks (as DragService does: its state first, then handleDragStart of each
 * participant, batched by `graph.scene.batchRaises` where it exists); change the status of every block with meta.
 */
async function bulk(options: {
  count: number;
}): Promise<{
  selectAllMs: number;
  dragStartMs: number;
  changeAllMs: number;
  selectAllSceneMs: number | null;
  dragStartSceneMs: number | null;
  changeAllSceneMs: number | null;
  /** The WebGL uploads (bytes, calls, ms of the calls) of select-all and change-all, their two ticks included. */
  selectAllUploads: TUploads;
  changeAllUploads: TUploads;
  /**
   * Blocks columns: change-all's scene share split into level methods, element writes and backend applies, and the
   * synchronous `updateBlock` calls (`actionMs`, before the two ticks; the level methods run in the ticks).
   */
  changeAllSplit: { levelMs: number; writeMs: number; applyMs: number; actionMs: number } | null;
}> {
  const target = graph();
  const scene = state.scene;
  if (!scene) throw new Error("setup() first");
  const ids = scene.blocks.map((block) => block.id);
  const meter = state.column?.sceneMeter;
  /** Two ticks that draw an action, each followed by the meter's read of the backend apply. */
  const twoTicks = (): number => {
    const first = tick(target);
    meter?.afterTick();
    const second = tick(target);
    meter?.afterTick();
    return first + second;
  };

  let start = performance.now();
  resetUploads();
  meter?.start();
  target.api.selectBlocks(ids, true);
  const selectAllMs = performance.now() - start + twoTicks();
  const selectAllUploads = takeUploads();
  const selectAllSceneMs = meter ? meter.stop() : null;
  target.api.selectBlocks(ids, false);
  tick(target);
  tick(target);

  const some = ids.slice(0, options.count);
  target.api.selectBlocks(some, true);
  tick(target);
  tick(target);
  const views = some.flatMap((id) => {
    const view = target.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    return view ? [view] : [];
  });
  const sourceEvent = new MouseEvent("mousedown");
  const context = {
    sourceEvent,
    startCoords: [0, 0],
    prevCoords: [0, 0],
    currentCoords: [0, 0],
    components: views,
  } as unknown as Parameters<(typeof views)[number]["handleDragStart"]>[0];
  const idle = target.dragService.$state.value;
  const raises = target.scene as unknown as { batchRaises?(run: () => void): void };
  start = performance.now();
  meter?.start();
  target.dragService.$state.value = { ...idle, isDragging: true, components: views } as typeof idle;
  const begin = (): void => views.forEach((view) => view.handleDragStart(context));
  if (raises.batchRaises) raises.batchRaises(begin);
  else begin();
  const dragStartMs = performance.now() - start + twoTicks();
  const dragStartSceneMs = meter ? meter.stop() : null;
  views.forEach((view) => view.handleDragEnd(context));
  target.dragService.$state.value = idle;
  target.api.selectBlocks(some, false);
  tick(target);
  tick(target);

  start = performance.now();
  resetUploads();
  meter?.start();
  batch(() => {
    for (const block of scene.blocks as unknown as Array<{ id: string; meta?: TBlockMeta }>) {
      if (!block.meta) continue;
      const status = STATUSES[(STATUSES.indexOf(block.meta.status) + 1) % STATUSES.length];
      target.api.updateBlock({ id: block.id, meta: { ...block.meta, status } } as Parameters<
        Graph["api"]["updateBlock"]
      >[0]);
    }
  });
  const changeAllActionMs = performance.now() - start;
  const changeAllMs = changeAllActionMs + twoTicks();
  const changeAllUploads = takeUploads();
  const changeAllSceneMs = meter ? meter.stop() : null;
  const changeAllSplit = meter?.split ? { ...meter.split, actionMs: changeAllActionMs } : null;
  return {
    selectAllMs,
    dragStartMs,
    changeAllMs,
    selectAllSceneMs,
    dragStartSceneMs,
    changeAllSceneMs,
    selectAllUploads,
    changeAllUploads,
    changeAllSplit,
  };
}

async function setup(options: {
  scene: TSceneKind;
  renderer: "walk" | "interpreter" | "cached" | "webgl" | "blocks" | "blocks-webgl" | "blocks-default";
  width: number;
  height: number;
  scale: number;
  /** Interpreter only: ends a path run after this many paths and polygons (drawElements' maxRun). */
  maxRun?: number;
  /** WebGL only: a style with this `opacity` on every block element. */
  blockOpacity?: number;
  /** Blocks columns: also add a MiniMapLayer. */
  minimap?: boolean;
  /** Walk and blocks columns: false turns `useBlocksAnchors` off (no anchor components or child elements). */
  anchors?: boolean;
  /** Blocks columns: camera-aware names over the body (Task 17i, `--camera-aware-names [family]`). */
  cameraAwareNames?: boolean | string;
  /** Blocks columns: Task 13's new-path case, an anchor class created at the minimalistic level. */
  farAnchors?: boolean;
  /** Blocks columns: Task 13's new-path case, N child components with a look per block. */
  childLooks?: number;
  /** Task 17i: the span merge threshold and per-frame span cap of InstanceRanges (`--upload-policy`). */
  uploadPolicy?: { mergeGapBytes: number; maxSpans: number; enclose: boolean };
}): Promise<{
  blocks: number;
  connections: number;
  groups: number;
  first: number[];
  mountMs: number | null;
  mountSceneMs: number | null;
  sceneElements: number;
  heapMB: number;
}> {
  if (options.uploadPolicy) {
    // Read by name: the base tree of an A/B has no such export.
    const policy = Reflect.get(instanceRanges, "instanceUploadPolicy") as object | undefined;
    if (!policy) throw new Error("--upload-policy: this tree's InstanceRanges has no instanceUploadPolicy");
    Object.assign(policy, options.uploadPolicy);
  }
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
  if (options.renderer === "walk") state.column = setupWalk(root, scene, { anchors: options.anchors });
  else if (options.renderer === "webgl") {
    state.column = await setupWebGL(root, scene, { blockOpacity: options.blockOpacity });
  } else if (
    options.renderer === "blocks" ||
    options.renderer === "blocks-webgl" ||
    options.renderer === "blocks-default"
  ) {
    state.column = await setupBlocks(root, scene, {
      renderer: options.renderer === "blocks-webgl" ? "webgl" : "canvas",
      look: options.renderer === "blocks-default" ? "default" : "nirvana",
      minimap: options.minimap ?? false,
      anchors: options.anchors,
      farAnchors: options.farAnchors,
      childLooks: options.childLooks,
      cameraAwareNames: options.cameraAwareNames ?? false,
    });
  } else if (options.renderer === "cached") state.column = setupInterpreter(root, scene, { batchConnections: true });
  else state.column = setupInterpreter(root, scene, { maxRun: options.maxRun });
  instrument(state.column.graph);
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  const first = state.samples.slice(0, 2);
  state.samples = [];
  return {
    blocks: scene.blocks.length,
    connections: scene.connections.length,
    groups: scene.groups.length,
    first,
    mountMs: state.column.mountMs ?? null,
    mountSceneMs: state.column.mountSceneMs ?? null,
    // Real block columns: block elements plus the anchors of the blocks the mount camera showed (lazy anchors).
    sceneElements: state.column.graph.scene.store.size,
    heapMB: await heapMB(),
  };
}

/** Same history for every column before measuring (JIT feedback), then `warmup + steps` measured actions. */
async function run(options: {
  mode: "pan" | "zoom" | "drag" | "hover";
  warmup: number;
  steps: number;
  scale: number;
  /** World units the drag mode moves the block by, back and forth (default 3). */
  dragOffset?: number;
  /** The hover mode's checked stops, from an earlier run (they are checked again); new ones when absent. */
  hoverPath?: readonly THoverStop[];
}): Promise<{
  samples: number[];
  frames: number[];
  timeouts: number;
  ticks: number[];
  actionMs: number;
  sceneMs: number | null;
  minimapDraws: number;
  hoverEnters: number;
  hoverPath: THoverStop[] | undefined;
}> {
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
  const hoverStops = options.mode === "hover" ? column.setHoverPath?.(options.hoverPath) : undefined;
  const entersBefore = column.hoverEnters?.count ?? 0;
  const drawsBefore = column.minimapDraws?.count ?? 0;
  const base = camera.getCameraState().scale;
  const measured: number[] = [];
  const tickCounts: number[] = [];
  const stamps: number[] = [];
  /** The synchronous cost of each measured action call (outside the scheduler ticks), summed. */
  let actionTotal = 0;
  let timeouts = 0;
  for (let i = 0; i < options.warmup + options.steps; i++) {
    if (i === options.warmup && column.sceneTicks) column.sceneTicks.ms = 0;
    const previous = state.samples.length;
    const actionStart = performance.now();
    if (options.mode === "pan") {
      const direction = Math.floor(i / 15) % 2 === 0 ? 1 : -1;
      camera.move(2 * direction, direction);
    } else if (options.mode === "zoom") {
      const phase = i % 30;
      const { width, height } = camera.getCameraState();
      camera.zoom(width / 2, height / 2, base * (1 + 0.003 * (phase < 15 ? phase : 30 - phase)));
    } else if (options.mode === "hover") column.hover?.(i);
    else {
      column.drag(i % 2 ? 0 : options.dragOffset ?? 3);
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
  const result = { samples: measured, frames, timeouts, ticks: tickCounts, actionMs: actionTotal / options.steps,
    sceneMs: column.sceneTicks ? column.sceneTicks.ms / options.steps : null,
    minimapDraws: (column.minimapDraws?.count ?? 0) - drawsBefore,
    hoverEnters: (column.hoverEnters?.count ?? 0) - entersBefore,
    hoverPath: hoverStops,
  };
  if (options.mode === "hover") {
    // Outside the measured interval: the last target leaves and the tags it set settle, so the next mode starts clean.
    column.hoverEnd?.();
    for (let i = 0; i < 3; i++) await raf();
  }
  return result;
}

async function settle(options: { scale: number }): Promise<void> {
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
}

/**
 * `--bulk-spin`: a busy loop of `ms` on the main thread (arithmetic only: no allocation, no heap reads), so the next
 * action starts on a busy core whatever the column's frames cost before it. Returns the loop's result (never used).
 */
function spin(ms: number): number {
  const until = performance.now() + ms;
  let x = 1;
  while (performance.now() < until) x = (x * 1103515245 + 12345) % 2147483648;
  return x;
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
  const previous = state.samples.length;
  column.graph.cameraService.move(1, 0);
  await waitForTick(previous);
  // Anchors are scene child elements now (they no longer render): the walk column counts those in view, the
  // interpreter draws its anchors as primitives inside `elements`.
  return column.visible();
}

/** Interpreter only: the query, the sort and the drawing of one frame at the measured view, timed apart. */
async function queryTiming(options: { scale: number; rounds: number }): Promise<TQueryTiming | undefined> {
  const column = state.column;
  if (!column?.timeQuery) return undefined;
  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  return column.timeQuery(options.rounds);
}

/** The interpreter's query over the camera's world rect at the current level: its median ms and its element count. */
function timeSceneQuery(rounds: number): { ms: number; elements: number } {
  const target = graph();
  const { x, y, width, height, scale } = target.cameraService.getCameraState();
  const rect = { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
  const level = target.scene.$level.peek();
  const times: number[] = [];
  let elements = 0;
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    elements = target.scene.store.query(rect, level).length;
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { ms: times[times.length >> 1], elements };
}

/** One synchronous camera action and the ticks that draw it (until an idle tick, at most 5), timed apart. */
function cameraAction(apply: () => void): { totalMs: number; actionMs: number; ticks: number[] } {
  const target = graph();
  const start = performance.now();
  apply();
  const actionMs = performance.now() - start;
  const ticks: number[] = [];
  for (let i = 0; i < MAX_ACTION_TICKS; i++) {
    const ms = tick(target);
    // The scene meter (blocks columns) sums the backend applies of the ticks.
    state.column?.sceneMeter?.afterTick();
    if (ms < IDLE_TICK_MS && i > 0) break;
    ticks.push(ms);
  }
  return { totalMs: actionMs + ticks.reduce((sum, ms) => sum + ms, 0), actionMs, ticks };
}

/**
 * Lazy anchors (Task 17c), on real block columns: the pan at `scale` before and after a visit to the schematic level
 * at the view's centre, the first zoom-in (the camera change with the anchors' view test, plus the ticks that draw it
 * and create the anchors), a second zoom-in once the anchors exist, a pan at the schematic level with the view test's
 * cost per camera change, and the interpreter's query at `scale` before and after the visit.
 */
async function visit(options: { scale: number; visitScale: number; steps: number }): Promise<{
  panBefore: number;
  panAfter: number;
  queryBefore: { ms: number; elements: number };
  queryAfter: { ms: number; elements: number };
  elementsBefore: number;
  elementsAfter: number;
  zoomIn: { totalMs: number; actionMs: number; ticks: number[]; sceneMs: number | null; anchors: number };
  zoomInAgain: { totalMs: number; actionMs: number; ticks: number[] };
  schematicPan: { tickMs: number; viewTestMs: number; viewTestRuns: number; requested: number; anchors: number };
}> {
  const target = graph();
  const store = target.scene.store;
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const before = await run({ mode: "pan", warmup: 10, steps: options.steps, scale: options.scale });
  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  const queryBefore = timeSceneQuery(30);
  const elementsBefore = store.size;

  const meter = state.column?.sceneMeter;
  meter?.start();
  const zoom = cameraAction(() => centerAt(options.visitScale));
  const zoomSceneMs = meter ? meter.stop() : null;
  const anchors = store.size - elementsBefore;
  for (let i = 0; i < 3; i++) await raf();

  // The view test's cost per camera change while panning at the schematic level.
  anchorViewStats.reset();
  anchorViewStats.enabled = true;
  const panTicks: number[] = [];
  for (let i = 0; i < 40; i++) {
    const direction = Math.floor(i / 10) % 2 === 0 ? 1 : -1;
    panTicks.push(cameraAction(() => target.cameraService.move(20 * direction, 10 * direction)).totalMs);
  }
  anchorViewStats.enabled = false;
  const schematicPan = {
    tickMs: mean(panTicks),
    viewTestMs: anchorViewStats.runs ? anchorViewStats.ms / anchorViewStats.runs : 0,
    viewTestRuns: anchorViewStats.runs,
    requested: anchorViewStats.requested,
    anchors: store.size - elementsBefore,
  };

  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  const again = cameraAction(() => centerAt(options.visitScale));
  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  const queryAfter = timeSceneQuery(30);
  const elementsAfter = store.size;
  const after = await run({ mode: "pan", warmup: 10, steps: options.steps, scale: options.scale });
  return {
    panBefore: mean(before.samples),
    panAfter: mean(after.samples),
    queryBefore,
    queryAfter,
    elementsBefore,
    elementsAfter,
    zoomIn: { ...zoom, sceneMs: zoomSceneMs, anchors },
    zoomInAgain: again,
    schematicPan,
  };
}

/**
 * Bytes the page writes through WebGL 2 (buffer data and texture images, whatever the backend counts itself), so the
 * sweep measures any tree, the base of an A/B included. Patched on the prototype before any context exists.
 */
const glUploads: { bytes: number; calls: number; ms: number; log?: TUploadCall[] } = { bytes: 0, calls: 0, ms: 0 };
{
  const prototype = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ["bufferSubData", "bufferData", "texSubImage2D", "texImage2D"]) {
    const original = prototype[name];
    prototype[name] = function (this: WebGL2RenderingContext, ...args: unknown[]): unknown {
      // The data is the one typed array among the arguments; a size alone (bufferData) uploads nothing.
      const data = args.find((arg) => ArrayBuffer.isView(arg)) as ArrayBufferView | undefined;
      if (!data) return original.apply(this, args);
      glUploads.bytes += data.byteLength;
      glUploads.calls++;
      // The clock is coarse (0.1 ms): summed over many calls the times are right on average.
      const start = performance.now();
      const result = original.apply(this, args);
      const ms = performance.now() - start;
      glUploads.ms += ms;
      glUploads.log?.push({ name, bytes: data.byteLength, ms });
      return result;
    };
  }
}

/** The text stats of the WebGL backend's draws, summed since the last read (`backendTexts`). */
const backendTexts = { relayouts: 0, kept: 0, glyphs: 0, written: 0, drawn: 0, ms: 0, draws: 0 };
let countedBackend: unknown;

/** Sums the text stats of every draw of the column's WebGL backend into `backendTexts` (once per backend). */
function countBackendTexts(target: Graph): void {
  type TCounted = {
    draw(frame: unknown): boolean;
    stats: {
      lastTextRelayouts: number;
      lastTextRelayoutGlyphs: number;
      lastTextRelayoutMs: number;
      /** Task 17i: absent in older trees. */
      lastTextRelayoutsKept?: number;
      lastTextRelayoutWrittenBytes?: number;
      lastTextRelayoutDrawnBytes?: number;
    };
  };
  const backend = target.scene.layer.getBackend() as unknown as TCounted | undefined;
  if (!backend || countedBackend === backend) return;
  countedBackend = backend;
  const draw = backend.draw.bind(backend);
  backend.draw = (frame: unknown): boolean => {
    const result = draw(frame);
    backendTexts.relayouts += backend.stats.lastTextRelayouts;
    backendTexts.glyphs += backend.stats.lastTextRelayoutGlyphs;
    backendTexts.ms += backend.stats.lastTextRelayoutMs;
    backendTexts.kept += backend.stats.lastTextRelayoutsKept ?? 0;
    backendTexts.written += backend.stats.lastTextRelayoutWrittenBytes ?? 0;
    backendTexts.drawn += backend.stats.lastTextRelayoutDrawnBytes ?? 0;
    backendTexts.draws++;
    return result;
  };
}

/** One WebGL upload call: the function, its bytes and its ms. */
type TUploadCall = { name: string; bytes: number; ms: number };

/** The WebGL uploads of an action: bytes, calls and the ms of the calls (`glUploads`), and each call. */
type TUploads = { bytes: number; calls: number; ms: number; log: TUploadCall[] };

function resetUploads(): void {
  glUploads.bytes = 0;
  glUploads.calls = 0;
  glUploads.ms = 0;
  glUploads.log = [];
}

function takeUploads(): TUploads {
  const log = glUploads.log ?? [];
  glUploads.log = undefined;
  return { bytes: glUploads.bytes, calls: glUploads.calls, ms: glUploads.ms, log };
}

/** Bytes of a glyph instance (28 floats): what each re-laid-out glyph costs to upload at least. */
const GLYPH_BYTES = 28 * 4;

type TSweepStep = {
  scale: number;
  tickMs: number;
  relayouts: number;
  kept: number;
  relayoutBytes: number;
  /** Task 17i fix round 1: the bytes the re-layouts wrote, and those of the glyphs they draw (0 in older trees). */
  writtenBytes: number;
  drawnBytes: number;
  relayoutMs: number;
  uploadBytes: number;
  uploadCalls: number;
  uploadMs: number;
  blocks: number;
};

/**
 * Task 17i: a zoom sweep with camera-aware names, `from` -> `to` -> `from` in `steps` geometric steps each way, once
 * unmeasured (it creates the lazy anchors and warms the caches), then measured. Per step: the scheduler ticks of the
 * camera change (until an idle one), the frame interval, the texts the WebGL backend laid out again and their glyph
 * bytes, the bytes and calls of every WebGL upload, and the blocks in view.
 */
async function sweep(options: {
  from: number;
  to: number;
  steps: number;
}): Promise<{ steps: TSweepStep[]; frames: number[] }> {
  const column = state.column;
  if (!column) throw new Error("setup() first");
  const target = column.graph;
  countBackendTexts(target);
  const scales: number[] = [];
  for (let i = 0; i <= options.steps; i++) {
    scales.push(options.from * Math.pow(options.to / options.from, i / options.steps));
  }
  for (let i = options.steps - 1; i >= 0; i--) scales.push(scales[i]);
  const steps: TSweepStep[] = [];
  const stamps: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    centerAt(scales[0]);
    for (let i = 0; i < 3; i++) await raf();
    for (const scale of scales.slice(1)) {
      const previous = state.samples.length;
      glUploads.bytes = 0;
      glUploads.calls = 0;
      glUploads.ms = 0;
      backendTexts.relayouts = 0;
      backendTexts.glyphs = 0;
      backendTexts.ms = 0;
      backendTexts.kept = 0;
      backendTexts.written = 0;
      backendTexts.drawn = 0;
      centerAt(scale);
      const ticked = await waitForTick(previous);
      const stamp = performance.now();
      let work = 0;
      if (ticked) {
        let index = previous;
        for (let worked = 0; worked < MAX_ACTION_TICKS; worked++) {
          if (state.samples.length === index) await raf();
          if (state.samples.length === index) break;
          const duration = state.samples[index++];
          if (duration < IDLE_TICK_MS) break;
          work += duration;
        }
      }
      if (pass === 0) continue;
      stamps.push(stamp);
      const { x, y, width, height } = target.cameraService.getCameraState();
      const rect = { x: -x / scale, y: -y / scale, width: width / scale, height: height / scale };
      const blocks = target.scene.query(rect).filter((element) => element.parent === undefined).length;
      steps.push({
        scale,
        tickMs: work,
        relayouts: backendTexts.relayouts,
        kept: backendTexts.kept,
        relayoutBytes: backendTexts.glyphs * GLYPH_BYTES,
        writtenBytes: backendTexts.written,
        drawnBytes: backendTexts.drawn,
        relayoutMs: backendTexts.ms,
        uploadBytes: glUploads.bytes,
        uploadCalls: glUploads.calls,
        uploadMs: glUploads.ms,
        blocks,
      });
    }
  }
  return { steps, frames: stamps.slice(1).map((stamp, index) => stamp - stamps[index]) };
}

type TToggleFrame = {
  ms: number;
  relayouts: number;
  relayoutBytes: number;
  relayoutMs: number;
  uploadBytes: number;
  uploadCalls: number;
  uploadMs: number;
};

/**
 * Task 17i: the frame that turns `cameraAwareText` off, and the one that turns it on again, at `scale` (`rounds`
 * times each): the setting's synchronous call and the ticks that draw it, until an idle one.
 */
async function toggle(options: {
  scale: number;
  rounds: number;
}): Promise<{ off: TToggleFrame[]; on: TToggleFrame[] }> {
  const target = graph();
  countBackendTexts(target);
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  const frame = (value: boolean): TToggleFrame => {
    glUploads.bytes = 0;
    glUploads.calls = 0;
    glUploads.ms = 0;
    backendTexts.relayouts = 0;
    backendTexts.glyphs = 0;
    backendTexts.ms = 0;
    const action = cameraAction(() => target.updateSettings({ cameraAwareText: value }));
    return {
      ms: action.totalMs,
      relayouts: backendTexts.relayouts,
      relayoutBytes: backendTexts.glyphs * GLYPH_BYTES,
      relayoutMs: backendTexts.ms,
      uploadBytes: glUploads.bytes,
      uploadCalls: glUploads.calls,
      uploadMs: glUploads.ms,
    };
  };
  const off: TToggleFrame[] = [];
  const on: TToggleFrame[] = [];
  for (let round = 0; round < options.rounds; round++) {
    off.push(frame(false));
    for (let i = 0; i < 3; i++) await raf();
    on.push(frame(true));
    for (let i = 0; i < 3; i++) await raf();
  }
  return { off, on };
}

type TExportRun = {
  totalMs: number;
  prepareMs: number;
  drawMs: number;
  cleanupMs: number;
  /** The ticks after the export, until an idle one (at most 5): what it queued (hit boxes, connections, the redraw). */
  nextTickMs: number;
  blocks: number;
  anchors: number;
};

/**
 * `--export` (Task 17g): `graph.scene.toImage()` of the whole scene (the hit test's usable rect) at `scale` and
 * `level`, three runs on this page, the camera at `scale` (minimalistic at 0.038, so no anchor of an unvisited block
 * exists). Each run gives its prepare / draw / cleanup split (`sceneExportStats`), the anchors it created and dropped
 * (`exportAnchorStats`) and the ticks after it. The third run also reads the JS heap at its peak: an export preparer
 * added after the blocks' one forces a GC there, so that run's times include the GC and are not reported.
 */
async function exportScene(options: { scale: number; level: TSceneLevel }): Promise<{
  width: number;
  height: number;
  runs: TExportRun[];
  heapBeforeMB: number;
  heapPeakMB: number;
  heapAfterMB: number;
  elementsBefore: number;
  elementsPeak: number;
  elementsAfter: number;
}> {
  const target = graph();
  centerAt(options.scale);
  for (let i = 0; i < 3; i++) await raf();
  const usable = target.api.getUsableRect();
  // The output must fit the canvas limits (16384 per side, 2^26 pixels): a smaller scale when the scene does not.
  const fit = Math.min(1, 16000 / (usable.width * options.scale), 16000 / (usable.height * options.scale));
  const area = usable.width * usable.height * (options.scale * fit) ** 2;
  const scale = options.scale * fit * Math.min(1, Math.sqrt(2 ** 26 / Math.max(area, 1)) * 0.99);
  const image = (): HTMLCanvasElement =>
    target.scene.toImage({ rect: usable, scale, pixelRatio: 1, level: options.level });
  const memory = (): number => {
    const used = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    return used === undefined ? NaN : used / 2 ** 20;
  };
  sceneExportStats.enabled = true;
  exportAnchorStats.enabled = true;
  const runs: TExportRun[] = [];
  let width = 0;
  let height = 0;
  const once = (): TExportRun => {
    const start = performance.now();
    const canvas = image();
    const totalMs = performance.now() - start;
    width = canvas.width;
    height = canvas.height;
    const ticks: number[] = [];
    for (let i = 0; i < MAX_ACTION_TICKS; i++) {
      const ms = tick(target);
      if (ms < IDLE_TICK_MS && i > 0) break;
      ticks.push(ms);
    }
    return {
      totalMs,
      prepareMs: sceneExportStats.prepareMs,
      drawMs: sceneExportStats.drawMs,
      cleanupMs: sceneExportStats.cleanupMs,
      nextTickMs: ticks.reduce((sum, ms) => sum + ms, 0),
      blocks: exportAnchorStats.blocks,
      anchors: exportAnchorStats.anchors,
    };
  };
  const store = target.scene.store;
  const elementsBefore = store.size;
  for (let run = 0; run < 2; run++) {
    runs.push(once());
    for (let i = 0; i < 3; i++) await raf();
  }
  const heapBeforeMB = await heapMB();
  let heapPeakMB = NaN;
  let elementsPeak = 0;
  const removeProbe = target.scene.addExportPreparer(() => {
    (window as unknown as { gc?: () => void }).gc?.();
    heapPeakMB = memory();
    elementsPeak = store.size;
    return undefined;
  });
  try {
    once();
  } finally {
    removeProbe();
  }
  for (let i = 0; i < 3; i++) await raf();
  const heapAfterMB = await heapMB();
  sceneExportStats.enabled = false;
  exportAnchorStats.enabled = false;
  return {
    width,
    height,
    runs,
    heapBeforeMB,
    heapPeakMB,
    heapAfterMB,
    elementsBefore,
    elementsPeak,
    elementsAfter: store.size,
  };
}

(window as unknown as { bench: unknown }).bench = {
  setup,
  run,
  settle,
  visible,
  /** The scene renderer's state of the column's graph ("canvas", "webgl", "webgl-fallback", ...). */
  rendererState: (): string => String(graph().scene.$renderer.value),
  queryTiming,
  webglStats,
  bulk,
  visit,
  spin,
  exportScene,
  sweep,
  toggle,
};
