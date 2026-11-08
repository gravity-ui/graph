import type { TTileRect } from "../culling/TileIndex";

/** World-space rectangle as `[minX, minY, maxX, maxY]`. */
export type TPathBounds = readonly [number, number, number, number];

/** What a batch scene needs from an item; backends add what they draw. */
export interface IBatchItem {
  /** World-space bounds of everything the item paints; an item without valid bounds is never culled. */
  getPathBounds?(): TPathBounds | undefined;
  /** Semantic visibility, such as hidden items or missing geometry. Viewport culling is the scene's job. */
  isPathVisible?(): boolean;
}

/** Z-level and style group of an item: items of one group are drawn with one style. */
export type TBatchParams = { zIndex: number; group: string };

/** Turns chunks of items into drawables and draws them; one implementation per graphics API. */
export interface IBatchBackend<TItem, TResource, TTarget> {
  /** Builds a chunk's drawable from its visible items, in chunk order. `previous` is the chunk's last drawable. */
  build(items: readonly TItem[], previous: TResource | undefined): TResource;
  /** Draws a built chunk that intersects the viewport; without a viewport every chunk is drawn. */
  draw(target: TTarget, resource: TResource, items: readonly TItem[], viewport: TTileRect | undefined): void;
  /**
   * Called after the chunks of a `(zIndex, group)` pair when at least one of them was drawn, so a backend can draw
   * the group's chunks together.
   */
  endGroup?(target: TTarget): void;
  /** Frees the drawable of a removed chunk. */
  release?(resource: TResource): void;
}

export type TBatchSceneOptions = {
  /** Edge of a chunk cell in world units. */
  cellSize: number;
  /** Most items in one chunk. */
  chunkSize: number;
  /** Called after a change that can alter the picture. */
  onChange?: () => void;
};
