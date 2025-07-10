import { Emitter } from "../Emitter";
import { EVENTS } from "../types/events";

export function dragListener(document: Document | HTMLDivElement | HTMLCanvasElement, stopOnPointerLeave = false) {
  let started = false;
  let finished = false;
  const emitter = new Emitter();
  const pointermoveBinded = pointermove.bind(null, emitter);
  const pointerupBinded = pointerup.bind(null, emitter);

  if (stopOnPointerLeave) {
    document.addEventListener(
      "pointerleave",
      (event) => {
        if (started) {
          pointerupBinded(event);
        }
        finished = true;
        document.removeEventListener("pointermove", pointermoveBinded);
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
      document.addEventListener("pointermove", pointermoveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "pointerup",
    (event) => {
      if (started) {
        pointerupBinded(event);
      }
      finished = true;
      document.removeEventListener("pointermove", pointermoveBinded);
    },
    { once: true, capture: true }
  );

  document.addEventListener(
    "pointerdown",
    () => {
      document.removeEventListener("pointermove", pointermoveBinded);
    },
    { once: true, capture: true }
  );

  return emitter;
}

function pointermove(emitter: Emitter, event: PointerEvent) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}

function pointerup(emitter: Emitter, event: PointerEvent) {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}
