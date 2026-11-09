import { Layer } from "../../services/Layer";
import type { LayerProps } from "../../services/Layer";
import type { TTileRect } from "../culling/TileIndex";

import type { ScenePathBatch } from "./ScenePathBatch";
import type { SceneStore } from "./SceneStore";
import { drawElements } from "./drawPrimitives";

export type TSceneCanvasLayerProps = LayerProps & {
  store: SceneStore;
  /** Passed to drawElements(): ends a path run after this many paths and polygons; unbounded by default. */
  maxRun?: number;
  /** Cached path batches, each drawn after the store elements whose zIndex is not above its own. */
  batches?: readonly ScenePathBatch[];
};

/** Research prototype (E2): draws a SceneStore on its canvas with Canvas2D, without walking components. */
export class SceneCanvasLayer extends Layer<TSceneCanvasLayerProps> {
  /** What the last frame drew. */
  public readonly stats = { elements: 0, primitives: 0, batchedPrimitives: 0, chunks: 0 };

  constructor(props: TSceneCanvasLayerProps) {
    super({
      ...props,
      canvas: { zIndex: 2, respectPixelRatio: true, transformByCameraPosition: true, ...props.canvas },
    });
  }

  /** The world rectangle the camera shows; screen = world × scale + camera offset. */
  public getWorldViewport(): TTileRect {
    const { x, y, width, height, scale } = this.props.graph.cameraService.getCameraState();
    return { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
  }

  public drawScene(viewport: TTileRect = this.getWorldViewport()): void {
    const ctx = this.context.ctx;
    if (!ctx) return;
    const elements = this.props.store.query(viewport);
    const scale = this.props.graph.cameraService.getCameraScale();
    const { maxRun, batches } = this.props;
    this.stats.elements = elements.length;
    if (!batches || batches.length === 0) {
      this.stats.primitives = drawElements(ctx, elements, scale, { maxRun });
      this.stats.batchedPrimitives = 0;
      this.stats.chunks = 0;
      return;
    }
    let primitives = 0;
    let batchedPrimitives = 0;
    let chunks = 0;
    let next = 0;
    for (const batch of [...batches].sort((a, b) => a.zIndex - b.zIndex)) {
      let end = next;
      while (end < elements.length && elements[end].zIndex <= batch.zIndex) end++;
      if (end > next) primitives += drawElements(ctx, elements.slice(next, end), scale, { maxRun });
      next = end;
      const drawn = batch.render(ctx, viewport);
      batchedPrimitives += drawn.primitives;
      chunks += drawn.chunks;
    }
    if (next < elements.length) primitives += drawElements(ctx, elements.slice(next), scale, { maxRun });
    this.stats.primitives = primitives + batchedPrimitives;
    this.stats.batchedPrimitives = batchedPrimitives;
    this.stats.chunks = chunks;
  }

  protected render(): void {
    super.render();
    this.drawScene();
  }
}
