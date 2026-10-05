import isObject from "lodash/isObject";

export type TPoint = {
  x: number;
  y: number;
};

/** A world-space point with optional exact canvas coordinates for hit testing. */
export type THitTestPoint = TPoint & {
  /** Canvas-relative CSS pixels, before applying device pixel ratio. */
  origPoint?: TPoint;
};

export type TRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isTRect(rect: unknown): rect is TRect {
  return (
    isObject(rect) &&
    "x" in rect &&
    typeof rect.x === "number" &&
    "y" in rect &&
    typeof rect.y === "number" &&
    "width" in rect &&
    typeof rect.width === "number" &&
    "height" in rect &&
    typeof rect.height === "number"
  );
}
