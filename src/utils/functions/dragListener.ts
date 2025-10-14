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
};

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, options?: DragListenerOptions) {
  // Support legacy boolean parameter for backward compatibility
  const stopOnMouseLeave = options?.stopOnMouseLeave ?? false;
  const graph = options?.graph;
  const dragCursor = options?.dragCursor;
  const component = options?.component;
  const autopanning = options?.autopanning ?? Boolean(graph);

  let started = false;
  let finished = false;
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

  const cleanup = () => {
    if (graph && autopanning) {
      graph.off("camera-change", handleCameraChange);
    }
    document.removeEventListener("mousemove", mousemoveBinded);
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

  document.addEventListener(
    "mousemove",
    (event) => {
      if (finished) {
        return;
      }
      started = true;

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
    },
    { once: true, capture: true }
  );

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

  return emitter;
}

function mousemove(emitter: Emitter, event: MouseEvent) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

function mouseup(emitter: Emitter, event: MouseEvent) {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}
