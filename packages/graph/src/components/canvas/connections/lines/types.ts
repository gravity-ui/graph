import type { ConnectionEffect } from "../effects/ConnectionEffect";
import type { TUniformTypes } from "../effects/types";

import type { ConnectionLine } from "./ConnectionLine";

export type TConnectionsRenderer = "canvas" | "webgl";

/** Compatibility view of the scene renderer (`graph.getGraphLayer().$connectionsRenderer`). */
export type TConnectionsRendererState = "canvas" | "webgl" | "webgl-fallback";

/** What Path2D and WebGL draw the same way; lengths in world units. */
export type TLineStroke = { color: string; width: number; dash?: { pattern: readonly number[] } };

/**
 * A line class for `static line`. A static member cannot refer to the instance type, so the connection type is checked
 * on the line class's side: the parameter is `never`, which accepts a line typed for a connection subclass
 * (`class MyLine extends Path2DLine<MyConnection>`). The connection passes itself when it creates the line.
 */
export type TConnectionLineClass = (new (connection: never) => ConnectionLine) & {
  readonly renderer: TConnectionsRenderer;
};

/**
 * Hover and selection of the connection a line draws (internal): what an effect reads as `f.hovered`, `f.selected` and
 * `f.selectionColor`. The selection color is there whatever the state.
 */
export type TLineInteraction = { hovered: boolean; selected: boolean; selectionColor: string };

/** Geometry and stroke of a WebGL scene path (internal). */
export type TWebGLShape = {
  segments: Float32Array;
  stroke: TLineStroke;
  /** The effect recoloring the stroke (the line only), with the connection's parameters. */
  effect?: ConnectionEffect<TUniformTypes, never>;
  params?: readonly number[];
  /** The line's hover and selection; an arrow has none (encoded as zeros). */
  interaction?: TLineInteraction;
  /**
   * The stroke color is the line's own in place of the selection color `withInteraction()` applied: the effect shows
   * the selection, and the plain program (an effect that does not compile) draws the selection color.
   */
  effectShowsSelection?: boolean;
};
