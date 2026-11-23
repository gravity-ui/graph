import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TPoint } from "../../../../utils/types/shapes";

/** What a geometry reads: plain data, so a geometry is testable without a component. */
export type TConnectionGeometryInput = {
  /** The source endpoint: `connectionPoints[0]`. */
  source: TPoint;
  /** The target endpoint: `connectionPoints[1]`. */
  target: TPoint;
  /** Whether the effective endpoint follows a delegate port. */
  sourceDelegated?: boolean;
  targetDelegated?: boolean;
  /** The connection's `points`, [] without them. */
  points: readonly TPoint[];
  useBezier: boolean;
  bezierDirection: "horizontal" | "vertical";
  /** Raw connection data, for custom geometries. */
  connection: Readonly<TConnection>;
};

export type TConnectionArrow = {
  /** x, y pairs in world units. */
  points: Float32Array;
  /** Open chevron or closed polygon. */
  closed: boolean;
  /** @internal Stock head geometry. An end head can shorten the shaft to its base. */
  position?: "inline" | "end";
};

export type TConnectionRouteLabel = {
  /** Stable, non-empty identifier unique within this connection. */
  id: string;
  text: string;
  /** Fraction of the full route length from source to target, in [0, 1]. */
  at: number;
};

export type TConnectionGeometry = {
  /** Cubic Bézier segments, 8 numbers each (p0, c1, c2, p3), world units; a dash runs on across them. */
  segments: Float32Array;
  arrow?: TConnectionArrow;
  /** Retained labels on the path, in placement priority order. Omit to use the stock data label. */
  labels?: readonly Readonly<TConnectionRouteLabel>[];
};

/** Pure shape of a connection; `undefined` means no geometry: the connection is neither drawn nor hit. */
export type TConnectionGeometryFn = (input: TConnectionGeometryInput) => TConnectionGeometry | undefined;
