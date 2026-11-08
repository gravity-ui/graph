import type { TTileRect } from "../../../../lib/culling/TileIndex";
import { cache } from "../../../../lib/utils";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

/** World-space rectangle as `[minX, minY, maxX, maxY]`. */
export type TPathBounds = readonly [number, number, number, number];

export interface Path2DRenderInstance {
  getPath(): Path2D | undefined | null;
  /** World-space bounds of the item's path; a chunk with an item without valid bounds is never culled. */
  getPathBounds?(): TPathBounds | undefined;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  /**
   * Draws extra content, such as labels, after the item's chunk; runs for items whose bounds meet the renderer's
   * after-render rectangle.
   */
  afterRender?(ctx: CanvasRenderingContext2D): void;
  /**
   * Whether `afterRender` has anything to draw now, for example whether a label is shown. The renderer skips items
   * that return false and caches the answer until the item is added again or marked dirty (`markDirty`,
   * `markBoundsDirty`): an item whose answer changes marks itself. Items without it always run.
   */
  needsAfterRender?(): boolean;
  /**
   * Whether the item is in the viewport in this frame. The fallback that decides whether `afterRender` runs for an
   * item without valid `getPathBounds()`, or when the renderer has no after-render rectangle.
   */
  isInViewport?(): boolean;
  /** Semantic visibility, such as hidden items or missing geometry. Viewport culling is the renderer's job. */
  isPathVisible?(): boolean;
}

function isValidBounds(bounds: TPathBounds | undefined): bounds is TPathBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds[0]) &&
      Number.isFinite(bounds[1]) &&
      Number.isFinite(bounds[2]) &&
      Number.isFinite(bounds[3]) &&
      bounds[0] <= bounds[2] &&
      bounds[1] <= bounds[3]
  );
}

function intersects(bounds: TPathBounds | undefined, viewport: TTileRect | undefined): boolean {
  if (!viewport || !isValidBounds(bounds)) return true;
  return (
    bounds[0] <= viewport.maxX && bounds[2] >= viewport.minX && bounds[1] <= viewport.maxY && bounds[3] >= viewport.minY
  );
}

/**
 * Up to `chunkSize` items drawn with one fill or stroke. The combined path is rebuilt only when an
 * item is added, removed or changed; a chunk entirely outside the viewport is skipped.
 */
class Path2DChunk {
  protected items: Set<Path2DRenderInstance> = new Set();

  protected visibleItems = cache(() => {
    return Array.from(this.items).filter((item) => item.isPathVisible?.() ?? true);
  });

  /** Visible items with after-render content: the per-frame `afterRender` loop runs over these only. */
  protected decoratedItems = cache(() => {
    return this.visibleItems
      .get()
      .filter((item) => item.afterRender !== undefined && item.needsAfterRender?.() !== false);
  });

  /** Union of the visible items' bounds; undefined when any of them is unknown. */
  protected bounds = cache((): TPathBounds | undefined => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of this.visibleItems.get()) {
      const bounds = item.getPathBounds?.();
      if (!isValidBounds(bounds)) return undefined;
      minX = Math.min(minX, bounds[0]);
      minY = Math.min(minY, bounds[1]);
      maxX = Math.max(maxX, bounds[2]);
      maxY = Math.max(maxY, bounds[3]);
    }
    return [minX, minY, maxX, maxY];
  });

  protected path = cache(() => {
    const path = new Path2D();
    path.moveTo(0, 0);
    for (const item of this.visibleItems.get()) {
      const subPath = item.getPath();
      if (subPath) path.addPath(subPath);
    }
    return path;
  });

  public add(item: Path2DRenderInstance): void {
    this.items.add(item);
    this.reset();
  }

  public delete(item: Path2DRenderInstance): void {
    this.items.delete(item);
    this.reset();
  }

  public reset(): void {
    this.path.reset();
    this.visibleItems.reset();
    this.decoratedItems.reset();
    this.bounds.reset();
  }

  public resetBounds(): void {
    this.bounds.reset();
    this.decoratedItems.reset();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    viewport?: TTileRect,
    afterRenderViewport: TTileRect | null | undefined = viewport
  ): void {
    const visible = this.visibleItems.get();
    if (!visible.length || !intersects(this.bounds.get(), viewport)) return;

    ctx.save();
    // Style comes from the first visible item.
    const style = visible[0].style(ctx);
    if (style) {
      const path = this.path.get();
      if (style.type === "fill" || style.type === "both") ctx.fill(path, style.fillRule ?? "nonzero");
      if (style.type === "stroke" || style.type === "both") ctx.stroke(path);
    }
    ctx.restore();

    if (afterRenderViewport === null) return;
    // A drawn chunk can reach past the viewport: extra content runs only for items inside the after-render rectangle.
    // Comparing the item's bounds is cheaper than asking its component for the tree's decision.
    for (const item of this.decoratedItems.get()) {
      const bounds = afterRenderViewport ? item.getPathBounds?.() : undefined;
      if (isValidBounds(bounds) && afterRenderViewport) {
        if (!intersects(bounds, afterRenderViewport)) continue;
      } else if (item.isInViewport && !item.isInViewport()) {
        continue;
      }
      item.afterRender?.(ctx);
    }
  }

  public get size(): number {
    return this.items.size;
  }
}

class Path2DGroup {
  protected chunks: Path2DChunk[] = [];
  protected itemToChunk: Map<Path2DRenderInstance, Path2DChunk> = new Map();

  constructor(private chunkSize: number) {
    this.chunks.push(new Path2DChunk());
  }

  public add(item: Path2DRenderInstance): void {
    let lastChunk = this.chunks[this.chunks.length - 1];
    if (lastChunk.size >= this.chunkSize) {
      lastChunk = new Path2DChunk();
      this.chunks.push(lastChunk);
    }
    lastChunk.add(item);
    this.itemToChunk.set(item, lastChunk);
  }

  public delete(item: Path2DRenderInstance): void {
    const chunk = this.itemToChunk.get(item);
    if (!chunk) return;
    chunk.delete(item);
    this.itemToChunk.delete(item);
    if (chunk.size === 0 && this.chunks.length > 1) {
      const index = this.chunks.indexOf(chunk);
      if (index > -1) this.chunks.splice(index, 1);
    }
  }

  public reset(item: Path2DRenderInstance): void {
    this.itemToChunk.get(item)?.reset();
  }

  public resetBounds(item: Path2DRenderInstance): void {
    this.itemToChunk.get(item)?.resetBounds();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    viewport?: TTileRect,
    afterRenderViewport: TTileRect | null | undefined = viewport
  ): void {
    for (const chunk of this.chunks) chunk.render(ctx, viewport, afterRenderViewport);
  }
}

export class BatchPath2DRenderer {
  constructor(
    protected onChange: () => void,
    private chunkSize = 100
  ) {}

  protected indexes: Map<number, Map<string, Path2DGroup>> = new Map();

  protected itemParams: Map<Path2DRenderInstance, { zIndex: number; group: string }> = new Map();

  public orderedPaths = cache(() => {
    return Array.from(this.indexes.entries())
      .sort(([indexA], [indexB]) => indexA - indexB)
      .reduce<Path2DGroup[]>((acc, [_, items]) => {
        acc.push(...Array.from(items.values()));
        return acc;
      }, []);
  });

  protected requestRender = (): void => this.onChange?.();

  protected getGroup(zIndex: number, group: string): Path2DGroup {
    let index = this.indexes.get(zIndex);
    if (!index) {
      index = new Map();
      this.indexes.set(zIndex, index);
    }
    let bucket = index.get(group);
    if (!bucket) {
      bucket = new Path2DGroup(this.chunkSize);
      index.set(group, bucket);
    }
    return bucket;
  }

  /**
   * Draws every group in z-order. Chunks entirely outside the world-space `viewport` are skipped (undefined draws
   * every chunk). `afterRenderViewport` is the world-space rectangle that culls `afterRender` content by item
   * bounds; it defaults to `viewport`, `null` skips after-render content, and undefined leaves the decision to the
   * items' `isInViewport()`.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    viewport?: TTileRect,
    afterRenderViewport: TTileRect | null | undefined = viewport
  ): void {
    for (const group of this.orderedPaths.get()) group.render(ctx, viewport, afterRenderViewport);
  }

  public add(item: Path2DRenderInstance, params: { zIndex: number; group: string }): void {
    if (this.itemParams.has(item)) {
      this.update(item, params);
      return;
    }
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.add(item);
    this.itemParams.set(item, params);
    this.orderedPaths.reset();
    this.requestRender();
  }

  /** A zIndex or group change moves the item; otherwise only its chunk is rebuilt. */
  public update(item: Path2DRenderInstance, params: { zIndex: number; group: string }): void {
    const prev = this.itemParams.get(item);
    if (prev) {
      if (prev.zIndex === params.zIndex && prev.group === params.group) {
        this.markDirty(item);
        return;
      }
      this.delete(item);
    }
    this.add(item, params);
  }

  public delete(item: Path2DRenderInstance): void {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).delete(item);
    this.itemParams.delete(item);
    this.orderedPaths.reset();
    this.requestRender();
  }

  /** The item's path, bounds or semantic visibility changed. */
  public markDirty(item: Path2DRenderInstance): void {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).reset(item);
    this.requestRender();
  }

  /** Only the item's bounds changed, for example a label that grows with zoom; its path is kept. */
  public markBoundsDirty(item: Path2DRenderInstance): void {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).resetBounds(item);
  }
}
