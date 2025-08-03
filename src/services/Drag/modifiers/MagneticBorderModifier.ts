import { GraphComponent } from "../../../components/canvas/GraphComponent";
import { Point } from "../../../utils/types/shapes";
import { DragContext, DragInfo } from "../DragInfo";

/**
 * Configuration for the magnetic border modifier.
 */
export type MagneticBorderModifierConfig = {
  /**
   * Distance threshold for magnetism in pixels, or 'auto' to use camera viewport.
   * - number: Elements within this distance will trigger magnetism
   * - 'auto': All elements in camera viewport will be considered for magnetism
   */
  magnetismDistance: number | "auto";
  /**
   * Distance threshold for actual snapping in pixels.
   * If not provided, uses magnetismDistance value.
   * Must be <= magnetismDistance when both are numbers.
   */
  snapThreshold?: number;
  /** Array of component types to search for magnetism. If not provided, searches all components. */
  targets?: Constructor<GraphComponent>[];
  /**
   * Function to resolve the bounding box of an element.
   * Should return null/undefined if the element should not provide a bounding box.
   * @param element - The element to resolve bounding box for
   * @returns Bounding box coordinates or null if not applicable
   */
  resolveBounds?: (element: GraphComponent) => { x: number; y: number; width: number; height: number } | null;
  /**
   * Function to filter which elements can be snap targets.
   * @param element - The element to test
   * @returns true if element should be considered for magnetism
   */
  filter?: (element: GraphComponent, dragInfo: DragInfo, ctx: DragContext) => boolean;
  /**
   * Which borders to consider for snapping.
   * @default ['top', 'right', 'bottom', 'left']
   */
  enabledBorders?: Array<"top" | "right" | "bottom" | "left">;
  /**
   * Whether to allow snapping to multiple borders simultaneously.
   * @default false
   */
  allowMultipleSnap?: boolean;
};

/**
 * Extended drag context for magnetic border modifier operations.
 */
type MagneticBorderModifierContext = DragContext & {
  magneticBorderModifier: {
    magnetismDistance: number | "auto";
    snapThreshold?: number;
    targets?: Constructor<GraphComponent>[];
    resolveBounds?: (element: GraphComponent) => { x: number; y: number; width: number; height: number } | null;
    filter?: (element: GraphComponent) => boolean;
    enabledBorders?: Array<"top" | "right" | "bottom" | "left">;
    allowMultipleSnap?: boolean;
  };
};

/**
 * Represents a border of a bounding box.
 */
type BorderInfo = {
  element: GraphComponent;
  border: "top" | "right" | "bottom" | "left";
  point: Point;
  distance: number;
};

/**
 * Calculates the minimum distance from any border of a dragged block to an infinite line.
 * @param currentPos - Current position (top-left corner) where the block would be placed
 * @param blockSize - Size of the dragged block (width and height)
 * @param lineInfo - Information about the infinite line
 * @returns Minimum distance from any border of the block to the line
 */
function getDistanceFromBlockBordersToLine(
  currentPos: Point,
  blockSize: { width: number; height: number },
  lineInfo: { border: "top" | "right" | "bottom" | "left"; point: Point }
): number {
  const { border, point } = lineInfo;

  if (border === "top" || border === "bottom") {
    // Horizontal line - check distance from top and bottom borders of dragged block
    const topDistance = Math.abs(currentPos.y - point.y);
    const bottomDistance = Math.abs(currentPos.y + blockSize.height - point.y);
    return Math.min(topDistance, bottomDistance);
  } else {
    // Vertical line - check distance from left and right borders of dragged block
    const leftDistance = Math.abs(currentPos.x - point.x);
    const rightDistance = Math.abs(currentPos.x + blockSize.width - point.x);
    return Math.min(leftDistance, rightDistance);
  }
}

/**
 * Calculates the correct position for the dragged block when snapping to a line.
 * Determines which border of the block should snap to the line and calculates
 * the corresponding top-left position of the block.
 * @param currentPos - Current position (top-left corner) of the block
 * @param blockSize - Size of the block (width and height)
 * @param lineInfo - Information about the line to snap to
 * @returns New position for the block's top-left corner
 */
function calculateSnapPosition(
  currentPos: Point,
  blockSize: { width: number; height: number },
  lineInfo: { border: "top" | "right" | "bottom" | "left"; point: Point }
): Point {
  const { border, point } = lineInfo;

  if (border === "top" || border === "bottom") {
    // Horizontal line - determine which border (top or bottom) should snap
    const topDistance = Math.abs(currentPos.y - point.y);
    const bottomDistance = Math.abs(currentPos.y + blockSize.height - point.y);

    if (topDistance <= bottomDistance) {
      // Top border snaps to line
      return new Point(currentPos.x, point.y);
    } else {
      // Bottom border snaps to line
      return new Point(currentPos.x, point.y - blockSize.height);
    }
  } else {
    // Vertical line - determine which border (left or right) should snap
    const leftDistance = Math.abs(currentPos.x - point.x);
    const rightDistance = Math.abs(currentPos.x + blockSize.width - point.x);

    if (leftDistance <= rightDistance) {
      // Left border snaps to line
      return new Point(point.x, currentPos.y);
    } else {
      // Right border snaps to line
      return new Point(point.x - blockSize.width, currentPos.y);
    }
  }
}

/**
 * Processes a single element to collect its border lines and snap candidates.
 * @param element - The graph component to process
 * @param pos - Current cursor position
 * @param enabledBorders - Which borders to consider
 * @param snapThreshold - Distance threshold for snapping
 * @param draggedSize - Size of the dragged element (optional)
 * @param resolveBounds - Function to resolve element bounds
 * @returns Object containing all border lines and snap candidates
 */
function processElementBorderLines(
  element: GraphComponent,
  pos: Point,
  enabledBorders: Array<"top" | "right" | "bottom" | "left">,
  snapThreshold: number,
  draggedSize: { width: number; height: number } | null,
  resolveBounds?: (element: GraphComponent) => { x: number; y: number; width: number; height: number } | null
): { allLines: BorderInfo[]; snapCandidates: BorderInfo[] } {
  const bounds = resolveBounds?.(element);
  if (!bounds) {
    return { allLines: [], snapCandidates: [] };
  }

  const allLines: BorderInfo[] = [];
  const snapCandidates: BorderInfo[] = [];
  const borderLines = getClosestBorderLines(pos, bounds, enabledBorders);

  for (const borderLine of borderLines) {
    const borderInfo: BorderInfo = {
      element,
      border: borderLine.border,
      point: borderLine.point,
      distance: borderLine.distance,
    };

    allLines.push(borderInfo);

    // Check if any border of the dragged block is close to this infinite line
    let shouldSnap = false;
    if (draggedSize) {
      // Use the current position (pos) to calculate where the block would be
      const blockToLineDistance = getDistanceFromBlockBordersToLine(pos, draggedSize, {
        border: borderLine.border,
        point: borderLine.point,
      });
      shouldSnap = blockToLineDistance <= snapThreshold;
    } else {
      // Fallback to original point-based logic if no dragged size
      shouldSnap = borderLine.distance <= snapThreshold;
    }

    if (shouldSnap) {
      snapCandidates.push(borderInfo);
    }
  }

  return { allLines, snapCandidates };
}

/**
 * Calculates the final position after applying snapping to selected borders.
 * @param selectedBorders - Array of borders to snap to
 * @param draggedSize - Size of the dragged element (optional)
 * @param pos - Current position
 * @returns Final position after snapping
 */
function calculateFinalPosition(
  selectedBorders: BorderInfo[],
  draggedSize: { width: number; height: number } | null,
  pos: Point
): Point {
  if (selectedBorders.length === 0) {
    return pos; // No snapping
  }

  let newPos = pos;

  if (draggedSize) {
    // Use smart positioning that considers which border of the block should snap
    for (const border of selectedBorders) {
      const snapPos = calculateSnapPosition(newPos, draggedSize, {
        border: border.border,
        point: border.point,
      });

      if (border.border === "top" || border.border === "bottom") {
        // Update Y coordinate from horizontal line snap
        newPos = new Point(newPos.x, snapPos.y);
      } else {
        // Update X coordinate from vertical line snap
        newPos = new Point(snapPos.x, newPos.y);
      }
    }
  } else {
    // Fallback to original logic if no dragged size
    let newX = pos.x;
    let newY = pos.y;

    for (const border of selectedBorders) {
      if (border.border === "top" || border.border === "bottom") {
        newY = border.point.y;
      } else if (border.border === "left" || border.border === "right") {
        newX = border.point.x;
      }
    }

    newPos = new Point(newX, newY);
  }

  return newPos;
}

/**
 * Calculates the closest point on infinite lines extending through rectangle borders.
 * Unlike border snapping, this projects the point onto infinite lines that pass through the borders.
 * @param point - The point to find the closest line projection for
 * @param bounds - The bounding box of the rectangle
 * @param enabledBorders - Which border lines to consider
 * @returns Array of line projection information sorted by distance
 */
function getClosestBorderLines(
  point: Point,
  bounds: { x: number; y: number; width: number; height: number },
  enabledBorders: Array<"top" | "right" | "bottom" | "left"> = ["top", "right", "bottom", "left"]
): Array<{ border: "top" | "right" | "bottom" | "left"; point: Point; distance: number }> {
  const { x, y, width, height } = bounds;
  const linePoints: Array<{ border: "top" | "right" | "bottom" | "left"; point: Point; distance: number }> = [];

  // Top border line (horizontal line y = bounds.y)
  if (enabledBorders.includes("top")) {
    const linePoint = new Point(point.x, y); // Project point onto horizontal line
    const distance = Math.abs(point.y - y); // Distance is just the Y difference
    linePoints.push({ border: "top", point: linePoint, distance });
  }

  // Right border line (vertical line x = bounds.x + width)
  if (enabledBorders.includes("right")) {
    const linePoint = new Point(x + width, point.y); // Project point onto vertical line
    const distance = Math.abs(point.x - (x + width)); // Distance is just the X difference
    linePoints.push({ border: "right", point: linePoint, distance });
  }

  // Bottom border line (horizontal line y = bounds.y + height)
  if (enabledBorders.includes("bottom")) {
    const linePoint = new Point(point.x, y + height); // Project point onto horizontal line
    const distance = Math.abs(point.y - (y + height)); // Distance is just the Y difference
    linePoints.push({ border: "bottom", point: linePoint, distance });
  }

  // Left border line (vertical line x = bounds.x)
  if (enabledBorders.includes("left")) {
    const linePoint = new Point(x, point.y); // Project point onto vertical line
    const distance = Math.abs(point.x - x); // Distance is just the X difference
    linePoints.push({ border: "left", point: linePoint, distance });
  }

  return linePoints.sort((a, b) => a.distance - b.distance);
}

/**
 * Creates a magnetic border modifier that snaps dragged elements to infinite lines extending through element borders.
 *
 * This modifier searches for elements within a specified distance (or camera viewport in world
 * coordinates for 'auto' mode) and snaps the dragged position to the closest infinite line that
 * passes through element borders. Unlike border snapping which limits to the actual border edges,
 * this projects onto infinite lines for perfect alignment. It uses viewport-based element filtering
 * for optimal performance and supports custom target types, bounding box resolution, and border line filtering.
 *
 * @example
 * ```typescript
 * // Basic line magnetism to block borders with distance threshold
 * const lineMagnetism = MagneticBorderModifier({
 *   magnetismDistance: 20,
 *   targets: [Block],
 *   resolveBounds: (element) => {
 *     if (element instanceof Block) {
 *       return {
 *         x: element.state.x,
 *         y: element.state.y,
 *         width: element.state.width,
 *         height: element.state.height
 *       };
 *     }
 *     return null;
 *   }
 * });
 *
 * // Auto mode: snap to all visible blocks in camera viewport (world coordinates)
 * const globalLineMagnetism = MagneticBorderModifier({
 *   magnetismDistance: "auto", // Use entire camera viewport in world coordinates
 *   targets: [Block],
 *   resolveBounds: (element) => element.getBounds()
 * });
 *
 * // Snap only to horizontal lines (through top/bottom borders)
 * const horizontalLineSnap = MagneticBorderModifier({
 *   magnetismDistance: 15,
 *   targets: [Block],
 *   enabledBorders: ["top", "bottom"],
 *   resolveBounds: (element) => element.getBounds()
 * });
 *
 * // Auto mode with vertical lines only
 * const globalVerticalAlign = MagneticBorderModifier({
 *   magnetismDistance: "auto",
 *   targets: [Block],
 *   enabledBorders: ["left", "right"],
 *   resolveBounds: (element) => element.getBounds()
 * });
 * ```
 *
 * @param params - Configuration for the magnetic border modifier
 * @returns A position modifier that provides border line magnetism functionality
 */
export const MagneticBorderModifier = (params: MagneticBorderModifierConfig) => {
  let config = params;
  return {
    name: "magneticBorder",
    priority: 8, // Slightly lower priority than point magnetism

    /**
     * Updates the modifier configuration with new parameters.
     * @param nextParams - Partial configuration to merge with existing config
     * @returns void
     */
    setParams: (nextParams: Partial<MagneticBorderModifierConfig>) => {
      config = Object.assign({}, config, nextParams);
    },

    /**
     * Determines if the magnetic border modifier should be applied for the current drag state.
     *
     * @param pos - Current position being evaluated
     * @param dragInfo - Current drag information
     * @param ctx - Drag context containing stage and other metadata
     * @returns true if border magnetism should be applied
     */
    applicable: (pos: Point, dragInfo: DragInfo, ctx: MagneticBorderModifierContext) => {
      // Only apply during dragging and drop stages, not during start
      if (ctx.stage === "start") return false;

      // Don't apply for micro-movements to prevent jitter
      if (dragInfo.isMicroDrag()) return false;

      return true;
    },

    /**
     * Calculates the magnetic snap position based on infinite lines through element borders.
     *
     * Searches for target elements within the magnetism distance and returns
     * the projected position on the closest infinite line passing through element borders.
     * Updates the drag context with the found target information for use by other systems.
     *
     * @param pos - Current position to evaluate for magnetism
     * @param dragInfo - Current drag information
     * @param ctx - Drag context containing graph and other metadata
     * @returns Modified position if a border line is found, otherwise original position
     */
    suggest: (pos: Point, dragInfo: DragInfo, ctx: MagneticBorderModifierContext) => {
      const enabledBorders = config.enabledBorders || ["right", "left"];
      const isAutoMode = config.magnetismDistance === "auto";
      const allowMultipleSnap = config.allowMultipleSnap || false;

      // Get snap threshold - defaults to magnetismDistance if not provided
      const snapThreshold = isAutoMode ? Infinity : config.snapThreshold ?? (config.magnetismDistance as number);

      // Get elements within search area
      let elementsInRect = [];

      if (isAutoMode) {
        elementsInRect = ctx.graph.getElementsInViewport(config.targets ? [...config.targets] : []);
      } else {
        // Distance mode: create search rectangle around current position
        const distance = config.magnetismDistance as number;
        const searchRect = {
          x: pos.x - distance,
          y: pos.y - distance,
          width: distance * 2,
          height: distance * 2,
        };
        elementsInRect = ctx.graph.getElementsOverRect(searchRect, config.targets ? [...config.targets] : []);
      }

      if (config.filter) {
        elementsInRect = elementsInRect.filter((element) => config.filter(element, dragInfo, ctx));
      }

      // Get dragged element size for border distance calculations
      const draggedElement = (ctx as MagneticBorderModifierContext & { dragEntity?: GraphComponent }).dragEntity;
      const draggedBounds = draggedElement ? config.resolveBounds?.(draggedElement) : null;
      const draggedSize = draggedBounds ? { width: draggedBounds.width, height: draggedBounds.height } : null;

      // Collect infinite border lines from all found elements
      const allBorderLines: BorderInfo[] = [];
      // Collect lines that are close enough for actual snapping
      const snapCandidates: BorderInfo[] = [];

      // Check all found elements for their borders
      elementsInRect.forEach((element) => {
        const result = processElementBorderLines(
          element,
          pos,
          enabledBorders,
          snapThreshold,
          draggedSize,
          config.resolveBounds
        );
        allBorderLines.push(...result.allLines);
        snapCandidates.push(...result.snapCandidates);
      });

      // Sort candidates by distance
      allBorderLines.sort((a, b) => a.distance - b.distance);
      snapCandidates.sort((a, b) => a.distance - b.distance);

      // Find the best borders to snap to
      let selectedBorders: BorderInfo[] = [];

      if (snapCandidates.length > 0) {
        if (allowMultipleSnap) {
          // Group by axis (horizontal/vertical) and take closest from each
          const horizontalBorders = snapCandidates.filter((b) => b.border === "top" || b.border === "bottom");
          const verticalBorders = snapCandidates.filter((b) => b.border === "left" || b.border === "right");

          if (horizontalBorders.length > 0) {
            selectedBorders.push(horizontalBorders[0]); // Closest horizontal
          }
          if (verticalBorders.length > 0) {
            selectedBorders.push(verticalBorders[0]); // Closest vertical
          }
        } else {
          // Take only the single closest border
          selectedBorders = [snapCandidates[0]];
        }
      }

      // Update context with border information for visualization
      const closestBorder = allBorderLines.length > 0 ? allBorderLines[0] : null;
      dragInfo.updateContext({
        closestBorder,
        closestBorderElement: closestBorder?.element,
        closestBorderSide: closestBorder?.border,
        allBorderLines, // All lines for visualization
        selectedBorders, // Lines that are actually snapped to
      });

      // Calculate and return final position
      return calculateFinalPosition(selectedBorders, draggedSize, pos);
    },
  };
};
