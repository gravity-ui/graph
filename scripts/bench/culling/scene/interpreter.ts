// E2: the same picture from scene data. The graph has no entities: it only provides the camera, the below layer and
// the scheduler. A SceneCanvasLayer draws groups (z 0), connections (z 1) and blocks with their anchors (z 2).
import { Graph, getSegmentsBounds, multipointGeometry } from "GRAPH";
import { SceneCanvasLayer } from "GRAPH_SRC/lib/scene/SceneCanvasLayer";
import { ScenePathBatch } from "GRAPH_SRC/lib/scene/ScenePathBatch";
import { SceneStore, compareSceneOrder } from "GRAPH_SRC/lib/scene/SceneStore";
import type { TileIndex, TTileRect } from "GRAPH_SRC/lib/culling/TileIndex";
import type { TSceneElement, TScenePrimitive } from "GRAPH_SRC/lib/scene/types";

import { anchorPrimitives, blockBounds, blockPrimitives, connectionPrimitives, groupPrimitives } from "./look";
import { routePoints } from "./scenes";
import type { TBenchBlock, TBenchConnection, TBenchScene } from "./scenes";
import { dragTarget } from "./walk";
import type { TColumn, TQueryTiming } from "./walk";

type TGeometry = { segments: Float32Array; arrow?: { points: Float32Array; closed: boolean } };

function connectionGeometry(points: Array<{ x: number; y: number }>, connection: TBenchConnection): TGeometry {
  const input = {
    source: points[0],
    target: points[points.length - 1],
    points,
    useBezier: false,
    bezierDirection: "horizontal",
    connection,
  };
  return (multipointGeometry as unknown as (value: typeof input) => TGeometry)(input);
}

function connectionElement(geometry: TGeometry): { bounds: TTileRect; primitives: TScenePrimitive[] } {
  // getSegmentsBounds(segments, tight): tight = exact cubic extrema, as with EXP_USE_TIGHT_BEZIER_BOUNDS.
  const box = getSegmentsBounds(geometry.segments, true) ?? [0, 0, 0, 0];
  let [minX, minY, maxX, maxY] = box;
  const arrow = geometry.arrow?.points ?? new Float32Array();
  for (let i = 0; i + 1 < arrow.length; i += 2) {
    minX = Math.min(minX, arrow[i]);
    maxX = Math.max(maxX, arrow[i]);
    minY = Math.min(minY, arrow[i + 1]);
    maxY = Math.max(maxY, arrow[i + 1]);
  }
  const pad = 2;
  return {
    bounds: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad },
    primitives: connectionPrimitives(geometry),
  };
}

/**
 * `batchConnections` (E2b, the `cached` column): the connections go to a ScenePathBatch, which caches their chunk paths
 * per grid cell as the walk's BatchPath2DRenderer does, instead of the store, which rebuilds them every frame.
 */
export function setupInterpreter(
  root: HTMLDivElement,
  scene: TBenchScene,
  options: { maxRun?: number; batchConnections?: boolean } = {}
): TColumn {
  const graph = new Graph(
    { settings: { canDragCamera: true, canZoomCamera: true } } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  const store = new SceneStore(1024);
  const batch = options.batchConnections ? new ScenePathBatch({ zIndex: 1 }) : undefined;
  for (const group of scene.groups) {
    const { x, y, width, height } = group.rect;
    store.add({
      id: group.id,
      zIndex: 0,
      x,
      y,
      bounds: { minX: -1, minY: -1, maxX: width + 1, maxY: height + 1 },
      primitives: groupPrimitives(width, height),
    });
  }
  for (const connection of scene.connections) {
    const element = connectionElement(connectionGeometry(connection.points, connection));
    if (batch) batch.add({ id: connection.id, x: 0, y: 0, ...element });
    else store.add({ id: connection.id, zIndex: 1, x: 0, y: 0, ...element });
  }
  for (const block of scene.blocks) {
    store.add({
      id: block.id,
      zIndex: 2,
      x: block.x,
      y: block.y,
      bounds: blockBounds(block.height),
      primitives: [...blockPrimitives(block.meta, block.height), ...anchorPrimitives(block.meta)],
    });
  }
  // The walk column's hit-test usable rect (HitTest.updateUsableRect: the union of the hit boxes of blocks, groups and
  // connections) tints the below layer's background. This graph has no components, so the same rect is set by hand:
  // otherwise the below layer paints the outside colour. Read back from the walk column it is identical (median:
  // -20,-20 4480x3090; guarantee: -20,-20 41860x25970): the groups bound it, so no hit-box padding matters here.
  {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const extend = (x0: number, y0: number, x1: number, y1: number): void => {
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    };
    for (const block of scene.blocks) extend(block.x, block.y, block.x + block.width, block.y + block.height);
    for (const { rect } of scene.groups) extend(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    for (const connection of scene.connections) {
      for (const point of connection.points) extend(point.x, point.y, point.x, point.y);
    }
    graph.hitTest.$usableRect.value = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const layer = graph.addLayer(SceneCanvasLayer, {
    store,
    maxRun: options.maxRun,
    batches: batch ? [batch] : undefined,
  });
  graph.start();

  const target = dragTarget(scene);
  const byId = new Map(scene.blocks.map((block) => [block.id, block]));
  const touching = scene.connections.filter(
    (connection) => connection.sourceBlockId === target.id || connection.targetBlockId === target.id
  );
  const index = (anchorId: string): number => Number(anchorId.replace(/^.*_(in|out)/, ""));
  return {
    graph,
    drag(offset: number): void {
      const moved: TBenchBlock = { ...target, x: target.x + offset };
      store.update(target.id, { x: moved.x });
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
        const element = connectionElement(connectionGeometry(points, connection));
        if (batch) batch.update(connection.id, element);
        else store.update(connection.id, element);
      }
      layer.performRender();
    },
    visible(): { blocks: number; anchors: number; elements: number; batched?: number; chunks?: number } {
      const { elements, batchedPrimitives, chunks } = layer.stats;
      return { blocks: 0, anchors: 0, elements, ...(batch ? { batched: batchedPrimitives, chunks } : {}) };
    },
    timeQuery(rounds: number): TQueryTiming {
      // SceneStore.query() is the tile-index query followed by a sort; the index is private, so it is reached here to
      // time the two parts apart. Each part runs REPS times per round so that the 0.1 ms timer resolution matters less.
      const REPS = 5;
      const tiles = (store as unknown as { index: TileIndex<TSceneElement> }).index;
      const viewport = layer.getWorldViewport();
      const collect = (): TSceneElement[] => {
        const found: TSceneElement[] = [];
        tiles.query(viewport, (element) => {
          if (!element.hidden) found.push(element);
        });
        return found;
      };
      const parts = {
        indexQuery: [] as number[],
        sort: [] as number[],
        storeQuery: [] as number[],
        drawScene: [] as number[],
      };
      let elements = 0;
      for (let round = 0; round < rounds; round++) {
        let start = performance.now();
        for (let r = 0; r < REPS; r++) collect();
        parts.indexQuery.push((performance.now() - start) / REPS);
        const copies = Array.from({ length: REPS }, collect);
        start = performance.now();
        for (const copy of copies) copy.sort(compareSceneOrder);
        parts.sort.push((performance.now() - start) / REPS);
        start = performance.now();
        for (let r = 0; r < REPS; r++) elements = store.query(viewport).length;
        parts.storeQuery.push((performance.now() - start) / REPS);
        start = performance.now();
        layer.drawScene(viewport);
        parts.drawScene.push(performance.now() - start);
      }
      const median = (values: number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1];
      return {
        elements,
        indexQuery: median(parts.indexQuery),
        sort: median(parts.sort),
        storeQuery: median(parts.storeQuery),
        drawScene: median(parts.drawScene),
      };
    },
  };
}
