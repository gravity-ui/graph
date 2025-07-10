import { EventedComponent } from "./components/canvas/EventedComponent/EventedComponent";
import { GraphState } from "./graph";
import { TGraphColors, TGraphConstants } from "./graphConfig";
import { TCameraState } from "./services/camera/CameraService";

export type GraphPointerEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>;
export type GraphEventParams<T extends CustomEvent> = T extends CustomEvent ? T["detail"] : never;

export const extractNativeGraphPointerEvent = (event: GraphPointerEvent) => {
  return event.detail.sourceEvent instanceof PointerEvent ? event.detail.sourceEvent : null;
};

export type GraphPointerEventNames = "click" | "dblclick" | "pointerdown" | "pointerenter" | "pointerleave";

export type GraphEventNames = GraphPointerEventNames;

export interface BaseGraphEventDefinition {
  click: (event: GraphPointerEvent) => void;
  dblclick: (event: GraphPointerEvent) => void;
  pointerdown: (event: GraphPointerEvent) => void;
  pointerenter: (event: GraphPointerEvent) => void;
  pointerleave: (event: GraphPointerEvent) => void;
}

export type UnwrapBaseGraphEvents<
  Key extends keyof BaseGraphEventDefinition = keyof BaseGraphEventDefinition,
  T extends BaseGraphEventDefinition[Key] = BaseGraphEventDefinition[Key],
  P extends Parameters<T>[0] = Parameters<T>[0],
> = P extends CustomEvent ? P : never;

export type UnwrapBaseGraphEventsDetail<
  Key extends keyof BaseGraphEventDefinition,
  T extends BaseGraphEventDefinition[Key] = BaseGraphEventDefinition[Key],
  P extends Parameters<T>[0] = Parameters<T>[0],
> = UnwrapGraphEvents<Key, T, P>["detail"];

export interface GraphEventsDefinitions extends BaseGraphEventDefinition {
  "camera-change": (event: CustomEvent<TCameraState>) => void;
  "constants-changed": (event: CustomEvent<{ constants: TGraphConstants }>) => void;
  "colors-changed": (event: CustomEvent<{ colors: TGraphColors }>) => void;
  "state-change": (event: CustomEvent<{ state: GraphState }>) => void;
}
const graphPointerEvents = ["click", "dblclick", "pointerdown", "pointerenter", "pointermove", "pointerleave"];

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

export function isNativeGraphEventName(eventType: string): eventType is GraphEventNames {
  return graphPointerEvents.includes(eventType);
}
