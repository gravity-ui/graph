import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { CursorLayerCursorTypes } from "../../components/canvas/layers/cursorLayer/CursorLayer";
import { Graph } from "../../graph";
import { Emitter } from "../Emitter";
import { EVENTS } from "../types/events";

export type DragListenerOptions = {
  stopOnMouseLeave?: boolean;
  graph?: Graph;
  dragCursor?: CursorLayerCursorTypes;
  component?: EventedComponent;
  autopanning?: boolean;
  /**
   * Minimum distance in pixels the mouse must move before drag starts.
   * If graph is provided and threshold is not set, uses graph's dragThreshold setting.
   * Default: 0 (drag starts immediately on first mousemove)
   */
  threshold?: number;
  /**
   * Blocks browser text selection for the drag session (selectstart + temporary user-select).
   * @default true
   */
  suppressTextSelection?: boolean;
};

function getDragListenerDocument(node: Document | HTMLDivElement | HTMLCanvasElement): Document {
  if (node instanceof Document) {
    return node;
  }
  return node.ownerDocument;
}

/** Prevents browser text selection for the duration of a drag gesture. */
function installTextSelectionSuppression(doc: Document, graph?: Graph): () => void {
  const root = graph?.getGraphCanvas() ?? doc.documentElement;
  doc.defaultView?.getSelection()?.removeAllRanges();

  const onSelectStart = (event: Event): void => {
    event.preventDefault();
  };
  doc.addEventListener("selectstart", onSelectStart, { capture: true });

  const prevUserSelect = root.style.userSelect;
  root.style.userSelect = "none";

  return (): void => {
    doc.removeEventListener("selectstart", onSelectStart, { capture: true });
    root.style.userSelect = prevUserSelect;
  };
}

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, options?: DragListenerOptions) {
  // Support legacy boolean parameter for backward compatibility
  const stopOnMouseLeave = options?.stopOnMouseLeave ?? false;
  const graph = options?.graph;
  const dragCursor = options?.dragCursor;
  const component = options?.component;
  const autopanning = options?.autopanning ?? Boolean(graph);
  const suppressTextSelection = options?.suppressTextSelection ?? true;
  // Use provided threshold, or get from graph settings, or default to 0
  const threshold = options?.threshold ?? graph?.rootStore.settings.$dragThreshold.value ?? 0;

  const dragDocument = getDragListenerDocument(document);
  let releaseTextSelection: (() => void) | null = null;

  const ensureTextSelectionSuppressed = (): void => {
    if (!suppressTextSelection || releaseTextSelection !== null) {
      return;
    }
    releaseTextSelection = installTextSelectionSuppression(dragDocument, graph);
  };

  const cleanupTextSelection = (): void => {
    releaseTextSelection?.();
    releaseTextSelection = null;
  };

  let started = false;
  let finished = false;
  let thresholdExceeded = false;
  let startX: number | null = null;
  let startY: number | null = null;
  let lastMouseEvent: MouseEvent | undefined;
  const emitter = new Emitter();
  // Removes every DOM listener of this drag session at once
  const listeners = new AbortController();
  const { signal } = listeners;
  const mousemoveBinded = (event: MouseEvent) => {
    lastMouseEvent = event;
    mousemove(emitter, event);
  };
  const mouseupBinded = mouseup.bind(null, emitter);

  // Re-emit drag update when committed camera state changes during auto-panning
  const handleCameraChange = (): void => {
    if (started && !finished && lastMouseEvent) {
      emitter.emit(EVENTS.DRAG_UPDATE, lastMouseEvent);
    }
  };

  const unsubscribeCamera = graph && autopanning ? graph.$camera.subscribe(handleCameraChange) : undefined;

  /**
   * Check if the mouse has moved beyond the threshold distance
   */
  const checkThreshold = (event: MouseEvent): boolean => {
    if (startX === null || startY === null) {
      startX = event.clientX;
      startY = event.clientY;
    }

    if (threshold <= 0) {
      return true;
    }

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance >= threshold;
  };

  /**
   * Start the actual drag operation
   */
  const startDrag = (event: MouseEvent): void => {
    started = true;
    thresholdExceeded = true;
    lastMouseEvent = event;
    if (suppressTextSelection) {
      ensureTextSelectionSuppressed();
      event.preventDefault();
      dragDocument.defaultView?.getSelection()?.removeAllRanges();
    }

    // Setup drag state
    if (graph) {
      if (autopanning) {
        graph.cameraService.enableAutoPanning();
      }
      if (dragCursor) {
        graph.lockCursor(dragCursor);
      }
      if (component) {
        graph.getGraphLayer().captureEvents(component);
      }
    }

    emitter.emit(EVENTS.DRAG_START, event);
    document.addEventListener("mousemove", mousemoveBinded, { signal });
  };

  /**
   * Handle mousemove events while accumulating threshold
   */
  const handleThresholdMove = (event: MouseEvent): void => {
    if (finished || thresholdExceeded) {
      return;
    }

    if (checkThreshold(event)) {
      // Threshold exceeded - start drag and remove this listener
      document.removeEventListener("mousemove", handleThresholdMove, { capture: true });
      startDrag(event);
    }
  };

  const cleanup = (): void => {
    cleanupTextSelection();
    unsubscribeCamera?.();
    listeners.abort();
  };

  const cleanupDragState = () => {
    if (graph) {
      if (autopanning) {
        graph.cameraService.disableAutoPanning();
      }
      if (dragCursor) {
        graph.unlockCursor();
      }
      if (component) {
        graph.getGraphLayer().releaseCapture();
      }
    }
  };

  /**
   * Ends the drag session without a mouseup. A started drag emits DRAG_CANCEL with the last mouse event
   * it received; a drag that has not crossed the threshold yet stops silently.
   */
  const cancel = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    try {
      if (started) {
        emitter.emit(EVENTS.DRAG_CANCEL, lastMouseEvent);
      }
    } finally {
      // A throwing listener must not leave the cursor, auto-panning or DOM listeners behind
      if (started) {
        cleanupDragState();
      }
      cleanup();
      emitter.destroy();
    }
  };

  /**
   * Ends the drag session on mouseup (or mouseleave with stopOnMouseLeave). A started drag emits DRAG_END.
   */
  const finish = (event: MouseEvent): void => {
    finished = true;
    try {
      if (started) {
        mouseupBinded(event);
      }
    } finally {
      if (started) {
        cleanupDragState();
      }
      cleanup();
    }
  };

  if (stopOnMouseLeave) {
    document.addEventListener("mouseleave", finish, { once: true, capture: true, signal });
  }

  // If threshold > 0, we need to accumulate movement before starting drag
  if (threshold > 0) {
    document.addEventListener("mousemove", handleThresholdMove, { capture: true, signal });
  } else {
    // No threshold - start drag on first mousemove (original behavior)
    document.addEventListener(
      "mousemove",
      (event: Event) => {
        if (finished) {
          return;
        }
        startDrag(event as MouseEvent);
      },
      { once: true, capture: true, signal }
    );
  }

  document.addEventListener("mouseup", finish, { once: true, capture: true, signal });

  // A new press while this session is alive means its mouseup was lost (or another button was pressed)
  document.addEventListener("mousedown", cancel, { once: true, capture: true, signal });

  // The release can be lost while the page has no focus, so a drag must not outlive it
  dragDocument.defaultView?.addEventListener("blur", cancel, { signal });
  dragDocument.addEventListener(
    "visibilitychange",
    () => {
      if (dragDocument.visibilityState === "hidden") {
        cancel();
      }
    },
    { signal }
  );

  emitter.on("cancel", cancel);

  return emitter;
}

/**
 * Cancels a drag session created by dragListener: a started drag emits DRAG_CANCEL instead of DRAG_END,
 * and the session ignores the rest of the gesture.
 */
export function stopDragListening(emitter: Emitter) {
  emitter.emit("cancel");
}

function mousemove(emitter: Emitter, event: MouseEvent) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

function mouseup(emitter: Emitter, event: MouseEvent) {
  try {
    emitter.emit(EVENTS.DRAG_END, event);
  } finally {
    emitter.destroy();
  }
}
