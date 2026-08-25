import { Graph } from "../../../../graph";
import { ESchedulerPriority } from "../../../../lib";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { debounce } from "../../../../utils/functions";
import { EventedComponent } from "../../EventedComponent/EventedComponent";
import { GraphComponent } from "../../GraphComponent";

/**
 * All supported CSS cursor types for the CursorLayer.
 * Includes standard CSS cursor values and additional browser-specific cursors.
 */
export type CursorLayerCursorTypes =
  | "auto"
  | "default"
  | "pointer"
  | "crosshair"
  | "move"
  | "text"
  | "wait"
  | "help"
  | "e-resize"
  | "n-resize"
  | "ne-resize"
  | "nw-resize"
  | "s-resize"
  | "se-resize"
  | "sw-resize"
  | "w-resize"
  | "ew-resize"
  | "ns-resize"
  | "nesw-resize"
  | "nwse-resize"
  | "grab"
  | "grabbing"
  | "not-allowed"
  | "no-drop"
  | "copy"
  | "alias"
  | "context-menu"
  | "cell"
  | "col-resize"
  | "row-resize"
  | "progress"
  | "vertical-text"
  | "zoom-in"
  | "zoom-out";

/**
 * Operating modes for the CursorLayer.
 * - "auto": Automatically sets cursor based on component under mouse
 * - "manual": Uses manually set cursor, ignoring component cursors
 */
export type CursorLayerMode = "auto" | "manual";

/**
 * Properties for CursorLayer configuration.
 */
export type TCursorLayerProps = LayerProps & {
  graph: Graph;
};

/**
 * Context provided to CursorLayer during rendering.
 */
export type TCursorLayerContext = LayerContext & {
  graph: Graph;
};

/**
 * CursorLayer provides cursor management for graph components.
 *
 * This layer manages cursor changes by applying cursor styles directly to the
 * graph root element, avoiding event blocking issues while maintaining
 * performance.
 *
 * ## Features:
 * - **Automatic mode**: Dynamically sets cursor based on component under mouse
 * - **Manual mode**: Allows explicit cursor control that overrides automatic behavior
 *
 * ## Usage:
 * ```typescript
 * // Automatic mode (default)
 * graph.getCursorLayer().isAuto(); // true
 *
 * // Manual mode
 * graph.lockCursor("grabbing");
 * graph.unlockCursor(); // returns to auto mode
 * ```
 *
 * @example
 * ```typescript
 * // The layer is automatically created and managed by the Graph
 * const cursorLayer = graph.getCursorLayer();
 *
 * // Check current mode
 * console.log(cursorLayer.getMode()); // "auto" | "manual"
 *
 * // Set manual cursor
 * cursorLayer.lockCursor("wait");
 *
 * // Return to automatic behavior
 * cursorLayer.unlockCursor();
 * ```
 */
export class CursorLayer extends Layer<TCursorLayerProps, TCursorLayerContext> {
  /** Current operating mode of the cursor layer */
  private mode: CursorLayerMode = "auto";

  /** Currently set manual cursor type (only used in manual mode) */
  private manualCursor?: CursorLayerCursorTypes;

  /** Component currently under the mouse cursor */
  private currentTarget?: GraphComponent;

  /** Debounced cursor update function to prevent flickering on large scales */
  private debouncedUpdateCursor: ReturnType<typeof debounce<(target?: EventedComponent) => void>>;

  /**
   * Creates a new CursorLayer instance.
   *
   * @param props - Configuration props for the layer
   */
  constructor(props: TCursorLayerProps) {
    super({
      // No HTML element needed - we'll apply cursor to the root element
      ...props,
    });

    // Create debounced version with 10 frames delay to prevent cursor flickering
    this.debouncedUpdateCursor = debounce(
      (target?: EventedComponent) => {
        this.updateCursorForTarget(target);
      },
      {
        frameInterval: 3,
        priority: ESchedulerPriority.LOW,
      }
    );
  }

  /**
   * Lifecycle method called after layer initialization.
   * Sets up event listeners for mouse tracking.
   */
  protected afterInit(): void {
    super.afterInit();

    // Always subscribe to graph events for mouse position tracking
    // Cursor is only applied in automatic mode
    this.subscribeToGraphEvents();
  }

  /**
   * Subscribes to graph mouse events for cursor management.
   * Always tracks mouse position to maintain accurate state
   * when switching between manual and auto modes.
   *
   * @private
   */
  private subscribeToGraphEvents(): void {
    // Subscribe to mouseenter and mouseleave events from the graph
    // ALWAYS track state to know where the mouse is located
    this.onGraphEvent("mouseenter", (event) => {
      const target = event.detail?.target;

      // Always track the current target
      this.currentTarget = target as GraphComponent;

      // Apply cursor only in automatic mode
      if (this.mode === "auto") {
        // Use debounced version to prevent cursor flickering on large scales
        this.debouncedUpdateCursor(target);
      }
    });

    this.onGraphEvent("mouseleave", () => {
      // Cancel any scheduled cursor updates from mouseenter
      this.debouncedUpdateCursor.cancel();

      // Always track that mouse left the element
      this.currentTarget = undefined;

      // Apply cursor only in automatic mode
      if (this.mode === "auto") {
        this.applyCursor("auto");
      }
    });
  }

  /**
   * Updates the cursor based on the target component's cursor property.
   *
   * @param target - The component under the mouse cursor
   * @private
   */
  private updateCursorForTarget(target?: EventedComponent): void {
    if (target && typeof target.isInteractive === "function" && target.isInteractive() && target.cursor) {
      this.applyCursor(target.cursor as CursorLayerCursorTypes);
    } else {
      this.applyCursor("auto");
    }
  }

  /**
   * Applies the specified cursor to the graph root element.
   *
   * @param cursor - The cursor type to apply
   * @private
   */
  private applyCursor(cursor: CursorLayerCursorTypes): void {
    const rootElement = this.props.graph.layers.$root;
    if (rootElement) {
      rootElement.style.cursor = cursor;
    }
  }

  protected unmountLayer(): void {
    // Cancel any pending cursor updates
    this.debouncedUpdateCursor.cancel();

    super.unmountLayer();
    const rootElement = this.props.graph.layers.$root;
    if (rootElement) {
      rootElement.style.cursor = "auto";
    }
  }

  /**
   * Locks the cursor to a specific type, disabling automatic cursor changes.
   *
   * When locked, the cursor will not change automatically based on
   * component interactions until unlockCursor() is called. This effectively
   * "freezes" the cursor state until manually unlocked.
   *
   * @param cursor - The cursor type to lock to
   *
   * @example
   * ```typescript
   * // Lock to loading cursor during async operation
   * cursorLayer.lockCursor("wait");
   *
   * // Lock to grabbing cursor during drag
   * cursorLayer.lockCursor("grabbing");
   * ```
   *
   * @see {@link unlockCursor} to return to automatic behavior
   */
  public lockCursor(cursor: CursorLayerCursorTypes): void {
    this.mode = "manual";
    this.manualCursor = cursor;
    this.applyCursor(cursor);
  }

  /**
   * Unlocks the cursor and returns to automatic cursor management.
   *
   * The cursor will immediately update to reflect the current state
   * based on the component under the mouse (if any). This removes the
   * "lock" and allows the cursor to respond to component interactions again.
   *
   * @example
   * ```typescript
   * // Unlock to return to automatic behavior
   * cursorLayer.unlockCursor();
   *
   * // If mouse is over a block, cursor will immediately show "grab"
   * // If mouse is over empty space, cursor will show "auto"
   * ```
   *
   * @see {@link lockCursor} to disable automatic behavior
   */
  public unlockCursor(): void {
    this.mode = "auto";
    this.manualCursor = undefined;

    // Immediately apply the correct cursor for the current state
    if (this.currentTarget) {
      this.updateCursorForTarget(this.currentTarget);
    } else {
      this.applyCursor("auto");
    }
  }

  /**
   * Returns the current operating mode of the cursor layer.
   *
   * @returns The current mode ("auto" or "manual")
   *
   * @example
   * ```typescript
   * if (cursorLayer.getMode() === "manual") {
   *   console.log("Cursor is manually controlled");
   * }
   * ```
   */
  public getMode(): CursorLayerMode {
    return this.mode;
  }

  /**
   * Returns the currently set manual cursor type.
   *
   * @returns The manual cursor type, or undefined if not in manual mode
   *
   * @example
   * ```typescript
   * const manualCursor = cursorLayer.getManualCursor();
   * if (manualCursor) {
   *   console.log(`Manual cursor: ${manualCursor}`);
   * }
   * ```
   */
  public getManualCursor(): CursorLayerCursorTypes | undefined {
    return this.manualCursor;
  }

  /**
   * Checks if the cursor layer is currently in manual mode.
   *
   * @returns True if in manual mode, false otherwise
   *
   * @example
   * ```typescript
   * if (cursorLayer.isManual()) {
   *   // Manual cursor is active
   *   console.log("Manual cursor:", cursorLayer.getManualCursor());
   * }
   * ```
   */
  public isManual(): boolean {
    return this.mode === "manual";
  }

  /**
   * Checks if the cursor layer is currently in automatic mode.
   *
   * @returns True if in automatic mode, false otherwise
   *
   * @example
   * ```typescript
   * if (cursorLayer.isAuto()) {
   *   // Cursor changes automatically based on components
   *   console.log("Current target:", cursorLayer.getCurrentTarget());
   * }
   * ```
   */
  public isAuto(): boolean {
    return this.mode === "auto";
  }

  /**
   * Returns the component currently under the mouse cursor.
   *
   * This method is primarily intended for debugging and development.
   * The value is tracked regardless of the current mode.
   *
   * @returns The component under the cursor, or undefined if none
   *
   * @example
   * ```typescript
   * const target = cursorLayer.getCurrentTarget();
   * if (target) {
   *   console.log("Mouse over:", target.constructor.name);
   *   console.log("Component cursor:", target.cursor);
   * }
   * ```
   */
  public getCurrentTarget(): EventedComponent | undefined {
    return this.currentTarget;
  }
}
