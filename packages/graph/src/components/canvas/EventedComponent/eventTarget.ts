import type { Class } from "../../../utils/types/classes";
import { GraphComponent } from "../GraphComponent";

import type { EventedComponent } from "./EventedComponent";

/**
 * The graph component GraphLayer dispatched each pointer event to, per event object: written at the dispatch
 * boundary before the graph's bus and the parent walk, read by `getEventTarget`. A WeakMap keeps no event alive, and a
 * nested dispatch writes its own event, not the one still walking.
 */
const eventTargets = new WeakMap<Event, GraphComponent>();

const HOVER_EVENT_TYPES: ReadonlySet<string> = new Set(["mouseenter", "mouseleave", "mouseover", "mouseout"]);

/**
 * @internal GraphLayer records the component it dispatches `event` to, before it emits the graph's event and before
 * the component's parent walk. A target that is not a graph component (the camera, over empty space) records none.
 */
export function recordEventTarget(event: Event, target: EventedComponent | undefined): void {
  if (target instanceof GraphComponent) {
    eventTargets.set(event, target);
  } else {
    eventTargets.delete(event);
  }
}

/** The target in a hover event's detail (`TGraphHoverDetail`), when it is a graph component. */
function hoverTargetOf(event: Event): GraphComponent | undefined {
  if (!HOVER_EVENT_TYPES.has(event.type) || !(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  if (typeof detail !== "object" || detail === null || !("target" in detail)) return undefined;
  return detail.target instanceof GraphComponent ? detail.target : undefined;
}

/**
 * The graph component a pointer event hit (D5): a block, an anchor, a child component, a connection or a group. For
 * each pointer event GraphLayer dispatches to components (`mousedown`, `mouseup`, `click`, `dblclick`, `touchstart`,
 * `touchend`, and the hover events `mouseenter`, `mouseleave`, `mouseover` and `mouseout`), it is the component
 * GraphLayer dispatched the event to: the one under the pointer, the captured one during a gesture
 * (`GraphLayer.captureEvents`), and for a click or a dblclick the one the press started on. It is the same in every
 * handler along the event's parent walk, and after the dispatch.
 *
 * The events stay native: a press, a release or a click is the browser's event (an emulated click is a copy of it,
 * whose DOM `target` is null), with its modifiers, coordinates and numeric `detail` (the click count). Hover events
 * carry `detail.target` and `detail.relatedTarget` as well (`TGraphHoverDetail`); for a hover `CustomEvent` that
 * GraphLayer did not dispatch, this reads its `detail.target`.
 *
 * GraphLayer records the target before the graph's bus gets the event: there `event.detail.target` names it, and for a
 * press or a click `getEventTarget(event.detail.sourceEvent)` returns it too, also for a press the bus then prevents
 * (the camera's pan takes a press on a component that is not draggable and has no draggable ancestor), which reaches
 * no component.
 *
 * Undefined for other events, for an event dispatched straight at a component (`component.dispatchEvent(event)`), and
 * where the target is not a graph component: the camera, over empty space. With a class, it returns the target only
 * when it is an instance of that class.
 *
 * @example
 * ```ts
 * block.addEventListener("click", (event) => {
 *   if (getEventTarget(event, RunButton)) return; // the run button's click bubbled up
 *   // a click on the block itself
 * });
 * ```
 */
export function getEventTarget(event: Event): GraphComponent | undefined;
export function getEventTarget<T extends GraphComponent>(event: Event, type: Class<T>): T | undefined;
export function getEventTarget<T extends GraphComponent>(event: Event, type?: Class<T>): GraphComponent | undefined {
  const target = eventTargets.get(event) ?? hoverTargetOf(event);
  if (type === undefined) return target;
  return target instanceof type ? target : undefined;
}
