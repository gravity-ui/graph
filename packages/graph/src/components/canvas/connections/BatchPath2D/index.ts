import { BatchScene } from "../../../../lib/batch/BatchScene";
import { boundsIntersect } from "../../../../lib/batch/bounds";
import type { IBatchBackend, IBatchItem } from "../../../../lib/batch/types";

export type { TPathBounds } from "../../../../lib/batch/types";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

export interface Path2DRenderInstance extends IBatchItem {
  getPath(): Path2D | undefined | null;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  /** Draws extra content after the item's chunk; runs only for items in the viewport. */
  afterRender?(ctx: CanvasRenderingContext2D): void;
  /**
   * Whether the item is in the viewport in this frame, which decides whether `afterRender` runs.
   * Components report their tree's decision; without it the renderer checks `getPathBounds()`.
   */
  isInViewport?(): boolean;
}

/** Cell edge when the owner passes none: the default `VISIBILITY_TILE_SIZE × PATH2D_CHUNK_TILES`. */
export const DEFAULT_BATCH_CELL_SIZE = 8192;

/** A chunk's combined path and the items whose `afterRender` follows it. */
export type TPath2DChunk = {
  path: Path2D;
  afterRender: Path2DRenderInstance[];
};

const path2DBackend: IBatchBackend<Path2DRenderInstance, TPath2DChunk, CanvasRenderingContext2D> = {
  build(items: readonly Path2DRenderInstance[]): TPath2DChunk {
    const path = new Path2D();
    path.moveTo(0, 0);
    const afterRender: Path2DRenderInstance[] = [];
    for (const item of items) {
      const subPath = item.getPath();
      if (subPath) path.addPath(subPath);
      if (item.afterRender) afterRender.push(item);
    }
    return { path, afterRender };
  },
  draw(ctx, chunk, items, viewport): void {
    ctx.save();
    // Items of one group share a style; it comes from the first visible item.
    const style = items[0].style(ctx);
    if (style) {
      if (style.type === "fill" || style.type === "both") ctx.fill(chunk.path, style.fillRule ?? "nonzero");
      if (style.type === "stroke" || style.type === "both") ctx.stroke(chunk.path);
    }
    ctx.restore();

    // A drawn chunk can reach past the viewport: extra content runs only for items inside it.
    for (const item of chunk.afterRender) {
      if (item.isInViewport ? item.isInViewport() : boundsIntersect(item.getPathBounds?.(), viewport)) {
        item.afterRender?.(ctx);
      }
    }
  },
};

/**
 * Draws items with one fill or stroke per chunk: items are grouped by z-level, style group and the grid cell of
 * their bounds' top-left corner, up to `chunkSize` per chunk. A chunk's path is rebuilt only when one of its items is
 * added, removed, moved to another cell or marked dirty; camera moves never rebuild it, and chunks outside the
 * viewport are skipped.
 */
export class BatchPath2DRenderer extends BatchScene<Path2DRenderInstance, TPath2DChunk, CanvasRenderingContext2D> {
  constructor(onChange: () => void, chunkSize = 200, cellSize = DEFAULT_BATCH_CELL_SIZE) {
    super(path2DBackend, { onChange, chunkSize, cellSize });
  }
}
