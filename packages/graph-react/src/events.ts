import type { GraphEventListener, GraphEventName } from "@gravity-ui/graph";

export const GraphCallbacksMap = {
  onPress: "press",
  onRelease: "release",
  onClick: "click",
  onDoubleClick: "dblclick",
  onDragStart: "dragstart",
  onLongPress: "longpress",
  onPinch: "pinch",
  onPointerEnter: "pointerenter",
  onPointerLeave: "pointerleave",
  onPointerOver: "pointerover",
  onPointerOut: "pointerout",
  onCameraChange: "camera-change",
  onConstantsChanged: "constants-changed",
  onColorsChanged: "colors-changed",
  onStateChange: "state-change",
  onSceneStateChange: "scene-state-change",
  onBlockDragStart: "block-drag-start",
  onBlockDrag: "block-drag",
  onBlockDragEnd: "block-drag-end",
  onBlocksSelectionChange: "blocks-selection-change",
  onBlockAnchorSelectionChange: "block-anchor-selection-change",
  onBlockChange: "block-change",
  onBlocksGeometryChange: "blocks-geometry-change",
  onConnectionSelectionChange: "connection-selection-change",
  onGroupsSelectionChange: "groups-selection-change",
  onGroupCollapseChange: "group-collapse-change",
} as const satisfies Record<string, GraphEventName>;

export type TGraphEventCallbacks = {
  [K in keyof typeof GraphCallbacksMap]: GraphEventListener<(typeof GraphCallbacksMap)[K]>;
};
