// scripts/bench/culling/scene/blocks.ts
// Plan 3a's real path: blocks draw through graph.scene from level methods, their core anchors are child elements,
// connections stay MultipointConnection on GraphLayer's Path2D batch, groups are a BlockGroups layer. `renderer` picks
// the scene renderer, `look` the Nirvana-like subclass or the default Block.
import { batch } from "@preact/signals-core";
import { BlockGroups, CanvasBlock, ECanDrag, Graph, Group, MultipointConnection } from "GRAPH";
import type { TAnchor, TBlock, TBlockView, TPoint, TScenePrimitive } from "GRAPH";
import { sceneComponentStats } from "GRAPH_SRC/components/canvas/scene/SceneComponent";
import { MiniMapLayer } from "GRAPH_MINIMAP";

import { GROUP_STYLE, anchorPosition, blockPrimitives } from "./look";
import type { TBlockMeta, TLookOptions } from "./look";
import { routePoints } from "./scenes";
import type { TBenchBlock, TBenchScene } from "./scenes";
import { dragTarget } from "./walk";
import type { TColumn, TSceneMeter } from "./walk";

type TSceneBlock = TBlock<TBlockMeta>;

/** The look of the blocks of the current column (`setupBlocks`). */
let lookOptions: TLookOptions = {};

class SceneNirvanaBlock extends CanvasBlock<TSceneBlock> {
  /** One primitive list per view, shared by every level: encodeLevels then merges nothing. */
  private look?: { view: TBlockView<TSceneBlock>; primitives: readonly TScenePrimitive[] };

  public getAnchorPosition(anchor: TAnchor): TPoint {
    return anchorPosition(anchor.type === "IN", Number(String(anchor.id).replace(/^.*_(in|out)/, "")));
  }

  protected override schematic(view: TBlockView<TSceneBlock>): readonly TScenePrimitive[] {
    return this.lookOf(view);
  }

  protected override detailed(view: TBlockView<TSceneBlock>): readonly TScenePrimitive[] {
    return this.lookOf(view);
  }

  private lookOf(view: TBlockView<TSceneBlock>): readonly TScenePrimitive[] {
    if (this.look?.view !== view) {
      this.look = { view, primitives: view.meta ? blockPrimitives(view.meta, view.height, lookOptions) : [] };
    }
    return this.look.primitives;
  }
}

/** The scene's share of an action: level methods, element writes and the backend applies of its ticks. */
function sceneMeter(graph: Graph): TSceneMeter {
  let applyMs = 0;
  const backendStats = (): { lastApplyMs: number } | undefined => graph.scene.layer.getBackend()?.stats;
  const meter: TSceneMeter = {
    start(): void {
      sceneComponentStats.reset();
      sceneComponentStats.enabled = true;
      applyMs = 0;
      const stats = backendStats();
      if (stats) stats.lastApplyMs = 0;
    },
    afterTick(): void {
      const stats = backendStats();
      if (!stats) return;
      applyMs += stats.lastApplyMs;
      stats.lastApplyMs = 0;
    },
    stop(): number {
      sceneComponentStats.enabled = false;
      meter.split = { levelMs: sceneComponentStats.levelMs, writeMs: sceneComponentStats.writeMs, applyMs };
      return sceneComponentStats.levelMs + sceneComponentStats.writeMs + applyMs;
    },
  };
  return meter;
}

export async function setupBlocks(
  root: HTMLDivElement,
  scene: TBenchScene,
  options: {
    renderer: "canvas" | "webgl";
    look: "nirvana" | "default";
    minimap: boolean;
    anchors?: boolean;
    /** Task 17i: the names are camera-aware texts over the body (`--camera-aware-names [family]`). */
    cameraAwareNames?: boolean | string;
  }
): Promise<TColumn> {
  const names = options.cameraAwareNames ?? false;
  lookOptions = { cameraAwareName: names !== false, nameFamily: typeof names === "string" ? names : undefined };
  const graph = new Graph(
    {
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
        canDrag: ECanDrag.ALL,
        // --no-anchors: no Anchor components, so no anchor child elements (their share of every number).
        useBlocksAnchors: options.anchors ?? true,
        showConnectionArrows: true,
        showConnectionLabels: false,
        connection: MultipointConnection,
        // An unknown `is` falls back to the default Block: the "default" look registers nothing.
        blockComponents: options.look === "nirvana" ? { "nirvana-like": SceneNirvanaBlock } : {},
        renderer: options.renderer,
      },
    } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  const BenchGroup = Group.define({ style: GROUP_STYLE, geometry: { padding: [0, 0, 0, 0] } });
  graph.addLayer(BlockGroups, { draggable: false }).setGroups(
    scene.groups.map((group) => ({ id: group.id, rect: group.rect, component: BenchGroup }))
  );
  if (options.minimap) graph.addLayer(MiniMapLayer, {});
  // The scene's time inside every tick (review I15: the per-tick split).
  const sceneTicks = { ms: 0 };
  const update = graph.scene.update.bind(graph.scene);
  graph.scene.update = (): void => {
    const start = performance.now();
    update();
    sceneTicks.ms += performance.now() - start;
  };
  graph.start();
  if (options.renderer === "webgl") {
    // Review C1: mount into a graph whose backend is already in webgl, so every element goes through applyMany.
    const started = performance.now();
    while (graph.scene.$renderer.value !== "webgl") {
      if (graph.scene.$renderer.value === "webgl-fallback" || performance.now() - started > 15000) {
        throw new Error(`blocks-webgl: renderer ${graph.scene.$renderer.value}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  const meter = sceneMeter(graph);
  // Lazy anchors (Task 17c): only the blocks the default camera shows (scale 0.5, the schematic level) create their
  // anchors, in the ticks that mount them; the mount waits for every block element.
  const expected = scene.blocks.length;
  meter.start();
  const mountStart = performance.now();
  graph.setEntities(scene as unknown as Parameters<Graph["setEntities"]>[0]);
  let mountMs = performance.now() - mountStart;
  const tick = (): void => {
    const start = performance.now();
    graph.scheduler.performUpdate();
    mountMs += performance.now() - start;
    meter.afterTick();
  };
  for (let i = 0; i < 10 && graph.scene.store.size < expected; i++) tick();
  tick();
  const mountSceneMs = meter.stop();
  if (graph.scene.store.size < expected) {
    throw new Error(`blocks: ${graph.scene.store.size} scene elements after mount, want ${expected}`);
  }

  const target = dragTarget(scene);
  const byId = new Map(scene.blocks.map((block) => [block.id, block]));
  const touching = scene.connections.filter(
    (connection) => connection.sourceBlockId === target.id || connection.targetBlockId === target.id
  );
  const index = (anchorId: string): number => Number(anchorId.replace(/^.*_(in|out)/, ""));
  return {
    graph,
    mountMs,
    mountSceneMs,
    sceneMeter: meter,
    sceneTicks,
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
    /** Owner elements over the view are blocks; child elements are anchors. */
    visible(): { blocks: number; anchors: number; elements: number } {
      const { x, y, width, height, scale } = graph.cameraService.getCameraState();
      const elements = graph.scene.query({ x: -x / scale, y: -y / scale, width: width / scale, height: height / scale });
      const children = elements.filter((element) => element.parent !== undefined).length;
      return { blocks: elements.length - children, anchors: children, elements: elements.length };
    },
  };
}
