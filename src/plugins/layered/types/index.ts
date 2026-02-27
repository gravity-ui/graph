import { TConnection, TConnectionId } from "../../../store/connection/ConnectionState";
import { TPoint } from "../../../utils/types/shapes";

export type TLabel = {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
  text?: string;
};

export type TMultipointConnection = TConnection & {
  points?: TPoint[];
  labels?: TLabel[];
};

export type ConverterResult = {
  edges: Record<TConnectionId, Pick<TMultipointConnection, "points" | "labels">>;
  blocks: Record<TConnectionId, TPoint>;
};

export type LayeredLayoutInput = {
  blocks: Array<{
    id: TConnectionId;
    width: number;
    height: number;
    level?: number;
  }>;
  connections: Array<{
    id?: TConnectionId;
    sourceBlockId: TConnectionId;
    targetBlockId: TConnectionId;
  }>;
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
