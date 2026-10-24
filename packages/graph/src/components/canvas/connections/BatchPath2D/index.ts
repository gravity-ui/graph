import type { TTileRect } from "../../../../lib/TileIndex";
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
  /** Runs for every visible item of a drawn chunk; items that draw extra content cull it themselves. */
  afterRender?(ctx: CanvasRenderingContext2D): void;
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

  public add(item: Path2DRenderInstance) {
    this.items.add(item);
    this.reset();
  }

  public delete(item: Path2DRenderInstance) {
    this.items.delete(item);
    this.reset();
  }

  public reset() {
    this.path.reset();
    this.visibleItems.reset();
    this.bounds.reset();
  }

  public resetBounds() {
    this.bounds.reset();
  }

  public render(ctx: CanvasRenderingContext2D, viewport?: TTileRect) {
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

    for (const item of visible) item.afterRender?.(ctx);
  }

  public get size() {
    return this.items.size;
  }
}

class Path2DGroup {
  protected chunks: Path2DChunk[] = [];
  protected itemToChunk: Map<Path2DRenderInstance, Path2DChunk> = new Map();

  constructor(private chunkSize: number) {
    this.chunks.push(new Path2DChunk());
  }

  public add(item: Path2DRenderInstance) {
    let lastChunk = this.chunks[this.chunks.length - 1];
    if (lastChunk.size >= this.chunkSize) {
      lastChunk = new Path2DChunk();
      this.chunks.push(lastChunk);
    }
    lastChunk.add(item);
    this.itemToChunk.set(item, lastChunk);
  }

  public delete(item: Path2DRenderInstance) {
    const chunk = this.itemToChunk.get(item);
    if (!chunk) return;
    chunk.delete(item);
    this.itemToChunk.delete(item);
    if (chunk.size === 0 && this.chunks.length > 1) {
      const index = this.chunks.indexOf(chunk);
      if (index > -1) this.chunks.splice(index, 1);
    }
  }

  public reset(item: Path2DRenderInstance) {
    this.itemToChunk.get(item)?.reset();
  }

  public resetBounds(item: Path2DRenderInstance) {
    this.itemToChunk.get(item)?.resetBounds();
  }

  public render(ctx: CanvasRenderingContext2D, viewport?: TTileRect) {
    for (const chunk of this.chunks) chunk.render(ctx, viewport);
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

  protected requestRender = () => this.onChange?.();

  protected getGroup(zIndex: number, group: string) {
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

  /** Draws every group in z-order; chunks entirely outside the world-space viewport are skipped. */
  public render(ctx: CanvasRenderingContext2D, viewport?: TTileRect) {
    for (const group of this.orderedPaths.get()) group.render(ctx, viewport);
  }

  public add(item: Path2DRenderInstance, params: { zIndex: number; group: string }) {
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
  public update(item: Path2DRenderInstance, params: { zIndex: number; group: string }) {
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

  public delete(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).delete(item);
    this.itemParams.delete(item);
    this.orderedPaths.reset();
    this.requestRender();
  }

  /** The item's path, bounds or semantic visibility changed. */
  public markDirty(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).reset(item);
    this.requestRender();
  }

  /** Only the item's bounds changed, for example a label that grows with zoom; its path is kept. */
  public markBoundsDirty(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (!params) return;
    this.getGroup(params.zIndex, params.group).resetBounds(item);
  }
}
