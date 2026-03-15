import type { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { DragContext, DragDiff } from "../types";

import type { DragStrategy } from "./types";

export type GridDragStrategyOptions = {
  gridSize: number;
};

/**
 * Naive grid snapping strategy. Rounds diffX and diffY to the nearest grid cell.
 */
export class GridDragStrategy implements DragStrategy {
  constructor(private readonly options: GridDragStrategyOptions) {}

  public apply(diff: DragDiff, _context: DragContext, _component: GraphComponent): void {
    const { gridSize } = this.options;
    if (gridSize <= 0) return;

    diff.diffX = Math.round(diff.diffX / gridSize) * gridSize;
    diff.diffY = Math.round(diff.diffY / gridSize) * gridSize;
  }
}
