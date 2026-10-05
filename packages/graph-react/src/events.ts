import { GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "@gravity-ui/graph";

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
  onBlocksGeometryChange: "blocks-geometry-change",
  onConnectionSelectionChange: "connection-selection-change",
  onStateChanged: "state-change",
} as const satisfies Record<string, keyof GraphEventsDefinitions>;

export type TGraphEventCallbacks = {
  [K in keyof typeof GraphCallbacksMap]: (
    data: UnwrapGraphEventsDetail<(typeof GraphCallbacksMap)[K]>,
    event: UnwrapGraphEvents<(typeof GraphCallbacksMap)[K]>
  ) => void;
};

export type GraphEventDetail<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[0];
export type GraphEvent<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[1];
