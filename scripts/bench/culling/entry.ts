// Browser side of the culling benchmark. Bundled once per variant with `GRAPH` aliased to that
// variant's packages/graph/src/index.ts, so every variant runs the same scenes and measurement.
import { CanvasBlock, ECanDrag, EAnchorType, Graph } from "GRAPH";

type TBlockData = Record<string, unknown> & { x: number; y: number; width: number; height: number };
type TScene = { blocks: TBlockData[]; connections: Array<Record<string, unknown>> };

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

const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const state: { graph?: Graph; samples: number[]; center: { x: number; y: number } } = {
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

async function waitForUpdate(previous: number): Promise<void> {
  for (let i = 0; i < 20 && state.samples.length === previous; i++) await raf();
}

/** Mounts a scene in a `width`x`height` viewport and returns the duration of its first GraphLayer updates. */
async function setup(options: {
  scene: "playground" | "nirvana";
  width: number;
  height: number;
  scale: number;
  noopCanvas?: boolean;
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
  const settings =
    options.scene === "nirvana"
      ? { useBezierConnections: true, showConnectionArrows: true, useBlocksAnchors: true }
      : { useBezierConnections: false, showConnectionArrows: false, useBlocksAnchors: true };
  const graph = new Graph(
    {
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
        canDrag: ECanDrag.ALL,
        showConnectionLabels: false,
        blockComponents: { "block-action": ActionBlock },
        ...settings,
      },
    } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  state.graph = graph;
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

/** Pans or zooms for `warmup + steps` frames and returns the GraphLayer update durations of the last `steps`. */
async function run(options: { mode: "pan" | "zoom"; warmup: number; steps: number; scale: number }) {
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
  const base = camera.getCameraState().scale;
  for (let i = 0; i < options.warmup + options.steps; i++) {
    const previous = state.samples.length;
    if (options.mode === "pan") {
      const direction = Math.floor(i / 15) % 2 === 0 ? 1 : -1;
      camera.move(2 * direction, direction);
    } else {
      const phase = i % 30;
      const { width, height } = camera.getCameraState();
      camera.zoom(width / 2, height / 2, base * (1 + 0.003 * (phase < 15 ? phase : 30 - phase)));
    }
    await waitForUpdate(previous);
    if (i === options.warmup - 1) state.samples = [];
  }
  return state.samples.slice();
}

/** Moves back to the measured view and waits until it is painted, for screenshot comparison. */
async function settle(options: { scale: number }) {
  centerAt(options.scale);
  for (let i = 0; i < 10; i++) await raf();
  return state.graph?.cameraService.getCameraState();
}

(window as unknown as { bench: unknown }).bench = { setup, run, settle };
