import { GraphComponent } from "../../../components/canvas/GraphComponent";
import { Point } from "../../../utils/types/shapes";
import { DragContext, DragInfo } from "../DragInfo";

/**
 * Configuration for the magnetic modifier.
 */
export type MagneticModifierConfig = {
  /** Distance threshold for magnetism in pixels. Elements within this distance will trigger magnetism. */
  magnetismDistance: number;
  /** Array of component types to search for magnetism. If not provided, searches all components. */
  targets?: Constructor<GraphComponent>[];
  /**
   * Function to resolve the snap position of an element.
   * Should return null/undefined if the element should not provide a snap position.
   * @param element - The element to resolve position for
   * @returns Position coordinates or null if not applicable
   */
  resolvePosition?: (element: GraphComponent) => { x: number; y: number } | null;
  /**
   * Function to filter which elements can be snap targets.
   * @param element - The element to test
   * @returns true if element should be considered for magnetism
   */
  filter?: (element: GraphComponent) => boolean;
};

/**
 * Extended drag context for magnetic modifier operations.
 */
type MagneticModifierContext = DragContext & {
  magneticModifier: {
    magnetismDistance: number;
    targets?: Constructor<GraphComponent>[];
    resolvePosition?: (element: GraphComponent) => { x: number; y: number } | null;
    filter?: (element: GraphComponent) => boolean;
  };
};

/**
 * Creates a magnetic position modifier that snaps dragged elements to nearby targets.
 *
 * This modifier searches for elements within a specified distance and snaps the dragged
 * position to the closest valid target. It uses viewport-based element filtering for
 * optimal performance and supports custom target types, position resolution, and filtering.
 *
 * @example
 * ```typescript
 * // Basic magnetism to blocks and anchors
 * const magneticModifier = MagneticModifier({
 *   magnetismDistance: 50,
 *   targets: [Block, Anchor],
 *   resolvePosition: (element) => {
 *     if (element instanceof Block) return element.getConnectionPoint("in");
 *     if (element instanceof Anchor) return element.getPosition();
 *     return null;
 *   }
 * });
 *
 * // Anchor-to-anchor magnetism with type filtering
 * const anchorMagnetism = MagneticModifier({
 *   magnetismDistance: 30,
 *   targets: [Anchor],
 *   filter: (element) => element instanceof Anchor && element.type !== sourceAnchor.type
 * });
 * ```
 *
 * @param params - Configuration for the magnetic modifier
 * @returns A position modifier that provides magnetism functionality
 */
export const MagneticModifier = (params: MagneticModifierConfig) => {
  let config = params;
  return {
    name: "magnetic",
    priority: 10,

    /**
     * Updates the modifier configuration with new parameters.
     * @param nextParams - Partial configuration to merge with existing config
     * @returns void
     */
    setParams: (nextParams: Partial<MagneticModifierConfig>) => {
      config = Object.assign({}, config, nextParams);
    },

    /**
     * Determines if the magnetic modifier should be applied for the current drag state.
     *
     * @param pos - Current position being evaluated
     * @param dragInfo - Current drag information
     * @param ctx - Drag context containing stage and other metadata
     * @returns true if magnetism should be applied
     */
    applicable: (pos: Point, dragInfo: DragInfo, ctx: MagneticModifierContext) => {
      // Only apply during dragging and drop stages, not during start
      if (ctx.stage === "start") return false;

      // Don't apply for micro-movements to prevent jitter
      if (dragInfo.isMicroDrag()) return false;

      return true;
    },

    /**
     * Calculates the magnetic snap position based on nearby elements.
     *
     * Searches for target elements within the magnetism distance and returns
     * the position of the closest valid target. Updates the drag context with
     * the found target for use by other systems.
     *
     * @param pos - Current position to evaluate for magnetism
     * @param dragInfo - Current drag information
     * @param ctx - Drag context containing graph and other metadata
     * @returns Modified position if a target is found, otherwise original position
     */
    suggest: (pos: Point, dragInfo: DragInfo, ctx: MagneticModifierContext) => {
      const distance = config.magnetismDistance;

      // Create a search rectangle around the current position
      const searchRect = {
        x: pos.x - distance,
        y: pos.y - distance,
        width: distance * 2,
        height: distance * 2,
      };

      // Get elements within the search area based on useBlockAnchors setting
      let elementsInRect = ctx.graph.getElementsOverRect(searchRect, [...config.targets]);

      if (config.filter) {
        elementsInRect = elementsInRect.filter(config.filter);
      }

      let closestTarget: GraphComponent | null = null;
      let closestDistance = distance;

      // Check all found elements (only blocks or only anchors based on settings)
      elementsInRect.forEach((element) => {
        const position = config.resolvePosition?.(element);
        if (!position) {
          return;
        }

        const dist = Math.sqrt(Math.pow(pos.x - position.x, 2) + Math.pow(pos.y - position.y, 2));

        if (dist < closestDistance) {
          closestTarget = element;
          closestDistance = dist;
        }
      });

      // Update context with closest target for use in drag handlers
      dragInfo.updateContext({
        closestTarget,
      });

      // If we found a nearby target, snap to it
      if (closestTarget) {
        const position = config.resolvePosition?.(closestTarget);
        if (position) {
          return new Point(position.x, position.y);
        }
      }

      // No snapping suggestion - return original position
      return pos;
    },
  };
};
