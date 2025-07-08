import { Emitter } from "../Emitter";
import { EVENTS } from "../types/events";

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, stopOnMouseLeave = false) {
  let started = false;
  let finished = false;
  const emitter = new Emitter();
  const mousemoveBinded = mousemove.bind(null, emitter);
  const mouseupBinded = mouseup.bind(null, emitter);

  if (stopOnMouseLeave) {
    document.addEventListener(
      "pointerleave",
      (event) => {
        if (started) {
          mouseupBinded(event);
        }
        finished = true;
        document.removeEventListener("pointermove", mousemoveBinded);
      },
      { once: true, capture: true }
    );
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (finished) {
        return;
      }
      started = true;
      emitter.emit(EVENTS.DRAG_START, event);
      document.addEventListener("pointermove", mousemoveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "pointerup",
    (event) => {
      if (started) {
        mouseupBinded(event);
      }
      finished = true;
      document.removeEventListener("pointermove", mousemoveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "pointerdown",
    () => {
      document.removeEventListener("pointermove", mousemoveBinded);
    },
    { once: true, capture: true }
  );

  return emitter;
}

function mousemove(emitter: Emitter, event: PointerEvent) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

function mouseup(emitter: Emitter, event: PointerEvent) {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}
