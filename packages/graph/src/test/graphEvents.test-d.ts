// Checked by the graph package typecheck.
import type { EventedComponent } from "../components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "../graph";

declare const graph: Graph;
declare const component: EventedComponent;

declare const related: (target: EventedComponent | undefined) => void;
declare const pointer: (native: PointerEvent | undefined) => void;

for (const type of ["pointerenter", "pointerleave", "pointerover", "pointerout"] as const) {
  graph.on(type, (event) => related(event.relatedTarget));
  component.on(type, (event) => pointer(event.sourceEvent));
}
for (const type of ["press", "release", "click", "dblclick", "dragstart", "pinch", "longpress"] as const) {
  graph.on(type, (event) => pointer(event.event));
  component.on(type, (event) => pointer(event.event));
}

declare const name: "pointerenter" | "press";
component.on(name, (event) => {
  if (event.type === "pointerenter") pointer(event.sourceEvent);
  else pointer(event.event);
});
const captureOptions = { capture: true, once: true } as const;
// @ts-expect-error Capture is graph-only, including options shared between subscriptions.
component.on("press", () => {}, captureOptions);
// @ts-expect-error Mouse aliases do not belong to graph gestures.
graph.on("mousedown", () => {});
// @ts-expect-error Component hover uses pointer transitions.
component.on("mouseenter", () => {});
// @ts-expect-error Semantic clicks subscribe through on().
component.addEventListener("click", () => {});
