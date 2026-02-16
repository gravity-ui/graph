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
};

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, options?: DragListenerOptions) {
  // Support legacy boolean parameter for backward compatibility
  const stopOnMouseLeave = options?.stopOnMouseLeave ?? false;
  const graph = options?.graph;
  const dragCursor = options?.dragCursor;
  const component = options?.component;
  const autopanning = options?.autopanning ?? Boolean(graph);
  // Use provided threshold, or get from graph settings, or default to 0
  const threshold = options?.threshold ?? graph?.rootStore.settings.$dragThreshold.value ?? 0;

  let started = false;
  let finished = false;
  let thresholdExceeded = false;
  let startX: number | null = null;
  let startY: number | null = null;
  let lastMouseEvent: MouseEvent | undefined;
  const emitter = new Emitter();
  const mousemoveBinded = (event: MouseEvent) => {
    lastMouseEvent = event;
    mousemove(emitter, event);
  };
  const mouseupBinded = mouseup.bind(null, emitter);

  // Handle camera-change for auto-panning synchronization
  const handleCameraChange = () => {
    if (started && !finished && lastMouseEvent) {
      // Re-emit drag update with last known mouse position
      emitter.emit(EVENTS.DRAG_UPDATE, lastMouseEvent);
    }
  };

  if (graph && autopanning) {
    graph.on("camera-change", handleCameraChange);
  }

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
    document.addEventListener("mousemove", mousemoveBinded);
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

  const cleanup = () => {
    if (graph && autopanning) {
      graph.off("camera-change", handleCameraChange);
    }
    document.removeEventListener("mousemove", mousemoveBinded);
    // Also remove threshold listener if it was added
    if (threshold > 0) {
      document.removeEventListener("mousemove", handleThresholdMove, { capture: true });
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

  if (stopOnMouseLeave) {
    document.addEventListener(
      "mouseleave",
      (event) => {
        if (started) {
          mouseupBinded(event);
          cleanupDragState();
        }
        finished = true;
        cleanup();
      },
      { once: true, capture: true }
    );
  }

  // If threshold > 0, we need to accumulate movement before starting drag
  if (threshold > 0) {
    document.addEventListener("mousemove", handleThresholdMove, { capture: true });
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
      { once: true, capture: true }
    );
  }

  document.addEventListener(
    "mouseup",
    (event) => {
      if (started) {
        mouseupBinded(event);
        cleanupDragState();
      }
      finished = true;
      cleanup();
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "mousedown",
    () => {
      cleanup();
    },
    { once: true, capture: true }
  );

  emitter.on("cancel", () => {
    if (started) {
      cleanupDragState();
    }
    finished = true;
    cleanup();
  });

  return emitter;
}

export function stopDragListening(emitter: Emitter) {
  emitter.emit("cancel");
}

function mousemove(emitter: Emitter, event: MouseEvent) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

function mouseup(emitter: Emitter, event: MouseEvent) {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}
