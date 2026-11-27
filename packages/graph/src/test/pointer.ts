import type { EventedComponent } from "../components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "../graph";
import type { GraphHoverEvents } from "../graphEvents";
import { createGraphEvent } from "../lib/graphEventDispatch";

export function hoverEvent<K extends keyof GraphHoverEvents>(
  type: K,
  target: EventedComponent,
  sourceEvent?: PointerEvent
) {
  return createGraphEvent(type, target, {
    relatedTarget: undefined,
    cause: sourceEvent ? "pointer" : "scene",
    pointerPressed: false,
    sourceEvent,
  } as const);
}

/** A connected surface lets presses and releases travel through document capture as they do in the browser. */
const roots: HTMLDivElement[] = [];
export function pointerRoot(): HTMLDivElement {
  const root = document.body.appendChild(document.createElement("div"));
  jest.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 800));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

export function pointer(
  surface: Graph | EventTarget,
  type: string,
  init: PointerEventInit = {},
  time?: number
): PointerEvent {
  const target = "layers" in surface ? surface.layers.$root : surface;
  if (!target) throw new Error("Pointer input requires a mounted graph");
  const event = new PointerEvent(type, {
    pointerType: "mouse",
    pointerId: 1,
    isPrimary: true,
    bubbles: type !== "pointerenter" && type !== "pointerleave",
    cancelable: true,
    buttons: type === "pointerdown" ? 1 : 0,
    ...init,
  });
  if (time !== undefined) Object.defineProperty(event, "timeStamp", { value: time });
  target.dispatchEvent(event);
  return event;
}
