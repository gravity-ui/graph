// E3: the same scene drawn by a SceneRendererLayer with the lazily loaded WebGL backend. Same store as the
// interpreter column, but with the default z buckets: groups 50, connections 100, blocks and anchors 200.
import { Graph } from "GRAPH";
import type { TSceneBackendStats } from "GRAPH_SRC/lib/scene/renderer/backendTypes";

import { connectionElement, connectionGeometry } from "./interpreter";
import { anchorPrimitives, blockBounds, blockPrimitives, groupPrimitives } from "./look";
import { routePoints } from "./scenes";
import type { TBenchBlock, TBenchScene } from "./scenes";
import { dragTarget } from "./walk";
import type { TColumn } from "./walk";

export type TWebGLStats = TSceneBackendStats & { state: string };

let activeGraph: Graph | undefined;

/** Stats of the backend of the last webgl column. */
export function webglStats(): TWebGLStats | undefined {
  const backend = activeGraph?.scene.layer.getBackend();
  return backend && activeGraph ? { ...backend.stats, state: activeGraph.scene.$renderer.value } : undefined;
}

export async function setupWebGL(
  root: HTMLDivElement,
  scene: TBenchScene,
  options: { blockOpacity?: number } = {}
): Promise<TColumn> {
  const graph = new Graph(
    { settings: { canDragCamera: true, canZoomCamera: true } } as unknown as ConstructorParameters<typeof Graph>[0],
    root
  );
  const { store } = graph.scene;
  for (const group of scene.groups) {
    const { x, y, width, height } = group.rect;
    store.add({
      id: group.id,
      zIndex: 50,
      x,
      y,
      bounds: { minX: -1, minY: -1, maxX: width + 1, maxY: height + 1 },
      primitives: groupPrimitives(width, height),
    });
  }
  for (const connection of scene.connections) {
    const element = connectionElement(connectionGeometry(connection.points, connection));
    store.add({ id: connection.id, zIndex: 100, x: 0, y: 0, ...element });
  }
  for (const block of scene.blocks) {
    store.add({
      id: block.id,
      zIndex: 200,
      x: block.x,
      y: block.y,
      bounds: blockBounds(block.height),
      primitives: [...blockPrimitives(block.meta, block.height), ...anchorPrimitives(block.meta)],
    });
  }
  if (options.blockOpacity !== undefined) {
    // Every block faded: its primitives move into the translucent pass, drawn in scene order.
    const faded = store.defineStyle({ opacity: options.blockOpacity });
    for (const block of scene.blocks) store.setStyle(block.id, faded);
  }
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
  const graphScene = graph.scene;
  activeGraph = graph;
  graph.updateSettings({ renderer: "webgl" });
  graph.start();
  // "loading" -> "webgl" (or "webgl-fallback", which makes this column meaningless).
  const deadline = performance.now() + 30000;
  while (graphScene.$renderer.value !== "webgl") {
    if (graphScene.$renderer.value === "webgl-fallback")
      throw new Error("webgl column: renderer state is webgl-fallback");
    if (performance.now() > deadline)
      throw new Error(`webgl column: state is "${graphScene.$renderer.value}" after 30 s`);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }

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
        store.update(connection.id, connectionElement(connectionGeometry(points, connection)));
      }
      graphScene.layer.performRender();
    },
    visible(): { blocks: number; anchors: number; elements: number } {
      // Scene elements in the view (as the interpreter column's `elements`); GPU instances are on the webgl line.
      const { x, y, width, height, scale } = graph.cameraService.getCameraState();
      const viewport = { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
      return { blocks: 0, anchors: 0, elements: store.query(viewport).length };
    },
  };
}
