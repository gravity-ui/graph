/**
 * Dash pattern in world units; `speed` (world units per second) moves the pattern from source to target, a negative
 * speed from target to source. WebGL only: `fade` draws each dash as a comet, transparent at the tail and opaque at the
 * head; Path2D draws plain dashes.
 */
export type TAppearanceDash = { pattern: readonly number[]; speed?: number; fade?: boolean };

/**
 * WebGL only (Path2D draws the stroke steady): the brightness of the stroke rises and falls every `period` seconds.
 * With `wavelength` (world units) the pulse also runs along x across the graph, one wave every `wavelength` units.
 */
export type TAppearancePulse = { period: number; wavelength?: number };

/**
 * Experimental, WebGL only: the registered connection effect (`connectionEffects` setting) that recolors the line, and up
 * to 8 numbers it reads as `f.params0` and `f.params1`. Path2D and arrows draw the stroke without it.
 */
export type TAppearanceEffect = { name: string; params?: readonly number[] };

/** Stroke of a connection appearance; lengths in world units. */
export type TAppearanceStroke = {
  color: string;
  width: number;
  dash?: TAppearanceDash;
  pulse?: TAppearancePulse;
  effect?: TAppearanceEffect;
};

/** Declarative look of a batched connection item that every batch backend can draw. */
export type TConnectionAppearance = {
  kind: "curve";
  /** Cubic Bézier segments in world coordinates, 8 numbers each: p0, c1, c2, p3. */
  segments: Float32Array;
  stroke: TAppearanceStroke;
};

/** A straight line as a cubic Bézier with control points on the line. */
export function lineSegment(x0: number, y0: number, x1: number, y1: number): number[] {
  const dx = (x1 - x0) / 3;
  const dy = (y1 - y0) / 3;
  return [x0, y0, x0 + dx, y0 + dy, x0 + 2 * dx, y0 + 2 * dy, x1, y1];
}

/** A cubic Bézier from its four points (start, two controls, end). */
export function bezierSegment(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const [p0, c1, c2, p3] = points;
  return [p0.x, p0.y, c1.x, c1.y, c2.x, c2.y, p3.x, p3.y];
}
