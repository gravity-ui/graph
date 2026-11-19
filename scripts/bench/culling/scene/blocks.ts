// scripts/bench/culling/scene/blocks.ts
// Plan 3a's real path: blocks draw through graph.scene from level methods, their core anchors are child elements,
// connections stay MultipointConnection on GraphLayer's Path2D batch, groups are a BlockGroups layer. `renderer` picks
// the scene renderer, `look` the Nirvana-like subclass or the default Block.
import { batch } from "@preact/signals-core";
import {
  Anchor,
  BlockGroups,
  CanvasBlock,
  ECanDrag,
  Graph,
  Group,
  MultipointConnection,
  SceneComponent,
} from "GRAPH";
import type {
  ChildDescriptor,
  TAnchor,
  TAnchorClass,
  TBlock,
  TGraphComponentProps,
  TPoint,
  TSceneLevel,
  TScenePrimitive,
} from "GRAPH";
import { drawElements } from "GRAPH_SRC/lib/scene/drawPrimitives";
import { sceneComponentStats } from "GRAPH_SRC/components/canvas/scene/SceneComponent";
import { MiniMapLayer } from "GRAPH_MINIMAP";

import { COLORS, GROUP_STYLE, anchorPosition, blockPrimitives } from "./look";
import type { TBlockMeta, TLookOptions } from "./look";
import { routePoints } from "./scenes";
import type { TBenchBlock, TBenchScene } from "./scenes";
import { dragTarget } from "./walk";
import type { THoverStop, TColumn, TSceneMeter } from "./walk";

type TSceneBlock = TBlock<TBlockMeta>;

/** The look of the blocks of the current column (`setupBlocks`). */
let lookOptions: TLookOptions = {};

class SceneNirvanaBlock extends CanvasBlock<TSceneBlock> {
  private look?: { meta: TBlockMeta | undefined; height: number; primitives: readonly TScenePrimitive[] };

  public getAnchorPosition(anchor: TAnchor): TPoint {
    return anchorPosition(anchor.type === "IN", Number(String(anchor.id).replace(/^.*_(in|out)/, "")));
  }

  protected override schematic(): readonly TScenePrimitive[] {
    const { meta, height } = this.state;
    if (!this.look || this.look.meta !== meta || this.look.height !== height) {
      this.look = { meta, height, primitives: meta ? blockPrimitives(meta, height, lookOptions) : [] };
    }
    return this.look.primitives;
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return this.schematic();
  }
}

/** `--far-anchors`: an anchor class created and drawn on the minimalistic level too (a 6 x 6 square there). */
class BenchFarAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -3, y: -3, width: 6, height: 6 }];
  }
}

class FarAnchorsBlock extends SceneNirvanaBlock {
  protected override getAnchorClass(): TAnchorClass {
    return BenchFarAnchor;
  }
}

/** `--child-looks N`: a 12 x 12 chip along the block's top edge, drawn on the schematic level. */
class BenchChip extends SceneComponent<TGraphComponentProps & { id: string; index: number }> {
  public static override entityType = "benchChip";

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [
      { kind: "rect", part: "chip", x: 8 + this.props.index * 16, y: 4, width: 12, height: 12, fill: COLORS.progress },
    ];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }
}

/** The number of chips of `ChildLooksBlock` (`--child-looks N`), set by `setupBlocks`. */
let childLooks = 0;

class ChildLooksBlock extends SceneNirvanaBlock {
  protected override updateChildren(): ChildDescriptor[] {
    const id = String(this.props.id);
    const chips = Array.from({ length: childLooks }, (_, index) =>
      BenchChip.create({ id: `${id}/${index}`, index }, { key: `chip${index}` })
    );
    return [...chips, ...super.updateChildren()];
  }
}

/** The block class of the "nirvana-like" blocks: the stock one unless a new-path case asks for another. */
function nirvanaBlockClass(options: { farAnchors?: boolean; childLooks?: number }): typeof SceneNirvanaBlock {
  if (options.farAnchors) return FarAnchorsBlock;
  if ((options.childLooks ?? 0) > 0) return ChildLooksBlock;
  return SceneNirvanaBlock;
}

/**
 * `--child-looks`: draws one chip element on a counting canvas and throws unless it paints, so a case whose chips draw
 * nothing fails instead of measuring only their creation.
 */
function assertChipsPaint(graph: Graph): void {
  let chip: Parameters<typeof drawElements>[1][number] | undefined;
  graph.scene.store.forEach((element) => {
    if (!chip && element.entityType === "benchChip") chip = element;
  });
  if (!chip) throw new Error("child-looks: no chip element in the scene after mount");
  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  let paints = 0;
  const fill = ctx.fill.bind(ctx);
  ctx.fill = ((...args: Parameters<typeof ctx.fill>): void => {
    paints += 1;
    fill(...args);
  }) as typeof ctx.fill;
  const fillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = (...args: Parameters<typeof ctx.fillRect>): void => {
    paints += 1;
    fillRect(...args);
  };
  drawElements(ctx, [chip], 0.3);
  if (paints === 0) throw new Error("child-looks: a chip element paints nothing (no fill call)");
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
    /** Task 13: `--far-anchors`, an anchor class created at the minimalistic level. */
    farAnchors?: boolean;
    /** Task 13: `--child-looks N`, N child components with a look per block. */
    childLooks?: number;
    /** Task 17i: the names are camera-aware texts over the body (`--camera-aware-names [family]`). */
    cameraAwareNames?: boolean | string;
  }
): Promise<TColumn> {
  const names = options.cameraAwareNames ?? false;
  lookOptions = { cameraAwareName: names !== false, nameFamily: typeof names === "string" ? names : undefined };
  childLooks = options.childLooks ?? 0;
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
        blockComponents: options.look === "nirvana" ? { "nirvana-like": nirvanaBlockClass(options) } : {},
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
  if (childLooks > 0) assertChipsPaint(graph);
  // The minimap is the only caller of drawInterpreted on the bench page.
  const minimapDraws = { count: 0 };
  const drawInterpreted = graph.scene.drawInterpreted.bind(graph.scene);
  graph.scene.drawInterpreted = (...args: Parameters<typeof drawInterpreted>): void => {
    minimapDraws.count += 1;
    drawInterpreted(...args);
  };
  /** The blocks of the hover path: body, anchor, body each. */
  const HOVER_STOPS = 30;
  const toClient = (point: TPoint): TPoint => {
    const camera = graph.cameraService.getCameraState();
    return { x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y };
  };
  const toWorld = (point: TPoint): TPoint => {
    const camera = graph.cameraService.getCameraState();
    return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
  };
  /** Whether a stop's points hit what the path needs: its block's component, then its anchor's component. */
  const hitsItsTargets = (stop: THoverStop): boolean => {
    const state = graph.rootStore.blocksList.getBlockState(stop.blockId);
    const anchor = state?.getAnchorById(stop.anchorId)?.getViewComponent();
    if (!state || !anchor) return false;
    return (
      graph.getElementOverPoint(toWorld(stop.body)) === state.getViewComponent() &&
      graph.getElementOverPoint(toWorld(stop.anchor)) === anchor
    );
  };
  /**
   * New stops: the first 30 blocks of the viewport query with an OUT anchor whose body and anchor points both lie in
   * the client view (1600 x 1000 on the bench page) and hit their targets. The viewport query reaches past the view
   * (`getViewportRect`), and lazy anchors exist only for blocks the camera shows, so the filter comes before the count.
   */
  const findHoverStops = (): THoverStop[] => {
    const { width, height } = graph.cameraService.getCameraState();
    const inView = (point: TPoint): boolean => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
    const stops: THoverStop[] = [];
    for (const view of graph.getElementsInViewport([CanvasBlock])) {
      if (stops.length === HOVER_STOPS) break;
      const state = view.connectedState;
      const out = state.$anchors.peek().find((anchor) => anchor.type === "OUT");
      if (!out) continue;
      const geometry = state.$geometry.peek();
      const stop: THoverStop = {
        blockId: String(state.id),
        anchorId: String(out.id),
        body: toClient({ x: geometry.x + geometry.width / 3, y: geometry.y + geometry.height / 2 }),
        anchor: toClient(view.getAnchorPort(out.id).getPoint()),
      };
      if (inView(stop.body) && inView(stop.anchor) && hitsItsTargets(stop)) stops.push(stop);
    }
    return stops;
  };
  let path: TPoint[] | undefined;
  const setHoverPath = (given?: readonly THoverStop[]): THoverStop[] => {
    const stops = given ? [...given] : findHoverStops();
    const missed = stops.filter((stop) => !hitsItsTargets(stop)).length;
    if (stops.length < HOVER_STOPS || missed > 0) {
      const want = `${HOVER_STOPS} must hit their block and anchor`;
      throw new Error(`hover path: ${stops.length} stops, ${missed} of them missing a target; ${want}`);
    }
    path = stops.flatMap((stop) => [stop.body, stop.anchor, stop.body]);
    return stops;
  };
  const hoverEnters = { count: 0 };
  graph.on("mouseenter", () => {
    hoverEnters.count += 1;
  });
  const hover = (step: number): void => {
    if (!path) throw new Error("hover: setHoverPath() runs before the first move");
    const point = path[step % path.length];
    root.dispatchEvent(new MouseEvent("mousemove", { clientX: point.x, clientY: point.y, bubbles: true }));
  };

  /**
   * Moves the pointer to a point no graph component is under (found on a grid of the view), so the last target
   * leaves. A plain `mousemove`, so it works on a library without the root-leave handling.
   */
  const hoverEnd = (): void => {
    const { width, height } = graph.cameraService.getCameraState();
    for (let y = 2; y < height; y += 40) {
      for (let x = 2; x < width; x += 40) {
        if (graph.getElementOverPoint(toWorld({ x, y })) !== undefined) continue;
        root.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
        return;
      }
    }
    throw new Error("hover: no empty point in the view to leave the last target");
  };

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
    hover,
    hoverEnd,
    setHoverPath,
    hoverEnters,
    minimapDraws,
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
      const blocks = elements.filter((element) => element.entityType === "block").length;
      return { blocks, anchors: children, elements: elements.length };
    },
  };
}
