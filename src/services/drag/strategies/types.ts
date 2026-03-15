import type { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { DragContext, DragDiff } from "../types";

/**
 * Interface for drag strategies that modify drag behavior (e.g. grid snapping, magnetic snapping).
 * Strategy is applied before handleDrag is called on the component.
 */
export interface DragStrategy {
  /**
   * Modifies diff in place. Called before component.handleDrag.
   * Use this to snap diffX, diffY (and optionally deltaX, deltaY) to grid or magnetic points.
   *
   * @param diff - Mutable diff object. Modify diffX, diffY to change the effective drag position.
   * @param context - Drag context with coordinates and participating components.
   * @param component - The component being dragged.
   */
  apply(diff: DragDiff, context: DragContext, component: GraphComponent): void;

  /**
   * Called when drag ends. Override to clean up (e.g. MagneticDragStrategy resets visualization state).
   */
  reset?(): void;
}

export type SnapStrategy = "closest" | "strongest";

export type MagneticDragStrategyOptions = {
  /** Minimum distance (px) to trigger snap. Default 15. */
  minDistanceToSnap?: number;
  /** Maximum distance (px) to consider snapping. Default 25. */
  maxDistanceToSnap?: number;
  /** Distance (px) to release snap after moving away. Hysteresis to avoid jumping. Default 45. */
  hysteresisDistance?: number;
  /** Component types to snap to (e.g. [Block]). Empty = all GraphComponents. */
  neighborTypes?: Array<new (...args: unknown[]) => GraphComponent>;
  /** Fallback grid size when no neighbor is found. 0 = no grid fallback. */
  gridSize?: number;
  /** Padding (px) to expand hitbox when searching for neighbors via getElementsOverRect. Default 50. */
  neighborSearchPadding?: number;
};

/** Snap line for visualization: from neighbor block (snap target) to dragged block */
export type MagneticSnapLine = {
  axis: "x" | "y";
  /** Point on the neighbor block we're snapping to */
  from: { x: number; y: number };
  /** Point on the block being dragged */
  to: { x: number; y: number };
  /** Target edge on neighbor for glow: left, right, top, or bottom */
  targetEdge: "left" | "right" | "top" | "bottom";
  /** Rect of the target edge segment for glow (x, y, width, height). Width/height may be 0 for line. */
  targetEdgeRect: { x: number; y: number; width: number; height: number };
};

/** Detail for magnetic-update event dispatched by MagneticDragStrategy */
export type MagneticUpdateDetail = {
  proposedRect: { x: number; y: number; width: number; height: number };
  snapLines: MagneticSnapLine[];
};
