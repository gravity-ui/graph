// UMD-specific exports - only essential classes and enums
export { ESchedulerPriority } from "./lib/Scheduler";
export { ECanChangeBlockGeometry } from "./store/settings";
export { ECameraScaleLevel } from "./services/camera/CameraService";
export { EAnchorType } from "./store/anchor/Anchor";
export { ESelectionStrategy } from "./services/selection/types";
export { GraphState } from "./graph";

export { Anchor, type TAnchor, type TAnchorProps } from "./components/canvas/anchors";
export { BaseConnection } from "./components/canvas/connections";
export { BlockConnection } from "./components/canvas/connections";
export { BlockGroups } from "./components/canvas/groups";
export { Block as CanvasBlock, type TBlock } from "./components/canvas/blocks/Block";
export { Component } from "./lib/Component";
export { ConnectionArrow } from "./components/canvas/connections";
export { ConnectionLayer } from "./components/canvas/layers/connectionLayer/ConnectionLayer";
export { Graph } from "./graph";
export { GraphComponent } from "./components/canvas/GraphComponent";
export { Group } from "./components/canvas/groups";
export { Layer } from "./services/Layer";
