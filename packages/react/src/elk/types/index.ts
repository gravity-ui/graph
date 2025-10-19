import { TConnection, TConnectionId } from "@gravity-ui/graphconnection/ConnectionState";
import { TPoint } from "@gravity-ui/graphtypes/shapes";

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
