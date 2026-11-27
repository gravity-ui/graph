import type { EventedComponent, TGraphHoverDetail } from "./components/canvas/EventedComponent/EventedComponent";
import type { Graph, GraphState } from "./graph";
import type { TGraphColors, TGraphConstants } from "./graphConfig";
import type { TCameraState } from "./services/camera/CameraService";
import type { GestureEvents } from "./services/input/press";
import type { TSceneLevel, TSceneState } from "./services/scene/types";

export type GraphEventTarget = Graph | EventedComponent;

export interface GraphEventContext<K extends string, T extends GraphEventTarget = GraphEventTarget> {
  readonly type: K;
  readonly target: T;
  readonly currentTarget: GraphEventTarget | null;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
  readonly propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

type HoverName = "pointerenter" | "pointerleave" | "pointerover" | "pointerout";

/** Plugins augment this map with the fields they pass to graph.emit. */
export interface GraphEventsDefinitions extends Record<HoverName, TGraphHoverDetail> {
  "camera-change": TCameraState;
  "constants-changed": { constants: TGraphConstants };
  "colors-changed": { colors: TGraphColors };
  "state-change": { state: GraphState };
  "scene-state-change": { state: TSceneState };
}

export type GraphEventMap = GestureEvents & {
  [K in keyof GraphEventsDefinitions]: GraphEventsDefinitions[K] &
    GraphEventContext<K, K extends HoverName ? EventedComponent : Graph>;
};

export type GraphHoverEvents = Pick<GraphEventMap, HoverName>;
export type GraphEventName = keyof GraphEventMap;
export type GraphEventListener<K extends GraphEventName> = (event: GraphEventMap[K]) => void;
export type GraphEventOptions = Pick<AddEventListenerOptions, "capture" | "once" | "signal"> & {
  inScale?: readonly TSceneLevel[];
};
