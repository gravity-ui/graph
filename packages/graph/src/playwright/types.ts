export type GraphPoint = {
  x: number;
  y: number;
};

export type GraphRect = GraphPoint & {
  width: number;
  height: number;
};

export type GraphModifier = "Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift";
export type GraphMouseButton = "left" | "middle" | "right";

export type GraphActionOptions = {
  force?: boolean;
  modifiers?: GraphModifier[];
  timeout?: number;
  waitForFrames?: number;
};

export type GraphClickOptions = GraphActionOptions & {
  button?: GraphMouseButton;
};

export type GraphDragOptions = {
  button?: GraphMouseButton;
  steps?: number;
  waitForFrames?: number;
};

export type GraphHoverOptions = GraphActionOptions;
