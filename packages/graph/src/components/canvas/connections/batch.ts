import type { TBatchParams } from "../../../lib/batch/types";

import type { Path2DRenderInstance } from "./BatchPath2D";
import type { TConnectionAppearance } from "./appearance";

/** A batched connection item: Path2D draws its path, WebGL its appearance. */
export interface IConnectionBatchItem extends Path2DRenderInstance {
  getAppearance?(): TConnectionAppearance | undefined;
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
