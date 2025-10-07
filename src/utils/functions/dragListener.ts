import { Emitter } from "../Emitter";
import { EVENTS } from "../types/events";

import { isTouchDevice } from "./touchUtils";

/**
 * Creates a drag listener that works with both mouse and touch events
 * @param {Document | HTMLDivElement | HTMLCanvasElement} document - Target element to listen for events
 * @param {boolean} stopOnMouseLeave - Whether to stop dragging when mouse/touch leaves the element
 * @returns {Emitter} Event emitter that emits DRAG_START, DRAG_UPDATE, and DRAG_END events
 */
export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, stopOnMouseLeave = false) {
  let started = false;
  let finished = false;
  const emitter = new Emitter();
  const isTouch = isTouchDevice();

  const moveBinded = move.bind(null, emitter);
  const endBinded = end.bind(null, emitter);

  // Event names based on device type
  const moveEventName = isTouch ? "touchmove" : "mousemove";
  const endEventName = isTouch ? "touchend" : "mouseup";
  const startEventName = isTouch ? "touchstart" : "mousedown";
  const leaveEventName = isTouch ? "touchend" : "mouseleave";

  if (stopOnMouseLeave) {
    document.addEventListener(
      leaveEventName,
      (event) => {
        if (started) {
          endBinded(event);
        }
        finished = true;
        document.removeEventListener(moveEventName, moveBinded);
      },
      { once: true, capture: true }
    );
  }

  // For touch devices, we also need to handle touchcancel
  if (isTouch) {
    document.addEventListener(
      "touchend",
      (event) => {
        if (started) {
          endBinded(event);
        }
        finished = true;
        document.removeEventListener(moveEventName, moveBinded);
      },
      { once: true, capture: true }
    );
  }

  document.addEventListener(
    moveEventName,
    (event) => {
      if (finished) {
        return;
      }
      // Prevent default behavior for touch events to avoid scrolling
      if (isTouch) {
        event.preventDefault();
      }
      started = true;
      emitter.emit(EVENTS.DRAG_START, event);
      document.addEventListener(moveEventName, moveBinded);
    },
    { once: true, capture: true, passive: false }
  );

  document.addEventListener(
    endEventName,
    (event) => {
      if (started) {
        endBinded(event);
      }
      finished = true;
      document.removeEventListener(moveEventName, moveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    startEventName,
    () => {
      document.removeEventListener(moveEventName, moveBinded);
    },
    { once: true, capture: true }
  );

  return emitter;
}

/**
 * Handles move events during drag operation
 * @param {Emitter} emitter - Event emitter instance
 * @param {MouseEvent | TouchEvent} event - Move event (mouse or touch)
 * @returns {void}
 */
function move(emitter: Emitter, event: MouseEvent | TouchEvent): void {
  // Prevent default behavior for touch events to avoid scrolling
  if ("touches" in event) {
    // event.preventDefault();
  }
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

/**
 * Handles end events for drag operation
 * @param {Emitter} emitter - Event emitter instance
 * @param {MouseEvent | TouchEvent} event - End event (mouse or touch)
 * @returns {void}
 */
function end(emitter: Emitter, event: MouseEvent | TouchEvent): void {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}
