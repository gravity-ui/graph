import { BatchScene } from "../batch/BatchScene";
import type { IBatchBackend, IBatchItem, TPathBounds } from "../batch/types";
import type { TTileRect } from "../culling/TileIndex";

import { appendPolygon, appendSegments, applyStroke, strokeKey } from "./drawPrimitives";
import type { TSceneElement, TSceneStroke } from "./types";

/** What the batch needs from an element: its origin, bounds and primitives. */
export type TScenePathBatchInput = Pick<TSceneElement, "id" | "x" | "y" | "bounds" | "primitives">;

export type TScenePathBatchOptions = {
  zIndex: number;
  /** Edge of a chunk cell in world units. Default: 8192. */
  cellSize?: number;
  /** Most items in one chunk. Default: 200. */
  chunkSize?: number;
};

const DEFAULT_CELL_SIZE = 8192;
const DEFAULT_CHUNK_SIZE = 200;

/** One path or polygon primitive of an element, placed in world space. */
class PathBatchItem implements IBatchItem {
  public readonly group: string;

  public readonly kind: "path" | "polygon";

  public readonly stroke: TSceneStroke | undefined;

  public readonly fill: string | undefined;

  private readonly bounds: TPathBounds;

  private path: Path2D | undefined = undefined;

  constructor(
    input: TScenePathBatchInput,
    private readonly source: { kind: "path"; segments: Float32Array } | { kind: "polygon"; points: Float32Array },
    stroke: TSceneStroke | undefined,
    fill: string | undefined,
    private readonly ox: number,
    private readonly oy: number
  ) {
    this.kind = source.kind;
    this.stroke = stroke;
    this.fill = fill;
    this.group = `${source.kind}|${strokeKey(stroke)}|${fill ?? ""}`;
    this.bounds = [
      input.bounds.minX + input.x,
      input.bounds.minY + input.y,
      input.bounds.maxX + input.x,
      input.bounds.maxY + input.y,
    ];
  }

  public getPathBounds(): TPathBounds {
    return this.bounds;
  }

  /** The item's own path at its offset, built on first use. */
  public getPath(): Path2D {
    if (!this.path) {
      const path = new Path2D();
      if (this.source.kind === "path") appendSegments(path, this.source.segments, this.ox, this.oy);
      else appendPolygon(path, this.source.points, this.ox, this.oy);
      this.path = path;
    }
    return this.path;
  }
}

/**
 * Research prototype (E2b). Caches the paths and polygons of scene elements per grid cell, the way
 * `BatchPath2DRenderer` caches connections: every path or polygon primitive is one `BatchScene` item, a chunk of items
 * of one style is one combined `Path2D`, and a camera move rebuilds nothing.
 */
export class ScenePathBatch {
  public readonly zIndex: number;

  private readonly scene: BatchScene<PathBatchItem, Path2D, CanvasRenderingContext2D>;

  private readonly elements = new Map<string, { input: TScenePathBatchInput; items: PathBatchItem[] }>();

  private drawnPrimitives = 0;

  private drawnChunks = 0;

  constructor(options: TScenePathBatchOptions) {
    this.zIndex = options.zIndex;
    const backend: IBatchBackend<PathBatchItem, Path2D, CanvasRenderingContext2D> = {
      build: (items): Path2D => {
        const path = new Path2D();
        for (const item of items) path.addPath(item.getPath());
        return path;
      },
      draw: (ctx, path, items): void => {
        // Items of one group share a style; it comes from the chunk's first item.
        const first = items[0];
        ctx.save();
        if (first.kind === "polygon") {
          if (first.fill) {
            ctx.fillStyle = first.fill;
            ctx.fill(path);
          }
        }
        if (first.stroke) {
          applyStroke(ctx, first.stroke);
          ctx.stroke(path);
        }
        ctx.restore();
        this.drawnChunks++;
        this.drawnPrimitives += items.length;
      },
    };
    this.scene = new BatchScene(backend, {
      cellSize: options.cellSize ?? DEFAULT_CELL_SIZE,
      chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    });
  }

  /** Number of elements. */
  public get size(): number {
    return this.elements.size;
  }

  public add(input: TScenePathBatchInput): void {
    if (this.elements.has(input.id)) throw new Error(`ScenePathBatch: duplicate element id "${input.id}"`);
    this.insert(input, this.buildItems(input));
  }

  private buildItems(input: TScenePathBatchInput): PathBatchItem[] {
    const items: PathBatchItem[] = [];
    for (const primitive of input.primitives) {
      if (primitive.minScale !== undefined || primitive.maxScale !== undefined) {
        throw new Error(`ScenePathBatch: element "${input.id}" has a primitive with minScale/maxScale`);
      }
      if (primitive.kind === "path") {
        items.push(new PathBatchItem(input, primitive, primitive.stroke, undefined, input.x, input.y));
      } else if (primitive.kind === "polygon") {
        items.push(new PathBatchItem(input, primitive, primitive.stroke, primitive.fill, input.x, input.y));
      } else {
        throw new Error(`ScenePathBatch: element "${input.id}" has a "${primitive.kind}" primitive`);
      }
    }
    return items;
  }

  private insert(input: TScenePathBatchInput, items: PathBatchItem[]): void {
    for (const item of items) this.scene.add(item, { zIndex: this.zIndex, group: item.group });
    this.elements.set(input.id, { input, items });
  }

  /** Replaces the element: deletes its items and adds new ones, so only the chunks it touches are rebuilt. */
  public update(id: string, patch: Partial<Pick<TSceneElement, "x" | "y" | "bounds" | "primitives">>): void {
    const element = this.elements.get(id);
    if (!element) throw new Error(`ScenePathBatch: unknown element id "${id}"`);
    const next: TScenePathBatchInput = { ...element.input, ...patch };
    // Validate and build first: a rejected patch leaves the old element in place.
    const items = this.buildItems(next);
    this.delete(id);
    this.insert(next, items);
  }

  public delete(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    for (const item of element.items) this.scene.delete(item);
    this.elements.delete(id);
  }

  /** Draws the chunks that meet the viewport; returns how many primitives and chunks this frame drew. */
  public render(ctx: CanvasRenderingContext2D, viewport: TTileRect): { primitives: number; chunks: number } {
    this.drawnPrimitives = 0;
    this.drawnChunks = 0;
    this.scene.render(ctx, viewport);
    return { primitives: this.drawnPrimitives, chunks: this.drawnChunks };
  }
}
