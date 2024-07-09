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
      "mouseleave",
      (event) => {
        if (started) {
          mouseupBinded(event);
        }
        finished = true;
        document.removeEventListener("mousemove", mousemoveBinded);
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
      }
      finished = true;
      document.removeEventListener("mousemove", mousemoveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "mousedown",
    () => {
      document.removeEventListener("mousemove", mousemoveBinded);
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
