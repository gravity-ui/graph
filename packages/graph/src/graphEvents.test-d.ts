// Type test: checked by `pnpm --dir packages/graph run typecheck`, not run by Jest.
import type { EventedComponent } from "./components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "./graph";

declare const graph: Graph;
const related = (component: EventedComponent | undefined): EventedComponent | undefined => component;

// The graph's hover events name the other side of the target change (D5).
graph.on("mouseenter", (event) => related(event.detail.relatedTarget));
graph.on("mouseleave", (event) => related(event.detail.relatedTarget));
