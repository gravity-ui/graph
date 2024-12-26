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
