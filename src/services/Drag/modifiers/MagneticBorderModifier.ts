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
  filter?: (element: GraphComponent) => boolean;
  /**
   * Which borders to consider for snapping.
   * @default ['top', 'right', 'bottom', 'left']
   */
  enabledBorders?: Array<"top" | "right" | "bottom" | "left">;
};

/**
 * Extended drag context for magnetic border modifier operations.
 */
type MagneticBorderModifierContext = DragContext & {
  magneticBorderModifier: {
    magnetismDistance: number | "auto";
    targets?: Constructor<GraphComponent>[];
    resolveBounds?: (element: GraphComponent) => { x: number; y: number; width: number; height: number } | null;
    filter?: (element: GraphComponent) => boolean;
    enabledBorders?: Array<"top" | "right" | "bottom" | "left">;
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

      // Determine search area and maximum distance
      let searchRect: { x: number; y: number; width: number; height: number };
      let maxDistance: number;

      let elementsInRect = [];

      if (isAutoMode) {
        elementsInRect = ctx.graph.getElementsInViewport(config.targets ? [...config.targets] : []);
        // In auto mode, allow infinite distance within viewport
        maxDistance = Infinity;
      } else {
        // Distance mode: create search rectangle around current position
        const distance = config.magnetismDistance as number;
        searchRect = {
          x: pos.x - distance,
          y: pos.y - distance,
          width: distance * 2,
          height: distance * 2,
        };
        elementsInRect = ctx.graph.getElementsOverRect(searchRect, config.targets ? [...config.targets] : []);
        maxDistance = distance;
      }

      // Get elements within the search area

      if (config.filter) {
        elementsInRect = elementsInRect.filter(config.filter);
      }

      let closestBorder: BorderInfo | null = null;
      let closestDistance = maxDistance;

      // Check all found elements for their borders
      elementsInRect.forEach((element) => {
        const bounds = config.resolveBounds?.(element);
        if (!bounds) {
          return;
        }

        // Get closest border lines for this element
        const borderLines = getClosestBorderLines(pos, bounds, enabledBorders);

        // Check if any border line is closer than our current closest
        for (const borderLine of borderLines) {
          if (borderLine.distance < closestDistance) {
            closestBorder = {
              element,
              border: borderLine.border,
              point: borderLine.point,
              distance: borderLine.distance,
            };
            closestDistance = borderLine.distance;
          }
        }
      });

      // Update context with closest border information for use in drag handlers
      dragInfo.updateContext({
        closestBorder,
        closestBorderElement: closestBorder?.element,
        closestBorderSide: closestBorder?.border,
      });

      // If we found a nearby border, snap to it
      if (closestBorder) {
        return closestBorder.point;
      }

      // No snapping suggestion - return original position
      return pos;
    },
  };
};
