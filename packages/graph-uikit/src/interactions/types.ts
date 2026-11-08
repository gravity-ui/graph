import type { Anchor, BaseConnection, CanvasBlock, TBlockId, TConnectionId, TPoint } from "@gravity-ui/graph";

export type TGraphEntity =
  | { kind: "block"; id: TBlockId; component: CanvasBlock }
  | { kind: "connection"; id: TConnectionId; component: BaseConnection }
  | { kind: "anchor"; id: string; blockId: TBlockId; component: Anchor }
  | { kind: "canvas"; worldPoint: TPoint };

/** Entities backed by a canvas component (everything except empty canvas). */
export type TGraphComponentEntity = Exclude<TGraphEntity, { kind: "canvas" }>;

export type TGraphEntityKind = TGraphEntity["kind"];

export type TGraphHoverState = {
  entity: TGraphComponentEntity;
  /** Pointer position in world space when the entity was entered (for connection tooltips). */
  worldPoint: TPoint | null;
};

export type TGraphContextMenuState = {
  entity: TGraphEntity;
  /** Viewport coordinates of the click. */
  clientPoint: TPoint;
  /** Camera version at open time; the menu closes when the camera moves. */
  cameraVersion: number;
};

/** Plain client rect, compatible with floating-ui `ClientRectObject`. */
export type TClientRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
};
