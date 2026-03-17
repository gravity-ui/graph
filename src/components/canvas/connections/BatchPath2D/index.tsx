import { cache } from "../../../../lib/utils";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

export type TBBox = [minX: number, minY: number, maxX: number, maxY: number];

export interface Path2DRenderInstance {
  getPath(): Path2D | undefined | null;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  afterRender?(ctx: CanvasRenderingContext2D): void;
  isPathVisible?(): boolean;
  getBBox?(): TBBox | undefined;
}

function bboxIntersectionArea(a: TBBox, b: TBBox): number {
  const overlapX = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const overlapY = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return overlapX * overlapY;
}

function bboxArea(bbox: TBBox): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function mergeBBox(a: TBBox, b: TBBox): TBBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

class Path2DChunk {
  protected items: Set<Path2DRenderInstance> = new Set();

  public chunkBBox: TBBox | null = null;

  protected visibleItems = cache(() => {
    return Array.from(this.items).filter((item) => item.isPathVisible?.() ?? true);
  });

  protected path = cache(() => {
    const path = new Path2D();
    path.moveTo(0, 0);
    for (const item of this.visibleItems.get()) {
      const subPath = item.getPath();
      if (subPath) {
        path.addPath(subPath);
      }
    }
    return path;
  });

  protected applyStyles(ctx: CanvasRenderingContext2D) {
    const first = this.visibleItems.get()[0];
    return first?.style(ctx);
  }

  public add(item: Path2DRenderInstance) {
    this.items.add(item);
    this.expandBBox(item);
    this.reset();
  }

  public delete(item: Path2DRenderInstance) {
    this.items.delete(item);
    this.recalcBBox();
    this.reset();
  }

  public reset() {
    this.path.reset();
    this.visibleItems.reset();
  }

  public overlapScore(bbox: TBBox): number {
    if (!this.chunkBBox) return 0;
    const itemArea = bboxArea(bbox);
    if (itemArea === 0) return 0;
    return bboxIntersectionArea(this.chunkBBox, bbox) / itemArea;
  }

  protected expandBBox(item: Path2DRenderInstance) {
    const itemBBox = item.getBBox?.();
    if (!itemBBox) return;
    this.chunkBBox = this.chunkBBox ? mergeBBox(this.chunkBBox, itemBBox) : [...itemBBox];
  }

  public recalcBBox() {
    this.chunkBBox = null;
    for (const item of this.items) {
      this.expandBBox(item);
    }
  }

  public render(ctx: CanvasRenderingContext2D, isVisible?: (bbox: TBBox) => boolean) {
    if (isVisible && this.chunkBBox && !isVisible(this.chunkBBox)) {
      return false;
    }

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
    return true;
  }

  public get size() {
    return this.items.size;
  }
}

const REASSIGN_OVERLAP_THRESHOLD = 0.1;

class Path2DGroup {
  protected chunks: Path2DChunk[] = [];
  protected itemToChunk: Map<Path2DRenderInstance, Path2DChunk> = new Map();

  constructor(private chunkSize: number) {}

  protected findBestChunk(itemBBox: TBBox): Path2DChunk | null {
    let bestChunk: Path2DChunk | null = null;
    let bestScore = 0;

    for (const chunk of this.chunks) {
      if (chunk.size >= this.chunkSize) continue;
      const score = chunk.overlapScore(itemBBox);
      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    return bestChunk;
  }

  protected getOrCreateChunk(item: Path2DRenderInstance): Path2DChunk {
    const itemBBox = item.getBBox?.();

    if (itemBBox) {
      const best = this.findBestChunk(itemBBox);
      if (best) return best;
    }

    const lastChunk = this.chunks[this.chunks.length - 1];
    if (lastChunk && lastChunk.size < this.chunkSize) {
      return lastChunk;
    }

    const newChunk = new Path2DChunk();
    this.chunks.push(newChunk);
    return newChunk;
  }

  public add(item: Path2DRenderInstance) {
    const chunk = this.getOrCreateChunk(item);
    chunk.add(item);
    this.itemToChunk.set(item, chunk);
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
    if (!chunk) return;

    const itemBBox = item.getBBox?.();
    if (itemBBox && chunk.size > 1) {
      const currentScore = chunk.overlapScore(itemBBox);
      if (currentScore < REASSIGN_OVERLAP_THRESHOLD) {
        chunk.delete(item);
        this.itemToChunk.delete(item);
        if (chunk.size === 0 && this.chunks.length > 1) {
          const index = this.chunks.indexOf(chunk);
          if (index > -1) {
            this.chunks.splice(index, 1);
          }
        }
        this.add(item);
        return;
      }
    }

    chunk.reset();
  }

  public render(ctx: CanvasRenderingContext2D, isVisible?: (bbox: TBBox) => boolean) {
    console.groupCollapsed("bath chunks render");
    console.info(
      "count",
      this.chunks.length,
      "/",
      this.chunks.reduce((acc, item) => acc + item.size, 0)
    );
    let count = 0;
    for (const chunk of this.chunks) {
      count += chunk.render(ctx, isVisible) ? 1 : 0;
    }
    if (this.chunks.length !== count) {
      console.warn("render only", count, "chunks", "diff", this.chunks.length - count);
    }
    console.groupEnd();
  }

  public get size() {
    return this.chunks.reduce((acc, item) => acc + item.size, 0);
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
      .sort(([indexA], [indexB]) => indexA - indexB)
      .reduce((acc, [_, items]) => {
        acc.push(...Array.from(items.values()));
        return acc;
      }, [] satisfies Path2DGroup[]);
  });

  protected requestRender = () => this.onChange?.();

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
    if (this.itemParams.has(item)) {
      const prev = this.itemParams.get(item);
      /**
       * Reasons to update path2d is different
       * 1. zIndex changed
       * 2. group changed
       * 3. item changes geometry
       *
       * So is item change zIndex or group, we need recalculate groups
       * But if item change geomertry we have ot only mark item as dirty to recalc groups path2d
       * */
      if (prev.zIndex === params.zIndex && prev.group === params.group) {
        this.markDirty(item);
        return;
      }
      this.delete(item);
    }
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
