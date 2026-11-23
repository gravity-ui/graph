import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { CursorLayerCursorTypes } from "../../components/canvas/layers/cursorLayer/CursorLayer";
import { Graph } from "../../graph";
import { Emitter } from "../Emitter";
import { TypedEventListener, addTypedEventListener, removeTypedEventListener } from "../eventListener";
import { EVENTS } from "../types/events";

export type DragEvents = {
  [EVENTS.DRAG_START]: (event: MouseEvent) => void;
  [EVENTS.DRAG_UPDATE]: (event: MouseEvent) => void;
  [EVENTS.DRAG_END]: (event: MouseEvent) => void;
  [EVENTS.DRAG_CANCEL]: (event: MouseEvent, fallbackToEnd: boolean) => void;
  cancel: (fallbackToEnd?: boolean) => void;
};
export type DragEmitter = Emitter<DragEvents>;

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
  /** Runs after listeners and drag resources are released, including for a press below the threshold. */
  onSessionEnd?: () => void;
};

function getDragListenerDocument(node: Document | HTMLDivElement | HTMLCanvasElement): Document {
  return "defaultView" in node ? node : node.ownerDocument;
}

const textSelectionLocks = new WeakMap<HTMLElement, { count: number; previous: string }>();

/** Prevents browser text selection for the duration of a drag gesture. */
function installTextSelectionSuppression(doc: Document, graph?: Graph): () => void {
  const root = graph?.getGraphCanvas() ?? doc.documentElement;
  doc.defaultView?.getSelection()?.removeAllRanges();

  const onSelectStart = (event: Event): void => {
    event.preventDefault();
  };
  doc.addEventListener("selectstart", onSelectStart, { capture: true });

  let lock = textSelectionLocks.get(root);
  if (!lock) {
    lock = { count: 0, previous: root.style.userSelect };
    textSelectionLocks.set(root, lock);
    root.style.userSelect = "none";
  }
  lock.count++;

  return (): void => {
    doc.removeEventListener("selectstart", onSelectStart, { capture: true });
    if (--lock.count === 0) {
      root.style.userSelect = lock.previous;
      textSelectionLocks.delete(root);
    }
  };
}

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, options?: DragListenerOptions) {
  const controller = new AbortController();
  const on = <K extends keyof DocumentEventMap>(
    type: K,
    listener: TypedEventListener<DocumentEventMap[K]>,
    options?: AddEventListenerOptions | boolean
  ) =>
    addTypedEventListener(document, type, listener, {
      ...(typeof options === "boolean" ? { capture: options } : options),
      signal: controller.signal,
    });
  const off = <K extends keyof DocumentEventMap>(
    type: K,
    listener: TypedEventListener<DocumentEventMap[K]>,
    options?: EventListenerOptions | boolean
  ) => removeTypedEventListener(document, type, listener, options);

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
  const emitter = new Emitter<DragEvents>();
  const mousemoveBinded = (event: MouseEvent) => {
    if (finished) return;
    lastMouseEvent = event;
    emitter.emit(EVENTS.DRAG_UPDATE, event);
  };

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
    on("mousemove", mousemoveBinded);
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
      off("mousemove", handleThresholdMove, { capture: true });
      startDrag(event);
    }
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

  const finish = (event?: MouseEvent, fallbackToEnd = true): void => {
    if (finished) return;
    finished = true;
    try {
      if (started && event) emitter.emit(EVENTS.DRAG_END, event);
      else if (started && lastMouseEvent) emitter.emit(EVENTS.DRAG_CANCEL, lastMouseEvent, fallbackToEnd);
    } finally {
      try {
        if (started) cleanupDragState();
      } finally {
        controller.abort();
        cleanupTextSelection();
        unsubscribeCamera?.();
        emitter.destroy();
        options?.onSessionEnd?.();
      }
    }
  };

  if (stopOnMouseLeave) {
    on("mouseleave", finish, { once: true, capture: true });
  }

  // If threshold > 0, we need to accumulate movement before starting drag
  if (threshold > 0) {
    on("mousemove", handleThresholdMove, { capture: true });
  } else {
    // No threshold - start drag on first mousemove (original behavior)
    on(
      "mousemove",
      (event) => {
        if (finished) {
          return;
        }
        startDrag(event);
      },
      { once: true, capture: true }
    );
  }

  on("mouseup", finish, { once: true, capture: true });
  // The release may have happened outside the page.
  on("mousedown", () => finish(), { once: true, capture: true });
  dragDocument.defaultView?.addEventListener("blur", () => finish(), { signal: controller.signal });
  dragDocument.addEventListener(
    "visibilitychange",
    () => {
      if (dragDocument.visibilityState === "hidden") finish();
    },
    { signal: controller.signal }
  );
  emitter.on("cancel", (fallbackToEnd = false) => finish(undefined, fallbackToEnd));

  return emitter;
}

export function stopDragListening(emitter: DragEmitter, fallbackToEnd = true) {
  emitter.emit("cancel", fallbackToEnd);
}
