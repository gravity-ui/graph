import { Point } from "../../../utils/types/shapes";
import { DragContext, DragStage, PositionModifier } from "../DragInfo";

/**
 * Configuration for the grid snap modifier.
 */
export type GridSnapModifierConfig = {
  /** Size of the grid in pixels. Positions will snap to multiples of this value. */
  gridSize: number;
  /** Drag stage when this modifier should be active (e.g., 'dragging', 'drop'). */
  stage: DragStage;
};

/**
 * Extended drag context for grid snap modifier operations.
 */
type GridSnapModifierContext = DragContext & {
  /** Whether grid snapping is enabled. Can be used to temporarily disable snapping. */
  enableGridSnap: boolean;
  /** Override grid size from context. If provided, takes precedence over config gridSize. */
  gridSize?: number;
};

/**
 * Creates a grid snap position modifier that aligns dragged elements to a regular grid.
 *
 * This modifier snaps positions to the nearest grid intersection based on the specified
 * grid size. It can be configured to activate only during specific drag stages (e.g.,
 * only on drop for clean final positioning, or during dragging for real-time feedback).
 *
 * @example
 * ```typescript
 * // Snap to 20px grid only when dropping
 * const dropGridSnap = createGridSnapModifier({
 *   gridSize: 20,
 *   stage: 'drop'
 * });
 *
 * // Real-time snapping during drag with 25px grid
 * const realtimeGridSnap = createGridSnapModifier({
 *   gridSize: 25,
 *   stage: 'dragging'
 * });
 *
 * // Using with dynamic grid size from context
 * dragController.start(handler, event, {
 *   positionModifiers: [dropGridSnap],
 *   context: {
 *     enableGridSnap: !event.ctrlKey, // Disable with Ctrl key
 *     gridSize: zoomLevel > 2 ? 10 : 20 // Smaller grid when zoomed in
 *   }
 * });
 * ```
 *
 * @param params - Configuration for the grid snap modifier
 * @returns A position modifier that provides grid snapping functionality
 */
export const createGridSnapModifier = (params: GridSnapModifierConfig): PositionModifier => ({
  name: "grid-snap",
  priority: 10,

  /**
   * Determines if grid snapping should be applied for the current drag state.
   *
   * @param _pos - Current position (unused)
   * @param dragInfo - Current drag information
   * @param ctx - Drag context with grid snap settings
   * @returns true if grid snapping should be applied
   */
  applicable: (_pos, dragInfo, ctx: GridSnapModifierContext) => {
    // Apply only if there's actual movement (not micro-movement)
    const isEnabled = ctx.enableGridSnap !== false; // Enabled by default
    return !dragInfo.isMicroDrag() && isEnabled && ctx.stage === params.stage;
  },

  /**
   * Calculates the grid-snapped position.
   *
   * @param pos - Current position to snap to grid
   * @param _dragInfo - Current drag information (unused)
   * @param ctx - Drag context that may override grid size
   * @returns Position snapped to the nearest grid intersection
   */
  suggest: (pos, _dragInfo, ctx: GridSnapModifierContext) => {
    // Grid size can be overridden through context
    const effectiveGridSize = ctx.gridSize || params.gridSize;
    return new Point(
      Math.round(pos.x / effectiveGridSize) * effectiveGridSize,
      Math.round(pos.y / effectiveGridSize) * effectiveGridSize
    );
  },
});
