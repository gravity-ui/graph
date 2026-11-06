// Browser side of the culling benchmark. Bundled once per variant with `GRAPH` aliased to that
// variant's packages/graph/src/index.ts, so every variant runs the same scenes and measurement.
import * as GRAPH from "GRAPH";
import { BlockConnection, CanvasBlock, ECanDrag, EAnchorType, Graph } from "GRAPH";

type TBlockData = Record<string, unknown> & { x: number; y: number; width: number; height: number };
type TScene = { blocks: TBlockData[]; connections: Array<Record<string, unknown>> };

/** Main-thread work of WebGL connection drawing, accumulated since the last reset. */
type TGLStats = {
  drawMs: number;
  draws: number;
  drawCalls: number;
  instances: number;
  vertices: number;
  items?: number;
};

/** WebGL connections stats; older variants do not export them. */
const glStats = GRAPH as unknown as {
  getWebGLConnectionsStats?: () => TGLStats;
  resetWebGLConnectionsStats?: () => void;
};

/** Internals the benchmark reads; they are not part of the public API. */
type TLayerInternals = {
  __comp: { context: { scheduler: { update: () => void } }; treeNode: { children: Set<unknown> } };
};

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function anchorY(index: number): number {
  return 18 * index + (index >= 1 ? 8 * index : 0) + 18;
}

/** The CanvasBlock members the benchmark block uses; they are protected in the library. */
interface IBlockBase {
  connectedState: {
    $state: { value: { anchors?: Array<{ type: string }> } };
    $anchorIndexs: { value?: Map<string, number> };
  };
  state: { x: number; y: number; width: number; height: number; selected: boolean };
  context: {
    camera: { getCameraScale(): number };
    colors: { block: { background: string; border: string; selectedBorder: string } };
  };
  getContentRect(): { height: number };
}

const BlockBase = CanvasBlock as unknown as new (...args: unknown[]) => IBlockBase;

/** Storybook Playground ActionBlock at the scales measured here: a rounded body with two anchors. */
class ActionBlock extends BlockBase {
  public getAnchorPosition(anchor: { id: string; type: string }) {
    const state = this.connectedState.$state.value;
    const sameType = (state.anchors ?? []).filter((item: { type: string }) => item.type === anchor.type);
    const offset = (this.getContentRect().height - anchorY(sameType.length - 1)) / 2;
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    return { x: anchor.type === EAnchorType.OUT ? this.state.width : 0, y: offset + anchorY(index) };
  }

  public renderBody(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = Math.min(Math.round(2 / this.context.camera.getCameraScale()), 12);
    ctx.fillStyle = this.context.colors.block.background;
    ctx.beginPath();
    ctx.roundRect(this.state.x, this.state.y, this.state.width, this.state.height, 8);
    ctx.fill();
    ctx.strokeStyle = this.state.selected ? this.context.colors.block.selectedBorder : this.context.colors.block.border;
    ctx.stroke();
    ctx.closePath();
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx);
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx);
  }
}

/** Playground "10 000" scene: 10,476 action blocks with two anchors each and straight connections. */
function playground(): TScene {
  const random = mulberry32(42);
  const blocks: TBlockData[] = [];
  const connections: TScene["connections"] = [];
  const id = (index: number) => `action_${index}`;
  let previous: TBlockData[] = [];
  let index = 0;
  for (let layer = 0; layer <= 50; layer++) {
    const count = layer >= 25 ? (50 - layer) ** 2 : layer ** 2;
    const current: TBlockData[] = [];
    for (let row = 0; row <= count; row++) {
      const blockId = id(++index);
      const block = {
        is: "block-action",
        id: blockId,
        x: 1250 * layer,
        y: (500 - 200 * count) / 2 + 200 * row,
        width: 126,
        height: 126,
        selected: false,
        name: `Block #${index}`,
        anchors: [
          { id: `${blockId}_in`, blockId, type: EAnchorType.IN },
          { id: `${blockId}_out`, blockId, type: EAnchorType.OUT },
        ],
      };
      blocks.push(block);
      current.push(block);
    }
    if (layer > 1) {
      for (let c = 0; c <= 150; c++) {
        const from = blocks.length - current.length - previous.length - 1;
        const source = (random() * (blocks.length - current.length - 1 - from) + from) | 0;
        const target = (random() * current.length + blocks.length - current.length - 1) | 0;
        if (source === target) continue;
        connections.push({
          sourceBlockId: id(source),
          sourceAnchorId: `${id(source)}_out`,
          targetBlockId: id(target),
          targetAnchorId: `${id(target)}_in`,
        });
      }
      previous = current;
    }
  }
  return { blocks, connections };
}

/** Storybook NirvanaMaxGraphTest: 13,916 blocks without anchors and bezier connections with arrows. */
function nirvana(): TScene {
  const random = mulberry32(7);
  const blocks: TBlockData[] = [];
  const connections: TScene["connections"] = [];
  const seen = new Set<string>();
  let previous: TBlockData[] = [];
  let index = 0;
  for (let layer = 0; layer <= 55; layer++) {
    const count = layer >= 27.5 ? (55 - layer) ** 2 : layer ** 2;
    const current: TBlockData[] = [];
    for (let row = 0; row <= count; row++) {
      const blockId = `block_${++index}`;
      const block = {
        id: blockId,
        is: (CanvasBlock as unknown as { IS: string }).IS,
        x: 1250 * layer,
        y: (500 - 200 * count) / 2 + 200 * row,
        width: 200,
        height: 150,
        selected: false,
        name: blockId,
        anchors: [],
      };
      blocks.push(block);
      current.push(block);
    }
    if (layer > 1) {
      for (let c = 0; c <= 400; c++) {
        const from = blocks.length - current.length - previous.length - 1;
        const source = (random() * (blocks.length - current.length - 1 - from) + from) | 0;
        const target = (random() * current.length + blocks.length - current.length - 1) | 0;
        const connectionId = `block_${source}/block_${target}`;
        if (seen.has(connectionId)) continue;
        seen.add(connectionId);
        connections.push({
          id: connectionId,
          sourceBlockId: `block_${source}`,
          targetBlockId: `block_${target}`,
          label: "Some label",
        });
      }
      previous = current;
    }
  }
  return { blocks, connections };
}

type TStroke = { color: string; width: number; dash?: { pattern: readonly number[]; speed?: number } };
interface IConnectionBase {
  props: { id: string };
  getStroke(state?: unknown): TStroke;
}
const ConnectionBase = BlockConnection as unknown as new (...args: unknown[]) => IConnectionBase;

const PALETTE = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(value);
}

/** Connection classes for `--effect`; variants without getStroke() draw them like default connections. */
function effectConnection(effect: "none" | "dash" | "static-dash" | "style" | undefined): unknown {
  if (effect === "dash" || effect === "static-dash") {
    // The same pattern; `dash` runs it at 40 world units per second, `static-dash` keeps it still.
    const dash = effect === "dash" ? { pattern: [12, 8], speed: 40 } : { pattern: [12, 8] };
    return class extends ConnectionBase {
      public getStroke(state?: unknown): TStroke {
        return { ...super.getStroke(state), dash };
      }
    };
  }
  if (effect === "style") {
    return class extends ConnectionBase {
      public getStroke(state?: unknown): TStroke {
        const key = hash(String(this.props.id));
        return { ...super.getStroke(state), color: PALETTE[key % PALETTE.length], width: 1 + (key % 4) };
      }
    };
  }
  return undefined;
}

const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const state: {
  graph?: Graph;
  samples: number[];
  center: { x: number; y: number };
  dragBlock?: { id: string; x: number; y: number };
} = {
  samples: [],
  center: { x: 0, y: 0 },
};

function centerAt(scale: number): void {
  const graph = state.graph;
  if (!graph) throw new Error("setup() first");
  const camera = graph.cameraService.getCameraState();
  graph.cameraService.set({
    scale,
    x: camera.width / 2 - state.center.x * scale,
    y: camera.height / 2 - state.center.y * scale,
  });
}

/** Waits up to 20 frames for a graph-layer update; returns false when none arrived. */
async function waitForUpdate(previous: number): Promise<boolean> {
  for (let i = 0; i < 20 && state.samples.length === previous; i++) await raf();
  return state.samples.length !== previous;
}

/** Mounts a scene in a `width`x`height` viewport and returns the duration of its first GraphLayer updates. */
async function setup(options: {
  scene: "playground" | "nirvana";
  width: number;
  height: number;
  scale: number;
  noopCanvas?: boolean;
  shuffle?: boolean;
  chunkSize?: number;
  cellTiles?: number;
  labels?: boolean;
  renderer?: "canvas" | "webgl";
  effect?: "none" | "dash" | "static-dash" | "style";
}) {
  if (options.noopCanvas) {
    const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, unknown>;
    for (const method of ["fill", "stroke", "fillRect", "strokeRect", "roundRect", "arc", "fillText", "clearRect"]) {
      proto[method] = () => undefined;
    }
  }
  const root = document.getElementById("root") as HTMLDivElement;
  root.style.width = `${options.width}px`;
  root.style.height = `${options.height}px`;
  const scene = options.scene === "nirvana" ? nirvana() : playground();
  if (options.shuffle) {
    // Registration order unrelated to position, as in graphs loaded from a store.
    const random = mulberry32(1);
    const list = scene.connections;
    for (let i = list.length - 1; i > 0; i--) {
      const j = (random() * (i + 1)) | 0;
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const settings =
    options.scene === "nirvana"
      ? { useBezierConnections: true, showConnectionArrows: true, useBlocksAnchors: true }
      : { useBezierConnections: false, showConnectionArrows: false, useBlocksAnchors: true };
  const connection = effectConnection(options.effect);
  const graph = new Graph(
    {
      settings: {
        connectionsRenderer: options.renderer ?? "canvas",
        ...(connection ? { connection } : {}),
        canDragCamera: true,
        canZoomCamera: true,
        canDrag: ECanDrag.ALL,
        showConnectionLabels: Boolean(options.labels),
        blockComponents: { "block-action": ActionBlock },
        ...settings,
      },
    } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  state.graph = graph;
  // Older variants ignore constants they do not know; constants must be set before the first frame builds layers.
  const connectionConstants: Record<string, number> = {};
  if (options.chunkSize) connectionConstants.PATH2D_CHUNK_SIZE = options.chunkSize;
  if (options.cellTiles) connectionConstants.PATH2D_CHUNK_TILES = options.cellTiles;
  if (Object.keys(connectionConstants).length) {
    (graph as unknown as { setConstants(patch: { connection: Record<string, number> }): void }).setConstants({
      connection: connectionConstants,
    });
  }
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

  // The block with the most connections is the one the drag mode moves.
  const degree = new Map<string, number>();
  for (const item of scene.connections) {
    for (const key of ["sourceBlockId", "targetBlockId"]) {
      const blockId = String(item[key]);
      degree.set(blockId, (degree.get(blockId) ?? 0) + 1);
    }
  }
  let dragBlock: TBlockData | undefined;
  let best = -1;
  for (const block of scene.blocks) {
    const value = degree.get(String(block.id)) ?? 0;
    if (value > best) {
      best = value;
      dragBlock = block;
    }
  }
  state.dragBlock = dragBlock && { id: String(dragBlock.id), x: dragBlock.x, y: dragBlock.y };

  const layer = graph.getGraphLayer() as unknown as TLayerInternals;
  const scheduler = layer.__comp.context.scheduler;
  const update = scheduler.update.bind(scheduler);
  scheduler.update = () => {
    const start = performance.now();
    update();
    state.samples.push(performance.now() - start);
  };

  graph.setEntities(scene as unknown as Parameters<Graph["setEntities"]>[0]);
  graph.start();
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  const first = state.samples.slice(0, 2);
  state.samples = [];
  return { blocks: scene.blocks.length, connections: scene.connections.length, first };
}

/**
 * Runs `warmup + steps` frames and returns the GraphLayer update durations, the intervals between the frames of the
 * last `steps` and, when the variant has them, the WebGL draw stats of those frames: WebGL also draws in its own
 * animation loop, which the update durations do not include.
 */
async function run(options: {
  mode: "pan" | "zoom" | "idle" | "drag";
  warmup: number;
  steps: number;
  scale: number;
}): Promise<{ samples: number[]; frames: number[]; gl?: TGLStats; timeouts: number }> {
  const graph = state.graph;
  if (!graph) throw new Error("setup() first");
  const camera = graph.cameraService;
  // Every variant gets the same history across sparse, partial and full views before measuring.
  centerAt(0.01);
  await raf();
  for (let i = 0; i < 60; i++) {
    const previous = state.samples.length;
    const k = i < 30 ? i / 30 : (60 - i) / 30;
    const { width, height } = camera.getCameraState();
    camera.zoom(width / 2, height / 2, 0.01 * (1 + 3 * k));
    await waitForUpdate(previous);
  }
  centerAt(options.scale);
  await raf();
  await raf();
  state.samples = [];
  glStats.resetWebGLConnectionsStats?.();
  const base = camera.getCameraState().scale;
  const stamps: number[] = [];
  // Measured steps that waited the full 20 frames without a graph-layer update.
  let timeouts = 0;
  for (let i = 0; i < options.warmup + options.steps; i++) {
    const previous = state.samples.length;
    if (options.mode === "pan") {
      const direction = Math.floor(i / 15) % 2 === 0 ? 1 : -1;
      camera.move(2 * direction, direction);
    } else if (options.mode === "drag") {
      if (state.dragBlock) {
        const { id, x } = state.dragBlock;
        graph.api.updateBlock({ id, x: x + (i % 2 ? 0 : 3) });
      }
    } else if (options.mode === "zoom") {
      const phase = i % 30;
      const { width, height } = camera.getCameraState();
      camera.zoom(width / 2, height / 2, base * (1 + 0.003 * (phase < 15 ? phase : 30 - phase)));
    }
    if (options.mode === "idle") await raf();
    else if (!(await waitForUpdate(previous)) && i >= options.warmup) timeouts++;
    if (i === options.warmup - 1) {
      state.samples = [];
      glStats.resetWebGLConnectionsStats?.();
    }
    if (i >= options.warmup) stamps.push(performance.now());
  }
  const samples = state.samples.slice();
  const gl = glStats.getWebGLConnectionsStats?.();
  if (options.mode === "drag" && state.dragBlock) {
    // Put the block back so the next mode and the screenshot see the original scene.
    const previous = state.samples.length;
    graph.api.updateBlock({ id: state.dragBlock.id, x: state.dragBlock.x });
    await waitForUpdate(previous);
  }
  const frames = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  return { samples, frames, gl, timeouts };
}

/** Moves back to the measured view and waits until it is painted, for screenshot comparison. */
async function settle(options: { scale: number }) {
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  return state.graph?.cameraService.getCameraState();
}

/** Counts Path2D fills and strokes (batch chunks) in one frame at the measured view, outside the timed frames. */
async function count(options: { scale: number }): Promise<{ strokes: number; fills: number }> {
  const graph = state.graph;
  if (!graph) throw new Error("setup() first");
  const proto = CanvasRenderingContext2D.prototype;
  const { stroke, fill } = proto;
  const counts = { strokes: 0, fills: 0 };
  proto.stroke = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
    if (args[0] instanceof Path2D) counts.strokes++;
    Reflect.apply(stroke, this, args);
  } as unknown as typeof proto.stroke;
  proto.fill = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
    if (args[0] instanceof Path2D) counts.fills++;
    Reflect.apply(fill, this, args);
  } as unknown as typeof proto.fill;
  try {
    centerAt(options.scale);
    const previous = state.samples.length;
    graph.cameraService.move(1, 0);
    await waitForUpdate(previous);
  } finally {
    proto.stroke = stroke;
    proto.fill = fill;
  }
  return counts;
}

(window as unknown as { bench: unknown }).bench = { setup, run, settle, count };
