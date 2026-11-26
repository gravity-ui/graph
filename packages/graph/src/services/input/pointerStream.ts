import { addTypedEventListener, reportListenerError } from "../../utils/eventListener";

// DOM button numbers and buttons bit positions differ for the middle and right buttons.
const buttonMasks = [1, 4, 2, 8, 16];
export function holdsMouseButton(event: PointerEvent, button: number): boolean {
  // eslint-disable-next-line no-bitwise
  return Boolean(event.buttons & buttonMasks[button]);
}

type PointerSurface = Document | HTMLElement;
type PointerSample = "down" | "move" | "up" | "leave" | "lostcapture" | "cancel";
type PointerListener = (sample: PointerSample, event?: PointerEvent) => void;

type Channel = { listeners: { handler: PointerListener; signal: AbortSignal }[]; controller: AbortController };
const channels = new WeakMap<PointerSurface, Channel>();

/** One document capture stream shared by recognition and active drags, including out-of-root releases. */
export function watchPointers(surface: PointerSurface, listener: PointerListener, signal: AbortSignal): void {
  if (signal.aborted) return;
  let channel = channels.get(surface);
  if (!channel) {
    channel = { listeners: [], controller: new AbortController() };
    const current = channel;
    const { controller } = current;
    channels.set(surface, channel);
    const options = { capture: true, signal: controller.signal };
    const doc = "defaultView" in surface ? surface : surface.ownerDocument;
    const deliver = (sample: PointerSample, event?: PointerEvent) => {
      // A newly accepted drag already receives the crossing sample from the recognizer.
      for (const { handler, signal: lifetime } of current.listeners) {
        if (lifetime.aborted) continue;
        try {
          handler(sample, event);
        } catch (error) {
          reportListenerError(error);
        }
      }
    };
    const pointer = (sample: PointerSample) => (event: PointerEvent) => deliver(sample, event);
    addTypedEventListener<PointerEvent>(surface, "pointerdown", pointer("down"), options);
    addTypedEventListener<PointerEvent>(surface, "pointermove", pointer("move"), options);
    addTypedEventListener<PointerEvent>(surface, "pointerup", pointer("up"), options);
    addTypedEventListener<PointerEvent>(surface, "pointerleave", pointer("leave"), options);
    addTypedEventListener<PointerEvent>(surface, "pointercancel", pointer("cancel"), options);
    addTypedEventListener<PointerEvent>(surface, "lostpointercapture", pointer("lostcapture"), options);

    doc.defaultView?.addEventListener("blur", () => deliver("cancel"), { signal: controller.signal });
    doc.addEventListener(
      "visibilitychange",
      () => {
        if (doc.visibilityState === "hidden") deliver("cancel");
      },
      options
    );
    doc.addEventListener(
      "keydown",
      (event) => {
        if (!event.defaultPrevented && event.key === "Escape") deliver("cancel");
      },
      { signal: controller.signal }
    );
  }

  const current = channel;
  const entry = { handler: listener, signal };
  current.listeners = [...current.listeners, entry];
  signal.addEventListener(
    "abort",
    () => {
      current.listeners = current.listeners.filter((item) => item !== entry);
      if (!current.listeners.length) {
        channels.delete(surface);
        current.controller.abort();
      }
    },
    { once: true }
  );
}
