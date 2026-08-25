import { EventedComponent } from "./components/canvas/EventedComponent/EventedComponent";
import { GraphState } from "./graph";
import { TGraphColors, TGraphConstants } from "./graphConfig";
import { TCameraState } from "./services/camera/CameraService";
import { TSelectionDiff, TSelectionEntityId } from "./services/selection/types";

export type GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>;
export type GraphEventParams<T extends CustomEvent> = T extends CustomEvent ? T["detail"] : never;

export const extractNativeGraphMouseEvent = (event: GraphMouseEvent) => {
  return event.detail.sourceEvent instanceof MouseEvent ? event.detail.sourceEvent : null;
};

export type GraphMouseEventNames = "mousedown" | "click" | "dblclick" | "mouseenter" | "mouseleave";

export interface BaseGraphEventDefinition {
  mousedown: (event: GraphMouseEvent) => void;
  click: (event: GraphMouseEvent) => void;
  dblclick: (event: GraphMouseEvent) => void;
  mouseenter: (event: GraphMouseEvent) => void;
  mouseleave: (event: GraphMouseEvent) => void;
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

export type SelectionEvent<T extends TSelectionEntityId> = CustomEvent<TSelectionDiff<T>>;

export function isNativeGraphEventName(eventType: string): eventType is GraphMouseEventNames {
  return graphMouseEvents.includes(eventType);
}
export class GraphEvent<T = unknown> extends CustomEvent<T> {
  public graphEventDefaultPrevented = false;
  public graphEventPropagationStopped = false;

  public preventGraphEventDefault() {
    this.graphEventDefaultPrevented = true;
  }

  public stopGraphEventPropagation() {
    this.graphEventPropagationStopped = true;
  }

  public isDefaultPrevented() {
    return this.graphEventDefaultPrevented || this.defaultPrevented;
  }
}

export function isGraphEvent<T = unknown>(event: CustomEvent<T>): event is GraphEvent<T> {
  return (
    event instanceof CustomEvent && "graphEventDefaultPrevented" in event && "graphEventPropagationStopped" in event
  );
}
