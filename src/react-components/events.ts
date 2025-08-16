import { GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "../graphEvents";

export type TGraphEventCallbacks = {
  click: (data: UnwrapGraphEventsDetail<"click">, event: UnwrapGraphEvents<"click">) => void;
  dblclick: (data: UnwrapGraphEventsDetail<"dblclick">, event: UnwrapGraphEvents<"dblclick">) => void;
  onCameraChange: (data: UnwrapGraphEventsDetail<"camera-change">, event: UnwrapGraphEvents<"camera-change">) => void;
  onBlockDragStart: (
    data: UnwrapGraphEventsDetail<"block-drag-start">,
    event: UnwrapGraphEvents<"block-drag-start">
  ) => void;
  onBlockDrag: (data: UnwrapGraphEventsDetail<"block-drag">, event: UnwrapGraphEvents<"block-drag">) => void;
  onBlockDragEnd: (data: UnwrapGraphEventsDetail<"block-drag-end">, event: UnwrapGraphEvents<"block-drag-end">) => void;
  onBlockSelectionChange: (
    data: UnwrapGraphEventsDetail<"blocks-selection-change">,
    event: UnwrapGraphEvents<"blocks-selection-change">
  ) => void;
  onBlockAnchorSelectionChange: (
    data: UnwrapGraphEventsDetail<"block-anchor-selection-change">,
    event: UnwrapGraphEvents<"block-anchor-selection-change">
  ) => void;
  onBlockChange: (data: UnwrapGraphEventsDetail<"block-change">, event: UnwrapGraphEvents<"block-change">) => void;
  onConnectionSelectionChange: (
    data: UnwrapGraphEventsDetail<"connection-selection-change">,
    event: UnwrapGraphEvents<"connection-selection-change">
  ) => void;
  onStateChanged: (data: UnwrapGraphEventsDetail<"state-change">, event: UnwrapGraphEvents<"state-change">) => void;
  // Новые события жестов
  onTap: (data: UnwrapGraphEventsDetail<"tap">, event: UnwrapGraphEvents<"tap">) => void;
  onHover: (data: UnwrapGraphEventsDetail<"hover">, event: UnwrapGraphEvents<"hover">) => void;
  onPanStart: (data: UnwrapGraphEventsDetail<"panstart">, event: UnwrapGraphEvents<"panstart">) => void;
  onPanMove: (data: UnwrapGraphEventsDetail<"panmove">, event: UnwrapGraphEvents<"panmove">) => void;
  onPanEnd: (data: UnwrapGraphEventsDetail<"panend">, event: UnwrapGraphEvents<"panend">) => void;
  onPinchStart: (data: UnwrapGraphEventsDetail<"pinchstart">, event: UnwrapGraphEvents<"pinchstart">) => void;
  onPinchMove: (data: UnwrapGraphEventsDetail<"pinchmove">, event: UnwrapGraphEvents<"pinchmove">) => void;
  onPinchEnd: (data: UnwrapGraphEventsDetail<"pinchend">, event: UnwrapGraphEvents<"pinchend">) => void;
};

export type GraphEventDetail<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[0];
export type GraphEvent<T extends keyof TGraphEventCallbacks> = Parameters<TGraphEventCallbacks[T]>[0];

export const GraphCallbacksMap: Record<keyof TGraphEventCallbacks, keyof GraphEventsDefinitions> = {
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
  // Новые события жестов
  onTap: "tap",
  onHover: "hover",
  onPanStart: "panstart",
  onPanMove: "panmove",
  onPanEnd: "panend",
  onPinchStart: "pinchstart",
  onPinchMove: "pinchmove",
  onPinchEnd: "pinchend",
};
