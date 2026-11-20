import { MultipointConnection } from "./MultipointConnection";
import { bezierMultipointGeometry } from "./geometry";
import type { TConnectionGeometryFn } from "./geometry";

/**
 * Multipoint connection that draws segments as Bezier curves and keeps straight
 * segments aligned with the configured bezier direction as lines.
 * From commit a90f9c65 (ytsaurus-ui) — alternative line representation for layout graphs.
 */
export class BezierMultipointConnection extends MultipointConnection {
  public static override geometry: TConnectionGeometryFn = bezierMultipointGeometry;
}
