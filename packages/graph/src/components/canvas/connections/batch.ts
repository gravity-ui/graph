import type { TBatchParams } from "../../../lib/batch/types";

import type { Path2DRenderInstance } from "./BatchPath2D";
import type { TWebGLShape } from "./lines/types";

/** A batched connection item: a line or an arrow. */
export interface IConnectionBatchItem extends Path2DRenderInstance {
  /** What the WebGL batch draws; items without it are not drawn by WebGL. */
  getWebGLShape?(): TWebGLShape | undefined;
  /**
   * @internal The effect of the WebGL shape, read when the item is added or updated, before its chunk is built: the
   * WebGL batch widens its culling viewport by the effects' `extraWidth`.
   */
  getWebGLEffect?(): TWebGLShape["effect"];
}

/** The batch connections register with; one renderer draws every connection of the graph. */
export interface IConnectionBatch {
  add(item: IConnectionBatchItem, params: TBatchParams): void;
  update(item: IConnectionBatchItem, params: TBatchParams): void;
  delete(item: IConnectionBatchItem): void;
  has(item: IConnectionBatchItem): boolean;
  markDirty(item: IConnectionBatchItem): void;
  markBoundsDirty(item: IConnectionBatchItem): void;
  forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void;
}
