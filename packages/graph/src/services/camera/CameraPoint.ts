import type { TPoint } from "../../utils/types/shapes";

/** The same position in two coordinate spaces, captured at one camera state. */
export type CameraPoint = {
  /** World coordinates, without integer rounding. */
  world: TPoint;
  /** Canvas-relative CSS pixels, before applying device pixel ratio. */
  canvas: TPoint;
};
