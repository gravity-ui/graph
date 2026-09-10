import type { TConnectionId, TMultipointConnection, TPoint } from "@gravity-ui/graph";

export type ConverterResult = {
  edges: Record<TConnectionId, Pick<TMultipointConnection, "points" | "labels">>;
  blocks: Record<TConnectionId, TPoint>;
};
