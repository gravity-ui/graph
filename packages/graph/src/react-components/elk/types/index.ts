import type { TMultipointConnection } from "../../../components/canvas/connections/types";
import type { TConnectionId } from "../../../store/connection/ConnectionState";
import type { TPoint } from "../../../utils/types/shapes";

export type ConverterResult = {
  edges: Record<TConnectionId, Pick<TMultipointConnection, "points" | "labels">>;
  blocks: Record<TConnectionId, TPoint>;
};
