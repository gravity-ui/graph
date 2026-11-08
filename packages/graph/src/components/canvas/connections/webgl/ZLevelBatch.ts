import type { BatchScene } from "../../../../lib/batch/BatchScene";
import type { IBatchItem, TBatchParams } from "../../../../lib/batch/types";
import type { TTileRect } from "../../../../lib/culling/TileIndex";

/** The one scene group of every z-level. */
export const Z_LEVEL_GROUP = "z-level";

/**
 * Registers items in a scene by z-level only: WebGL takes each item's style from its instance attributes, so style
 * groups would only split chunks. Keeps each item's own params for `forEachItem`, so a batch switch restores them.
 */
export class ZLevelBatch<TItem extends IBatchItem, TResource, TTarget> {
  private readonly params = new Map<TItem, TBatchParams>();

  constructor(private readonly scene: BatchScene<TItem, TResource, TTarget>) {}

  public add(item: TItem, params: TBatchParams): void {
    this.update(item, params);
  }

  /** A style change keeps the scene params, so the scene rebuilds the item's chunk in place. */
  public update(item: TItem, params: TBatchParams): void {
    this.params.set(item, { zIndex: params.zIndex, group: params.group });
    this.scene.update(item, { zIndex: params.zIndex, group: Z_LEVEL_GROUP });
  }

  public delete(item: TItem): void {
    this.params.delete(item);
    this.scene.delete(item);
  }

  public has(item: TItem): boolean {
    return this.params.has(item);
  }

  public markDirty(item: TItem): void {
    this.scene.markDirty(item);
  }

  public markBoundsDirty(item: TItem): void {
    this.scene.markBoundsDirty(item);
  }

  /** Visits every item with the params it was registered with, style group included. */
  public forEachItem(visit: (item: TItem, params: TBatchParams) => void): void {
    for (const [item, params] of this.params) visit(item, params);
  }

  public render(target: TTarget, viewport?: TTileRect): void {
    this.scene.render(target, viewport);
  }
}
