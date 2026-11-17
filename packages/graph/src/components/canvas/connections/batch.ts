import type { TBatchParams } from "../../../lib/batch/types";

import type { Path2DRenderInstance } from "./BatchPath2D";

/** A batched Canvas connection item: a line or an arrow. */
export type IConnectionBatchItem = Path2DRenderInstance;

/** Compatibility batch for custom Canvas connections. */
export interface IConnectionBatch {
  add(item: IConnectionBatchItem, params: TBatchParams): void;
  update(item: IConnectionBatchItem, params: TBatchParams): void;
  delete(item: IConnectionBatchItem): void;
  has(item: IConnectionBatchItem): boolean;
  markDirty(item: IConnectionBatchItem): void;
  markBoundsDirty(item: IConnectionBatchItem): void;
  forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void;
}
