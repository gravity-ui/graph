import type { TBlockId } from "@gravity-ui/graph";

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

/** Port id that can cross the Node ↔ page boundary. Symbol port ids are not supported. */
export type GraphPortId = string | number;

/**
 * Block-based endpoints (`sourceBlockId`/`targetBlockId`, optionally narrowed to anchors).
 * Without anchor ids, a side matches any connection whose raw block id matches, or whose port is the
 * block's own connection point. With an anchor id, the resolved port must be that anchor's port.
 */
export type GraphConnectionBlockEndpoints = {
  sourceBlockId: TBlockId;
  targetBlockId: TBlockId;
  sourceAnchorId?: string;
  targetAnchorId?: string;
  sourcePortId?: never;
  targetPortId?: never;
};

/** Port-based endpoints, compared with the connection's resolved source and target port ids. */
export type GraphConnectionPortEndpoints = {
  sourcePortId: GraphPortId;
  targetPortId: GraphPortId;
  sourceBlockId?: never;
  targetBlockId?: never;
  sourceAnchorId?: never;
  targetAnchorId?: never;
};

export type GraphConnectionEndpoints = GraphConnectionBlockEndpoints | GraphConnectionPortEndpoints;
