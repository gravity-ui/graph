import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { CursorLayerCursorTypes } from "../../components/canvas/layers/cursorLayer/CursorLayer";

/**
 * Options for creating a custom drag operation via DragService.startOperation()
 */
export type DragOperationOptions = {
  /** Document to attach listeners to. Defaults to graph canvas document if not provided */
  document?: Document;
  /** Cursor to show during drag */
  cursor?: CursorLayerCursorTypes;
  component?: GraphComponent;
  /** Enable autopanning when dragging near edges */
  autopanning?: boolean;
  /** Stop drag when mouse leaves the document */
  stopOnMouseLeave?: boolean;
};

/**
 * Callbacks for custom drag operation lifecycle
 */
export type DragOperationCallbacks = {
  /** Called when drag starts (first mousemove after mousedown) */
  onStart?: (event: MouseEvent, coords: [number, number]) => void;
  /** Called on each mousemove during drag */
  onUpdate?: (event: MouseEvent, coords: [number, number]) => void;
  /** Called when drag ends (mouseup) */
  onEnd?: (event: MouseEvent, coords: [number, number]) => void;
};

/**
 * Current state of drag operation, accessible via DragService.$state signal
 */
export type DragState = {
  /** Whether a drag operation is currently in progress */
  isDragging: boolean;
  /** Components participating in the current drag operation */
  components: GraphComponent[];
  /** Set of component type names (constructor names) participating in drag */
  componentTypes: Set<string>;
  /** Whether multiple components are being dragged */
  isMultiple: boolean;
  /** Whether all dragged components are of the same type */
  isHomogeneous: boolean;
};

/**
 * Context passed to drag lifecycle methods
 */
export type DragContext = {
  /** The native mouse event */
  sourceEvent: MouseEvent;
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
