import { TConnection, TConnectionId } from "@gravity-ui/graph";
import { TPoint } from "@gravity-ui/graph";

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
