import type { TBlockId, TConnectionId, TMultipointConnection, TPoint } from "@gravity-ui/graph";

export type ConverterResult = {
  edges: Record<TConnectionId, Pick<TMultipointConnection, "points" | "labels">>;
  blocks: Record<TBlockId, TPoint>;
};

/**
 * A connection as seen by the layout. Only block endpoints are laid out:
 * a connection without both `sourceBlockId` and `targetBlockId` (for example a port-only
 * `sourcePortId`/`targetPortId` connection) is skipped and gets no entry in `ConverterResult.edges`.
 * Anchors (`sourceAnchorId`/`targetAnchorId`) are ignored: points start at the right middle
 * of the source block and end at the left middle of the target block.
 * Give connections ids: a connection without an id is reported under "sourceBlockId/targetBlockId".
 */
export type LayeredLayoutConnection = {
  id?: TConnectionId;
  sourceBlockId?: TBlockId;
  targetBlockId?: TBlockId;
};

export type LayeredLayoutInput = {
  blocks: Array<{
    id: TBlockId;
    width: number;
    height: number;
    level?: number;
  }>;
  connections: LayeredLayoutConnection[];
};

/**
 * Options for layered layout algorithm.
 * All fields are optional; defaults match previous hardcoded behavior.
 */
export type LayeredLayoutOptions = {
  /** Horizontal gap between nodes in the same layer. Default: defaultNodeWidth * 2 */
  nodeHorizontalGap?: number;
  /** Vertical gap between nodes in adjacent layers. Default: 200 */
  nodeVerticalGap?: number;
  /** Default node width when not provided. Default: 100 */
  defaultNodeWidth?: number;
  /** Default node height when not provided. Default: 100 */
  defaultNodeHeight?: number;
  /** Multiplier for spacing between layers (columns). Default: 1.7 */
  layerSpacingFactor?: number;
  /**
   * Node count above which "fast" ordering is used (transpose skipped). Default: 700
   * @internal
   */
  enormousGraphNodeThreshold?: number;
  /**
   * Edge count above which "fast" ordering is used. Default: 3000
   * @internal
   */
  enormousGraphEdgeThreshold?: number;
};
