import type { TConnection } from "../../../store/connection/ConnectionState";
import type { TPoint } from "../../../utils/types/shapes";

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
