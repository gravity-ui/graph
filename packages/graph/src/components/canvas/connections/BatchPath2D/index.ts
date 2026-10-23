import { cache } from "../../../../lib/utils";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

export interface Path2DRenderInstance {
  /** Cached until update/markDirty; viewport changes only refresh visibility. */
  getPath(): Path2D | undefined | null;
  /** World-space locality hint only; visibility is always decided by isPathVisible. */
  getPathBounds?(): readonly [number, number, number, number] | undefined;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  afterRender?(ctx: CanvasRenderingContext2D): void;
  isPathVisible?(): boolean;
}

interface PathRecord {
  item: Path2DRenderInstance;
  path?: Path2D;
  ready: boolean;
  visible: boolean;
  cell?: SpatialPath;
}

class SpatialPath {
  public records = new Set<PathRecord>();
  public path = cache(() => {
    let path: Path2D | undefined;
    for (const record of this.records) {
      if (record.visible && record.path) {
        path ??= new Path2D();
        path.addPath(record.path);
      }
    }
    return path;
  });
}

function getCenter(item: Path2DRenderInstance): [number, number] | undefined {
  const bounds = item.getPathBounds?.();
  if (!bounds || !bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3]) return undefined;
  return [bounds[0] / 2 + bounds[2] / 2, bounds[1] / 2 + bounds[3] / 2];
}

class Path2DChunk {
  protected items = new Map<Path2DRenderInstance, PathRecord>();
  private spatial = false;
  private pathBuilt = false;
  private cells?: Map<number, SpatialPath>;
  private extent = [0, 0, 0, 0];

  protected visibleItems = cache(() => {
    const visible: PathRecord[] = [];
    for (const record of this.items.values()) {
      const next = record.item.isPathVisible?.() ?? true;
      if (record.visible !== next) record.cell?.path.reset();
      record.visible = next;
      if (record.visible) visible.push(record);
    }
    return visible;
  });

  protected path = cache(() => {
    const visible = this.visibleItems.get();
    // Run custom hooks in registration order, copying mutable paths immediately.
    for (const record of visible) {
      if (!record.ready) {
        const source = record.item.getPath();
        record.path = source ? new Path2D(source) : undefined;
        record.ready = true;
        if (this.cells) this.place(record, getCenter(record.item), this.cells);
      }
    }
    const path = new Path2D();
    path.moveTo(0, 0);
    if (this.spatial) {
      const cells = this.cells ?? this.partition();
      for (const cell of cells.values()) {
        const subPath = cell.path.get();
        if (subPath) path.addPath(subPath);
      }
    } else {
      for (const record of visible) {
        if (record.path) path.addPath(record.path);
      }
    }
    this.pathBuilt = true;
    return path;
  });

  private partition() {
    const centers = Array.from(this.items.values(), ({ item }) => getCenter(item));
    const extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const center of centers) {
      if (!center) continue;
      extent[0] = Math.min(extent[0], center[0]);
      extent[1] = Math.min(extent[1], center[1]);
      extent[2] = Math.max(extent[2], center[0]);
      extent[3] = Math.max(extent[3], center[1]);
    }
    this.extent = extent;
    const cells = new Map<number, SpatialPath>();
    this.cells = cells;
    let index = 0;
    for (const record of this.items.values()) this.place(record, centers[index++], cells);
    return cells;
  }

  private place(record: PathRecord, center: [number, number] | undefined, cells: Map<number, SpatialPath>) {
    let key = -1;
    if (center) {
      const coordinate = (axis: number) => {
        // Halving first avoids overflow for valid, very large world coordinates.
        const min = this.extent[axis] / 2;
        const span = this.extent[axis + 2] / 2 - min;
        return span > 0 ? Math.max(0, Math.min(3, Math.floor(((center[axis] / 2 - min) / span) * 4))) : 0;
      };
      key = coordinate(0) + 4 * coordinate(1);
    }
    let cell = cells.get(key);
    if (!cell) {
      cell = new SpatialPath();
      cells.set(key, cell);
    }
    if (record.cell !== cell) {
      record.cell?.records.delete(record);
      record.cell?.path.reset();
      cell.records.add(record);
      cell.path.reset();
      record.cell = cell;
    }
  }

  private resetMembership() {
    if (this.cells) {
      this.cells = undefined;
      for (const record of this.items.values()) record.cell = undefined;
    }
    this.reset();
  }

  public add(item: Path2DRenderInstance) {
    this.items.set(item, { item, ready: false, visible: false });
    this.resetMembership();
  }

  public delete(item: Path2DRenderInstance) {
    this.items.delete(item);
    this.resetMembership();
  }

  public resetItem(item: Path2DRenderInstance, geometry: boolean) {
    const record = this.items.get(item);
    if (!record) return;
    if (geometry) {
      record.ready = false;
      record.path = undefined;
    } else if (this.pathBuilt && this.items.size > 16) {
      // Full overview stays flat; spatial caches pay for themselves on viewport changes.
      this.spatial = true;
    }
    record.cell?.path.reset();
    this.reset();
  }

  private reset() {
    this.path.reset();
    this.visibleItems.reset();
  }

  public render(ctx: CanvasRenderingContext2D) {
    const vis = this.visibleItems.get();
    if (!vis.length) return;

    ctx.save();
    const style = vis[0].item.style(ctx);
    if (style) {
      const p = this.path.get();
      if (style.type === "fill" || style.type === "both") {
        ctx.fill(p, style.fillRule ?? "nonzero");
      }
      if (style.type === "stroke" || style.type === "both") {
        ctx.stroke(p);
      }
    }
    ctx.restore();

    for (const record of vis) {
      record.item.afterRender?.(ctx);
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

  public resetItem(item: Path2DRenderInstance, geometry: boolean) {
    const chunk = this.itemToChunk.get(item);
    chunk?.resetItem(item, geometry);
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

  public update(item: Path2DRenderInstance, params: { zIndex: number; group: string }) {
    const prev = this.itemParams.get(item);
    if (prev) {
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
    const params = this.itemParams.get(item);
    if (!params) {
      return;
    }
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.delete(item);
    this.itemParams.delete(item);
    this.orderedPaths.reset();
    this.requestRender();
  }

  public markDirty(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (params) {
      this.getGroup(params.zIndex, params.group).resetItem(item, true);
      this.requestRender();
    }
  }

  /** Visibility is finalized during the current traversal, before this batch draws. */
  public invalidateVisibility(item: Path2DRenderInstance) {
    const params = this.itemParams.get(item);
    if (params) {
      const group = this.getGroup(params.zIndex, params.group);
      group.resetItem(item, false);
    }
  }
}
