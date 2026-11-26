import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { CursorLayerCursorTypes } from "../../components/canvas/layers/cursorLayer/CursorLayer";

/**
 * Options for creating a custom drag operation via DragService.startDrag()
 */
export type DragOperationOptions = {
  /** Document to attach listeners to. Defaults to graph canvas document if not provided */
  document?: Document;
  /** Cursor to show during drag */
  cursor?: CursorLayerCursorTypes;
  /** Capture graph pointer events for this component while the drag is active. */
  component?: GraphComponent;
  /** Enable autopanning when dragging near edges */
  autopanning?: boolean;
  /** Stop drag when the pointer leaves the document */
  stopOnPointerLeave?: boolean;
  /**
   * Minimum distance in CSS pixels the pointer must move before drag starts.
   * If not set, uses graph's dragThreshold setting.
   */
  threshold?: number;
  /**
   * Initial event to use for threshold calculation.
   * If not set, uses the first movement as the origin.
   */
  initialEvent?: PointerEvent;
  /**
   * Blocks browser text selection for the drag session.
   * @default true
   */
  suppressTextSelection?: boolean;
};

/**
 * Callbacks for custom drag operation lifecycle
 */
export type DragOperationCallbacks = {
  /** Called when movement reaches the threshold */
  onStart?: (event: PointerEvent, coords: [number, number]) => void;
  /** Called on movement and when autopanning moves the camera */
  onUpdate?: (event: PointerEvent, coords: [number, number], cause: "pointer" | "scene") => void;
  /** Called when the initiating button is released */
  onEnd?: (event: PointerEvent, coords: [number, number]) => void;
  /**
   * Called with the last pointer event and coordinates on cancellation. Calling DragService.cancel()
   * falls back to onEnd when this is omitted. Pointer cancellation discards the operation.
   */
  onCancel?: (event: PointerEvent, coords: [number, number]) => void;
};

/**
 * Current state of drag operation, accessible via DragService.$state signal
 */
export type DragState = {
  /** Whether a drag operation is currently in progress */
  isDragging: boolean;
  /** True on the idle state published after the component drag was cancelled. */
  cancelled: boolean;
  /** The initial pointer event that started the drag operation (for checking modifiers like shiftKey) */
  initialEvent: PointerEvent | null;
  /** The current pointer event (updated on each drag move) */
  currentEvent: PointerEvent | null;
  /** Components participating in the current drag operation */
  components: GraphComponent[];
  /** Set of component type names (constructor names) participating in drag */
  componentTypes: Set<string>;
  /** Whether multiple components are being dragged */
  isMultiple: boolean;
  /** Whether all dragged components are of the same type */
  isHomogeneous: boolean;
  /** Starting coordinates in world space when drag began */
  startCoords: [number, number] | null;
  /** Current coordinates in world space */
  currentCoords: [number, number] | null;
};

/**
 * Context passed to drag lifecycle methods
 */
export type DragContext = {
  /** The native pointer event */
  sourceEvent: PointerEvent;
  /** Starting coordinates in world space when drag began */
  startCoords: [number, number];
  /** Previous coordinates in world space from last frame */
  prevCoords: [number, number];
  /** Current coordinates in world space */
  currentCoords: [number, number];
  /** All components participating in this drag operation */
  components: GraphComponent[];
};

/**
 * Diff values passed to handleDrag method
 */
export type DragDiff = {
  /** Starting coordinates in world space when drag began */
  startCoords: [number, number];
  /** Previous coordinates in world space from last frame */
  prevCoords: [number, number];
  /** Current coordinates in world space */
  currentCoords: [number, number];
  /** Absolute X displacement from start (currentCoords.x - startCoords.x) */
  diffX: number;
  /** Absolute Y displacement from start (currentCoords.y - startCoords.y) */
  diffY: number;
  /** Incremental X change since last frame (currentCoords.x - prevCoords.x) */
  deltaX: number;
  /** Incremental Y change since last frame (currentCoords.y - prevCoords.y) */
  deltaY: number;
};
