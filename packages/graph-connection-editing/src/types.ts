import type { GraphComponent, PortState, TBlockId, TPoint } from "@gravity-ui/graph";

export type TConnectionEditingIcon = {
  path: string;
  fill?: string;
  stroke?: string;
  width: number;
  height: number;
  viewWidth: number;
  viewHeight: number;
};

export type TConnectionEditingLineStyle = {
  color: string;
  width?: number;
  dash: number[];
};

export type TDrawLineFunction = (start: TPoint, end: TPoint) => { path: Path2D; style: TConnectionEditingLineStyle };

export type TPortSnapConditionContext = {
  sourcePort: PortState;
  targetPort: PortState;
  cursorPosition: TPoint;
  distance: number;
};
export type TPortSnapCondition = (context: TPortSnapConditionContext) => boolean;

/**
 * Port metadata read by ConnectionEditingLayer.
 * Store it under `ConnectionEditingLayer.PortMetaKey` in `port.meta`.
 */
export interface IPortConnectionMeta {
  /** Enable snapping for this port. If false or undefined, port will not participate in snapping */
  snappable?: boolean;
  /** Custom condition for snapping - validates if connection is allowed */
  snapCondition?: TPortSnapCondition;
}

export type TConnectionStartContext = {
  sourcePort: PortState;
  sourceComponent: GraphComponent;
  event: MouseEvent;
};

export type TConnectionAllowedContext = {
  sourcePort: PortState;
  targetPort: PortState;
};

export type TConnectionCreateStartDetail = {
  blockId: TBlockId | undefined;
  anchorId: string | undefined;
  sourcePort: PortState;
};

export type TConnectionCreateHoverDetail = {
  sourceBlockId: TBlockId | undefined;
  sourceAnchorId: string | undefined;
  targetBlockId: TBlockId | undefined;
  targetAnchorId: string | undefined;
  sourcePort: PortState;
  targetPort?: PortState;
};

export type TConnectionCreatedDetail = {
  sourceBlockId: TBlockId | undefined;
  sourceAnchorId?: string;
  targetBlockId: TBlockId | undefined;
  targetAnchorId?: string;
  sourcePort: PortState;
  targetPort: PortState;
};

export type TConnectionCreateDropDetail = {
  sourceBlockId: TBlockId | undefined;
  sourceAnchorId: string | undefined;
  targetBlockId?: TBlockId;
  targetAnchorId?: string;
  point: TPoint;
  sourcePort: PortState;
  targetPort?: PortState;
};

export type TConnectionCreateCancelDetail = {
  sourcePort: PortState | undefined;
  targetPort: PortState | undefined;
};

declare module "@gravity-ui/graph" {
  interface GraphEventsDefinitions {
    /**
     * Fired when a user starts creating a connection from a port, an anchor or a block (Shift + drag).
     * Preventing this event prevents the selection of the source component.
     */
    "connection-create-start": (event: CustomEvent<TConnectionCreateStartDetail>) => void;

    /**
     * Fired when the dragged endpoint enters or leaves a potential target.
     * Preventing this event prevents the selection of the target component.
     */
    "connection-create-hover": (event: CustomEvent<TConnectionCreateHoverDetail>) => void;

    /**
     * Fired when a connection is created between two ports.
     * By default, this adds the connection to the connectionsList in the store.
     * Preventing this event prevents the connection from being added to the store.
     */
    "connection-created": (event: CustomEvent<TConnectionCreatedDetail>) => void;

    /**
     * Fired when the user releases the mouse button, whether or not a connection was created.
     */
    "connection-create-drop": (event: CustomEvent<TConnectionCreateDropDetail>) => void;

    /**
     * Fired when creation is cancelled: Escape, the source disappears, or the layer is detached mid-drag.
     */
    "connection-create-cancel": (event: CustomEvent<TConnectionCreateCancelDetail>) => void;
  }
}
