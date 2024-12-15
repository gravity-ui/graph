import { cache } from "../../../../lib/utils";

export type Path2DRenderStyleResult =
  | { type: "stroke" }
  | { type: "fill"; fillRule?: CanvasFillRule }
  | { type: "both"; fillRule?: CanvasFillRule };

export interface Path2DRenderInstance {
  getPath(): Path2D | undefined | null;
  style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
  afterRender?(ctx: CanvasRenderingContext2D): void;
}

class Path2DGroup {
  protected items: Set<Path2DRenderInstance> = new Set();

  protected path = cache(() => {
    const path = new Path2D();
    path.moveTo(0, 0);
    return Array.from(this.items).reduce((path, item) => {
      const subPath = item.getPath();
      if (subPath) {
        path.addPath(subPath);
      }
      return path;
    }, path);
  });

  protected applyStyles(ctx) {
    const val = Array.from(this.items)[0];
    return val.style(ctx);
  }

  public add(item: Path2DRenderInstance) {
    this.items.add(item);
    this.path.reset();
  }

  public delete(item) {
    this.items.delete(item);
    this.path.reset();
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (this.items.size) {
      ctx.save();

      const result = this.applyStyles(ctx);
      if (result) {
        switch (result.type) {
          case "fill": {
            ctx.fill(this.path.get(), result.fillRule);
            break;
          }
          case "stroke": {
            ctx.stroke(this.path.get());
            break;
          }
          case "both": {
            ctx.fill(this.path.get(), result.fillRule);
            ctx.stroke(this.path.get());
          }
        }
      }
      ctx.restore();
      for (const item of this.items) {
        item.afterRender?.(ctx);
      }
    }
  }
}

export class BatchPath2DRenderer {
  constructor(protected onChange: () => void) {}

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

  protected getGroup(zIndex: number, group: string) {
    if (!this.indexes.has(zIndex)) {
      this.indexes.set(zIndex, new Map());
    }
    const index = this.indexes.get(zIndex);

    if (!index.has(group)) {
      index.set(group, new Path2DGroup());
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
    this.onChange?.();
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
    this.onChange?.();
  }
}
