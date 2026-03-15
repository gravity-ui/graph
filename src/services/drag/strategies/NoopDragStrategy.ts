import type { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { DragContext, DragDiff } from "../types";

import type { DragStrategy } from "./types";

/**
 * No-op strategy. Does not modify diff. Use when no snapping is desired (e.g. multi-block drag).
 */
export class NoopDragStrategy implements DragStrategy {
  public apply(_diff: DragDiff, _context: DragContext, _component: GraphComponent): void {
    // No modifications
  }
}
