import type { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "../../graph";
import type { GraphEventContext } from "../../graphEvents";
import { createGraphEvent, deliverGraphEvent, graphEventListenerSignals } from "../../lib/graphEventDispatch";
import type { CameraPoint } from "../camera/CameraPoint";
import type { DragOperationOptions } from "../drag";
import type { TSceneLevel } from "../scene/types";

interface GraphInputEvent extends GraphEventContext<string> {
  readonly event: PointerEvent;
  readonly pointers: readonly PointerEvent[];
  readonly point: CameraPoint;
}

export interface GraphPressEvent extends GraphInputEvent {
  readonly type: "press";
}

type PointerDragCallback = (event: PointerEvent, world: [number, number]) => void;

export type GraphDragOperation = Pick<
  DragOperationOptions,
  "cursor" | "autopanning" | "component" | "suppressTextSelection"
> & {
  owner: string;
  start?: PointerDragCallback;
  move?: (event: PointerEvent, world: [number, number], cause: "pointer" | "scene") => void;
  end?: PointerDragCallback;
  cancel?: PointerDragCallback;
};

export interface GraphDragStartEvent extends GraphInputEvent {
  readonly type: "dragstart";
  readonly start: CameraPoint;
  readonly pressEvent: PointerEvent;
  /** Offer one operation during dispatch. The returned function withdraws or cancels it. */
  claim(operation: GraphDragOperation): () => void;
}

export interface GraphReleaseEvent extends GraphInputEvent {
  readonly type: "release";
}

export interface GraphClickEvent extends GraphInputEvent {
  readonly type: "click";
}

export interface GraphPinchEvent extends GraphInputEvent {
  readonly type: "pinch";
  readonly phase: "start" | "update" | "end" | "cancel";
  /** Participating contacts in down order. The event point is their midpoint. */
  readonly pointers: readonly [PointerEvent, PointerEvent];
  /** Separation in CSS pixels. */
  readonly distance: number;
}

export type GestureEvents = {
  press: GraphPressEvent;
  release: GraphReleaseEvent;
  click: GraphClickEvent;
  dblclick: GraphInputEvent & { readonly type: "dblclick" };
  dragstart: GraphDragStartEvent;
  longpress: GraphInputEvent & { readonly type: "longpress" };
  pinch: GraphPinchEvent;
};
export type GestureName = keyof GestureEvents;

type DragStart = {
  start: CameraPoint;
  pressEvent: PointerEvent;
  claim(operation: GraphDragOperation, subscriberSignals: readonly AbortSignal[]): () => void;
};

type RecognizedInput =
  | Exclude<GestureName, "pinch" | "dragstart">
  | DragStart
  | Pick<GraphPinchEvent, "type" | "phase" | "distance" | "pointers">;

function createInputEvent(
  target: Graph | EventedComponent,
  event: PointerEvent,
  point: CameraPoint,
  kind: RecognizedInput
): GestureEvents[GestureName] {
  if (typeof kind === "string") return createGraphEvent(kind, target, { event, point, pointers: [event] });
  if ("phase" in kind) return createGraphEvent("pinch", target, { event, point, ...kind });

  const drag = createGraphEvent("dragstart", target, {
    event,
    point,
    pointers: [event],
    start: kind.start,
    pressEvent: kind.pressEvent,
  });
  return Object.assign(drag, {
    claim(operation: GraphDragOperation) {
      if (drag.currentTarget) return kind.claim(operation, graphEventListenerSignals(drag));
      console.warn("dragstart.claim() must be called during event delivery:", operation.owner);
      return () => {};
    },
  });
}

export function dispatchGesture(
  graph: Graph,
  path: readonly EventedComponent[],
  event: PointerEvent,
  point: CameraPoint,
  level: TSceneLevel,
  kind: RecognizedInput,
  clickDefault?: (event: GraphClickEvent, delivered: number) => void
) {
  let delivered = 0;
  const gesture = createInputEvent(path[0] ?? graph, event, point, kind);
  deliverGraphEvent(graph, gesture, true, level);
  for (const node of path) {
    if (gesture.propagationStopped) break;
    delivered++;
    if (node.isInteractive()) deliverGraphEvent(node, gesture, false, level);
  }
  if (!gesture.propagationStopped) deliverGraphEvent(graph, gesture, false, level);
  if (gesture.type === "click" && !gesture.defaultPrevented) clickDefault?.(gesture, delivered);
  return gesture;
}
