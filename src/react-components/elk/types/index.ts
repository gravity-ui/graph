import { TConnectionId, TMultipointConnection } from "../../../store/connection/ConnectionState";
import { TPoint } from "../../../utils/types/shapes";

export type ConverterResult = {
  edges: Record<TConnectionId, Pick<TMultipointConnection, "points" | "labels">>;
  blocks: Record<TConnectionId, TPoint>;
};
