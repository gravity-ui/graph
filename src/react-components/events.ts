import { GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "../graphEvents";

/** React-style handler: `(detail, fullEvent)` for the graph event named `N`. */
export type GraphReactHandler<N extends keyof GraphEventsDefinitions> = (
  data: UnwrapGraphEventsDetail<N>,
  event: UnwrapGraphEvents<N>
) => void;

export const GraphCallbacksMap = {
  click: "click",
  dblclick: "dblclick",
  onCameraChange: "camera-change",
  onBlockDragStart: "block-drag-start",
  onBlockDrag: "block-drag",
  onBlockDragEnd: "block-drag-end",
  onBlockSelectionChange: "blocks-selection-change",
  onBlockAnchorSelectionChange: "block-anchor-selection-change",
  onBlockChange: "block-change",
  onConnectionSelectionChange: "connection-selection-change",
  onStateChanged: "state-change",
} as const;

export type GraphCallbackKey = keyof typeof GraphCallbacksMap;

export type TGraphEventCallbacks = {
  [K in GraphCallbackKey]: GraphReactHandler<(typeof GraphCallbacksMap)[K]>;
};

export type GraphEventDetail<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[0];
/** Full `CustomEvent` instance passed as the second argument to React-style graph callbacks. */
export type GraphEvent<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[1];
