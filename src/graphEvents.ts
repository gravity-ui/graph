import { EventedComponent } from "./components/canvas/EventedComponent/EventedComponent";
import { GraphState } from "./graph";
import { TGraphColors, TGraphConstants } from "./graphConfig";
import { TCameraState } from "./services/camera/CameraService";
import { TPoint } from "./utils/types/shapes";

export type GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>;

export type GraphGestureEvent = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: any; // HammerInput
  pointerPressed?: boolean;
  center?: TPoint;
  deltaX?: number;
  deltaY?: number;
  scale?: number;
  rotation?: number;
}>;

export type GraphEventParams<T extends CustomEvent> = T extends CustomEvent ? T["detail"] : never;

export const extractNativeGraphMouseEvent = (event: GraphMouseEvent) => {
  return event.detail.sourceEvent instanceof MouseEvent ? event.detail.sourceEvent : null;
};

export type GraphMouseEventNames = "mousedown" | "click" | "dblclick" | "mouseenter" | "mouseleave";

export type GraphGestureEventNames = "tap" | "hover" | "pan" | "pinch";

export interface BaseGraphEventDefinition {
  mousedown: (event: GraphMouseEvent) => void;
  click: (event: GraphMouseEvent) => void;
  dblclick: (event: GraphMouseEvent) => void;
  mouseenter: (event: GraphMouseEvent) => void;
  mouseleave: (event: GraphMouseEvent) => void;
}

export interface GestureGraphEventDefinition {
  tap: (event: GraphGestureEvent) => void;
  hover: (event: GraphGestureEvent) => void;
  panstart: (event: GraphGestureEvent) => void;
  panmove: (event: GraphGestureEvent) => void;
  panend: (event: GraphGestureEvent) => void;
  pinchstart: (event: GraphGestureEvent) => void;
  pinchmove: (event: GraphGestureEvent) => void;
  pinchend: (event: GraphGestureEvent) => void;
}

export interface GraphEventsDefinitions extends BaseGraphEventDefinition, GestureGraphEventDefinition {
  "camera-change": (event: CustomEvent<TCameraState>) => void;
  "constants-changed": (event: CustomEvent<{ constants: TGraphConstants }>) => void;
  "colors-changed": (event: CustomEvent<{ colors: TGraphColors }>) => void;
  "state-change": (event: CustomEvent<{ state: GraphState }>) => void;
}

const graphMouseEvents = ["mousedown", "click", "dblclick", "mouseenter", "mousemove", "mouseleave"];

export type UnwrapGraphEvents<
  Key extends keyof GraphEventsDefinitions,
  T extends GraphEventsDefinitions[Key] = GraphEventsDefinitions[Key],
  P extends Parameters<T>[0] = Parameters<T>[0],
> = P extends CustomEvent ? P : never;

export type UnwrapGraphEventsDetail<
  Key extends keyof GraphEventsDefinitions,
  T extends GraphEventsDefinitions[Key] = GraphEventsDefinitions[Key],
  P extends Parameters<T>[0] = Parameters<T>[0],
> = UnwrapGraphEvents<Key, T, P>["detail"];

export type SelectionEvent<T> = CustomEvent<{
  /** List of next selection state */
  list: T[];
  /** Details of changes */
  changes: {
    /* A list of recently selected items */
    add: T[];
    /* A list of recently unselected items */
    removed: T[];
  };
}>;

export function isNativeGraphEventName(eventType: string): eventType is GraphMouseEventNames {
  return graphMouseEvents.includes(eventType);
}
