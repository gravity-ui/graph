import type { TTileRect } from "../culling/TileIndex";
import { cellKey, toTile } from "../culling/grid";
import { cache } from "../utils";

import { boundsIntersect, isValidBounds } from "./bounds";
import type { IBatchBackend, IBatchItem, TBatchParams, TBatchSceneOptions, TPathBounds } from "./types";

/** Bucket of items without valid bounds. Cell keys are never negative, so it is drawn first. */
const UNBOUNDED = -1;

/** Items drawn together: up to `chunkSize` items of one cell, or of the unbounded bucket. */
class BatchChunk<TItem extends IBatchItem, TResource> {
  public readonly items = new Set<TItem>();

  /** The chunk's last drawable; stale while `dirty`. */
  public resource: TResource | undefined = undefined;

  public dirty = true;

  public readonly visible = cache((): TItem[] => {
    const visible: TItem[] = [];
    for (const item of this.items) {
      if (item.isPathVisible?.() ?? true) visible.push(item);
    }
    return visible;
  });

  /** Union of the visible items' bounds; undefined when one of them has none. */
  public readonly bounds = cache((): TPathBounds | undefined => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of this.visible.get()) {
      const bounds = item.getPathBounds?.();
      if (!isValidBounds(bounds)) return undefined;
      if (bounds[0] < minX) minX = bounds[0];
      if (bounds[1] < minY) minY = bounds[1];
      if (bounds[2] > maxX) maxX = bounds[2];
      if (bounds[3] > maxY) maxY = bounds[3];
    }
    return [minX, minY, maxX, maxY];
  });

  constructor(public readonly key: number) {}

  public reset(): void {
    this.dirty = true;
    this.visible.reset();
    this.bounds.reset();
  }
}

/** Chunks of one `(zIndex, group)` pair, bucketed by cell. */
class BatchGroup<TItem extends IBatchItem, TResource> {
  private readonly buckets = new Map<number, BatchChunk<TItem, TResource>[]>();

  /** Unbounded chunks first, then cells by key; chunks of a cell in creation order. */
  private readonly ordered = cache((): BatchChunk<TItem, TResource>[] => {
    const keys = Array.from(this.buckets.keys()).sort((a, b) => a - b);
    const chunks: BatchChunk<TItem, TResource>[] = [];
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (bucket) chunks.push(...bucket);
    }
    return chunks;
  });

  constructor(private readonly chunkSize: number) {}

  public get chunks(): readonly BatchChunk<TItem, TResource>[] {
    return this.ordered.get();
  }

  /** Puts the item into the last chunk of its bucket with room, else the first one with room, else a new one. */
  public add(item: TItem, key: number): BatchChunk<TItem, TResource> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    let chunk: BatchChunk<TItem, TResource> | undefined = bucket[bucket.length - 1];
    if (!chunk || chunk.items.size >= this.chunkSize) {
      chunk = bucket.find((candidate) => candidate.items.size < this.chunkSize);
    }
    if (!chunk) {
      chunk = new BatchChunk<TItem, TResource>(key);
      bucket.push(chunk);
      this.ordered.reset();
    }
    chunk.items.add(item);
    chunk.reset();
    return chunk;
  }

  /** Takes the item out of its chunk; returns true when the chunk became empty and was removed. */
  public remove(item: TItem, chunk: BatchChunk<TItem, TResource>): boolean {
    chunk.items.delete(item);
    chunk.reset();
    if (chunk.items.size) return false;
    const bucket = this.buckets.get(chunk.key);
    if (bucket) {
      const index = bucket.indexOf(chunk);
      if (index !== -1) bucket.splice(index, 1);
      if (!bucket.length) this.buckets.delete(chunk.key);
    }
    this.ordered.reset();
    return true;
  }
}

type TRecord<TItem extends IBatchItem, TResource> = {
  params: TBatchParams;
  group: BatchGroup<TItem, TResource>;
  chunk: BatchChunk<TItem, TResource>;
};

/**
 * Backend-agnostic store of batched items. Items are grouped by z-level and style group, then by the grid cell of
 * their bounds' top-left corner into chunks of up to `chunkSize` items, whatever their size: a chunk's bounds contain
 * every item's bounds, so a long item is drawn whenever any part of it is in the viewport. Items without valid bounds
 * share chunks that are never culled. A frame costs O(chunks); a chunk's drawable is rebuilt only after one of its
 * items was added, removed, moved to another cell or marked dirty.
 */
export class BatchScene<TItem extends IBatchItem, TResource, TTarget> {
  private readonly levels = new Map<number, Map<string, BatchGroup<TItem, TResource>>>();

  private readonly records = new Map<TItem, TRecord<TItem, TResource>>();

  /** Groups by ascending z-level; groups of a level in first-registration order. */
  private readonly orderedGroups = cache((): BatchGroup<TItem, TResource>[] => {
    const zIndexes = Array.from(this.levels.keys()).sort((a, b) => a - b);
    const groups: BatchGroup<TItem, TResource>[] = [];
    for (const zIndex of zIndexes) {
      const level = this.levels.get(zIndex);
      if (level) groups.push(...level.values());
    }
    return groups;
  });

  private readonly cellSize: number;

  private readonly chunkSize: number;

  private readonly onChange: (() => void) | undefined;

  constructor(
    private readonly backend: IBatchBackend<TItem, TResource, TTarget>,
    options: TBatchSceneOptions
  ) {
    if (!(options.cellSize > 0) || !Number.isFinite(options.cellSize)) {
      throw new Error(`Batch cell size must be a positive finite number, got ${options.cellSize}`);
    }
    if (!(options.chunkSize >= 1)) {
      throw new Error(`Batch chunk size must be at least 1, got ${options.chunkSize}`);
    }
    this.cellSize = options.cellSize;
    this.chunkSize = options.chunkSize;
    this.onChange = options.onChange;
  }

  public has(item: TItem): boolean {
    return this.records.has(item);
  }

  public add(item: TItem, params: TBatchParams): void {
    if (this.records.has(item)) {
      this.update(item, params);
      return;
    }
    const group = this.getGroup(params.zIndex, params.group);
    const chunk = group.add(item, this.keyOf(item));
    this.records.set(item, { params: { zIndex: params.zIndex, group: params.group }, group, chunk });
    this.onChange?.();
  }

  /** A zIndex or group change moves the item; otherwise this is `markDirty()`. */
  public update(item: TItem, params: TBatchParams): void {
    const record = this.records.get(item);
    if (record && record.params.zIndex === params.zIndex && record.params.group === params.group) {
      this.markDirty(item);
      return;
    }
    if (record) this.delete(item);
    this.add(item, params);
  }

  public delete(item: TItem): void {
    const record = this.records.get(item);
    if (!record) return;
    this.records.delete(item);
    this.detach(item, record);
    this.onChange?.();
  }

  /** The item's path, bounds or semantic visibility changed. */
  public markDirty(item: TItem): void {
    const record = this.records.get(item);
    if (!record) return;
    if (!this.relocate(item, record)) record.chunk.reset();
    this.onChange?.();
  }

  /** Only the item's bounds changed; its drawable is kept unless the item moves to another cell. */
  public markBoundsDirty(item: TItem): void {
    const record = this.records.get(item);
    if (!record) return;
    if (!this.relocate(item, record)) record.chunk.bounds.reset();
  }

  /** Draws every chunk with visible items that intersects the viewport, building stale drawables first. */
  public render(target: TTarget, viewport?: TTileRect): void {
    const groups = this.orderedGroups.get();
    for (let g = 0; g < groups.length; g++) {
      const chunks = groups[g].chunks;
      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        const items = chunk.visible.get();
        if (!items.length || !boundsIntersect(chunk.bounds.get(), viewport)) continue;
        let resource: TResource;
        if (chunk.dirty || chunk.resource === undefined) {
          resource = this.backend.build(items, chunk.resource);
          chunk.resource = resource;
          chunk.dirty = false;
        } else {
          resource = chunk.resource;
        }
        this.backend.draw(target, resource, items, viewport);
      }
    }
  }

  private getGroup(zIndex: number, name: string): BatchGroup<TItem, TResource> {
    let level = this.levels.get(zIndex);
    if (!level) {
      level = new Map();
      this.levels.set(zIndex, level);
    }
    let group = level.get(name);
    if (!group) {
      group = new BatchGroup<TItem, TResource>(this.chunkSize);
      level.set(name, group);
      this.orderedGroups.reset();
    }
    return group;
  }

  private keyOf(item: TItem): number {
    const bounds = item.getPathBounds?.();
    if (!isValidBounds(bounds)) return UNBOUNDED;
    return cellKey(toTile(bounds[0], this.cellSize), toTile(bounds[1], this.cellSize));
  }

  /** Moves the item when its bounds now belong to another cell; returns whether it moved. */
  private relocate(item: TItem, record: TRecord<TItem, TResource>): boolean {
    const key = this.keyOf(item);
    if (key === record.chunk.key) return false;
    this.detach(item, record);
    record.chunk = record.group.add(item, key);
    return true;
  }

  private detach(item: TItem, record: TRecord<TItem, TResource>): void {
    const chunk = record.chunk;
    if (!record.group.remove(item, chunk)) return;
    if (chunk.resource !== undefined) this.backend.release?.(chunk.resource);
    chunk.resource = undefined;
  }
}
