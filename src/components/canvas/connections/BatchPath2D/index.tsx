import { ESchedulerPriority } from "../../../../lib";
import { cache } from "../../../../lib/utils";
import { debounce } from "../../../../utils/functions";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

export interface Path2DRenderInstance {
  getPath(): Path2D | undefined | null;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  afterRender?(ctx: CanvasRenderingContext2D): void;
  isPathVisible?(): boolean;
}

class Path2DChunk {
  protected items: Set<Path2DRenderInstance> = new Set();

  protected visibleItems = cache(() => {
    return Array.from(this.items).filter((item) => item.isPathVisible?.() ?? true);
  });

  protected path = cache(() => {
    const path = new Path2D();
    path.moveTo(0, 0);
    // Use already filtered visibleItems - no need for additional visibility checks
    for (const item of this.visibleItems.get()) {
      const subPath = item.getPath();
      if (subPath) {
        path.addPath(subPath);
      }
    }
    return path;
  });

  protected applyStyles(ctx: CanvasRenderingContext2D) {
    // Style comes from first visible item
    const first = this.visibleItems.get()[0];
    return first?.style(ctx);
  }

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
  }

  public render(ctx: CanvasRenderingContext2D) {
    const vis = this.visibleItems.get();
    if (!vis.length) return;

    ctx.save();
    const style = this.applyStyles(ctx);
    if (style) {
      const p = this.path.get();
      if (style.type === "fill" || style.type === "both") {
        ctx.fill(p, style.fillRule);
      }
      if (style.type === "stroke" || style.type === "both") {
        ctx.stroke(p);
      }
    }
    ctx.restore();

    for (const item of vis) {
      item.afterRender?.(ctx);
    }
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
    if (chunk) {
      chunk.delete(item);
      this.itemToChunk.delete(item);
      if (chunk.size === 0 && this.chunks.length > 1) {
        const index = this.chunks.indexOf(chunk);
        if (index > -1) {
          this.chunks.splice(index, 1);
        }
      }
    }
  }

  public resetItem(item: Path2DRenderInstance) {
    const chunk = this.itemToChunk.get(item);
    chunk?.reset();
  }

  public render(ctx: CanvasRenderingContext2D) {
    for (const chunk of this.chunks) {
      chunk.render(ctx);
    }
  }
}

export class BatchPath2DRenderer {
  constructor(
    protected onChange: () => void,
    private chunkSize: number = 100
  ) {}

  protected indexes: Map<number, Map<string, Path2DGroup>> = new Map();

  protected itemParams: Map<Path2DRenderInstance, { zIndex: number; group: string }> = new Map();

  public orderedPaths = cache(() => {
    return Array.from(this.indexes.entries())
      .sort(([indexA], [indexB]) => indexB - indexA)
      .reduce((acc, [_, items]) => {
        acc.push(...Array.from(items.values()));
        return acc;
      }, [] satisfies Path2DGroup[]);
  });

  protected requestRender = () => {
    this.onChange?.();
  }; /* debounce(
    () => {
      this.onChange?.();
    },
    {
      priority: ESchedulerPriority.HIGHEST,
    }
  ); */

  protected getGroup(zIndex: number, group: string) {
    if (!this.indexes.has(zIndex)) {
      this.indexes.set(zIndex, new Map());
    }
    const index = this.indexes.get(zIndex);

    if (!index.has(group)) {
      index.set(group, new Path2DGroup(this.chunkSize));
    }

    return index.get(group);
  }

  public add(item: Path2DRenderInstance, params: { zIndex: number; group: string }) {
    if (this.itemParams.has(item)) {
      this.update(item, params);
    }
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.add(item);
    this.itemParams.set(item, params);
    this.orderedPaths.reset();
    this.requestRender();
  }

  public update(item: Path2DRenderInstance, params: { zIndex: number; group: string }) {
    this.delete(item);
    this.add(item, params);
  }

  public delete(item: Path2DRenderInstance) {
    if (!this.itemParams.has(item)) {
      return;
    }
    const params = this.itemParams.get(item);
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.delete(item);
    this.itemParams.delete(item);
    this.orderedPaths.reset();
    this.requestRender();
  }

  public markDirty(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (params) {
      const group = this.getGroup(params.zIndex, params.group);
      group.resetItem(item);
      this.requestRender();
    }
  }
}
