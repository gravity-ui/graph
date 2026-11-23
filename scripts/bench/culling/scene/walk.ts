// E1: today's path. Every frame walks NirvanaLikeBlock components and their core anchors; connections are
// MultipointConnection on the Path2D batch; groups are a BlockGroups layer.
import { batch } from "@preact/signals-core";
import { BlockGroups, ECanDrag, Graph, Group, LegacyCanvasBlock, MultipointConnection } from "GRAPH";
import { drawElements } from "GRAPH_SRC/lib/scene/canvas/drawPrimitives";
import type { TSceneElement } from "GRAPH_SRC/lib/scene/types";

import { GROUP_STYLE, anchorPosition, blockBounds, blockPrimitives } from "./look";
import type { TBlockMeta } from "./look";
import { routePoints } from "./scenes";
import type { TBenchBlock, TBenchScene } from "./scenes";

/** Median ms per call of the parts of one interpreter frame, measured directly (`--query-timing`). */
export type TQueryTiming = {
  elements: number;
  indexQuery: number;
  sort: number;
  storeQuery: number;
  drawScene: number;
};

/** The scene's share of an action (blocks columns): level methods, element writes, backend applies. */
export type TSceneMeter = {
  start(): void;
  afterTick(): void;
  stop(): number;
  /** The parts of the last `stop()`: level methods, element writes, backend applies (ms). */
  split?: { levelMs: number; writeMs: number; applyMs: number };
};

/** One block of the hover path: client points of its body and of its OUT anchor, and the ids they must hit. */
export type THoverStop = {
  blockId: string;
  anchorId: string;
  body: { x: number; y: number };
  anchor: { x: number; y: number };
};

export type TColumn = {
  graph: Graph;
  drag(offset: number): void;
  visible(): { blocks: number; anchors: number; elements: number };
  /** Synchronous mount: setEntities, start and three scheduler updates (real component columns only). */
  mountMs?: number;
  /** Blocks columns: the scene's share of `mountMs`. */
  mountSceneMs?: number;
  sceneMeter?: TSceneMeter;
  /** Blocks columns: ms spent in graph.scene.update, summed over ticks; `run()` resets and reads it. */
  sceneTicks?: { ms: number };
  /** Blocks columns: one pointer move of the hover path (`--modes hover`), through the root's DOM listener. */
  hover?(step: number): void;
  /** Blocks columns: after a hover run, moves the pointer to empty space so the last target leaves. */
  hoverEnd?(): void;
  /**
   * Blocks columns: sets the hover path before a hover run, from saved stops (checked again) or new ones, and returns
   * the stops. It throws unless all 30 stops hit their block at the body point and its anchor component at the
   * anchor point, so a run that would miss the anchors fails.
   */
  setHoverPath?(stops?: readonly THoverStop[]): THoverStop[];
  /** Blocks columns: the graph's `mouseenter` events since setup, one per target change. */
  hoverEnters?: { count: number };
  /** Blocks columns: `graph.scene.drawInterpreted` calls since setup (the minimap's redraws). */
  minimapDraws?: { count: number };
  /** Interpreter only. */
  timeQuery?(rounds: number): TQueryTiming;
};

/** The LegacyCanvasBlock members this block uses; they are protected in the library. */
interface IBlockBase {
  state: { id: string; x: number; y: number; meta: TBlockMeta; height: number };
  context: { camera: { getCameraScale(): number } };
}
const BlockBase = LegacyCanvasBlock as unknown as new (...args: unknown[]) => IBlockBase;

const counters = { blocks: 0 };

/** Draws the shared look through drawElements(), so both columns run the same drawing code. */
class NirvanaLikeBlock extends BlockBase {
  /** The block as a scene element; its primitives are rebuilt only when the block's meta object changes. */
  private element?: TSceneElement;

  private elementMeta?: TBlockMeta;

  public getAnchorPosition(anchor: { id: string; type: string }): { x: number; y: number } {
    return anchorPosition(anchor.type === "IN", Number(anchor.id.replace(/^.*_(in|out)/, "")));
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    const { id, x, y, meta, height } = this.state;
    if (!this.element || this.elementMeta !== meta) {
      this.elementMeta = meta;
      this.element = {
        id,
        childOrder: 0,
        zIndex: 2,
        order: 0,
        styleId: 0,
        x,
        y,
        bounds: blockBounds(height),
        primitives: blockPrimitives(meta, height),
        hidden: false,
      };
    }
    this.element.x = x;
    this.element.y = y;
    counters.blocks++;
    drawElements(ctx, [this.element], this.context.camera.getCameraScale());
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D): void {
    this.draw(ctx);
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D): void {
    this.draw(ctx);
  }

  public renderDetailedView(ctx: CanvasRenderingContext2D): void {
    this.draw(ctx);
  }
}

/** The block with the most connections: the one the drag mode moves. */
export function dragTarget(scene: TBenchScene): TBenchBlock {
  const degree = new Map<string, number>();
  for (const connection of scene.connections) {
    for (const id of [connection.sourceBlockId, connection.targetBlockId]) degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  let best = scene.blocks[0];
  for (const block of scene.blocks) if ((degree.get(block.id) ?? 0) > (degree.get(best.id) ?? 0)) best = block;
  return best;
}

export function setupWalk(
  root: HTMLDivElement,
  scene: TBenchScene,
  options: { anchors?: boolean } = {}
): TColumn {
  const graph = new Graph(
    {
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
        canDrag: ECanDrag.ALL,
        // --no-anchors: no Anchor components, so no anchor child elements.
        useBlocksAnchors: options.anchors ?? true,
        showConnectionArrows: true,
        showConnectionLabels: false,
        connection: MultipointConnection,
        blockComponents: { "nirvana-like": NirvanaLikeBlock },
      },
    } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  const BenchGroup = Group.define({ style: GROUP_STYLE, geometry: { padding: [0, 0, 0, 0] } });
  const groups = graph.addLayer(BlockGroups, { draggable: false });
  groups.setGroups(scene.groups.map((group) => ({ id: group.id, rect: group.rect, component: BenchGroup })));
  const mountStart = performance.now();
  graph.setEntities(scene as unknown as Parameters<Graph["setEntities"]>[0]);
  graph.start();
  for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
  const mountMs = performance.now() - mountStart;

  const target = dragTarget(scene);
  const byId = new Map(scene.blocks.map((block) => [block.id, block]));
  const touching = scene.connections.filter(
    (connection) => connection.sourceBlockId === target.id || connection.targetBlockId === target.id
  );
  const index = (anchorId: string): number => Number(anchorId.replace(/^.*_(in|out)/, ""));
  return {
    graph,
    mountMs,
    drag(offset: number): void {
      const moved = { ...target, x: target.x + offset };
      batch(() => {
        graph.api.updateBlock({ id: target.id, x: moved.x });
        for (const connection of touching) {
          const source =
            connection.sourceBlockId === target.id ? moved : (byId.get(connection.sourceBlockId) as TBenchBlock);
          const destination =
            connection.targetBlockId === target.id ? moved : (byId.get(connection.targetBlockId) as TBenchBlock);
          const points = routePoints(
            source,
            index(connection.sourceAnchorId),
            destination,
            index(connection.targetAnchorId)
          );
          graph.api.updateConnection(connection.id, { points } as unknown as Parameters<
            Graph["api"]["updateConnection"]
          >[1]);
        }
      });
    },
    visible(): { blocks: number; anchors: number; elements: number } {
      // The walked legacy blocks are counted as they draw; their anchors are scene child elements, counted in view.
      const { x, y, scale, width, height } = graph.cameraService.getCameraState();
      const view = { x: -x / scale, y: -y / scale, width: width / scale, height: height / scale };
      const anchors = graph.scene.query(view).filter((element) => element.parent !== undefined).length;
      return { blocks: counters.blocks, anchors, elements: 0 };
    },
  };
}

/** Resets the per-frame counters; the harness calls it before the frame it counts. */
export function resetWalkCounters(): void {
  counters.blocks = 0;
}
