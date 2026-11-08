import type { ConnectionEffect } from "../effects/ConnectionEffect";
import type { TUniformTypes } from "../effects/types";

import type { ConnectionLine } from "./ConnectionLine";

export type TConnectionsRenderer = "canvas" | "webgl";

/**
 * What draws the connection lines of a graph (`graph.getGraphLayer().$connectionsRenderer`):
 * - `"canvas"`: Path2D, for a Path2D line class; also for a WebGL line class until the graph's canvas is in the
 *   document, when its WebGL renderer is created, and after the connections unmount;
 * - `"webgl"`: WebGL2;
 * - `"webgl-fallback"`: Path2D using each effect's fallback stroke, for a WebGL line class whose WebGL2 renderer
 *   could not be created or lost its context.
 */
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

/** What the WebGL batch draws for one item (internal). */
export type TWebGLShape = {
  segments: Float32Array;
  stroke: TLineStroke;
  /** Polygon (x, y pairs) filled with the stroke color: a closed arrow. */
  fill?: Float32Array;
  /** The effect recoloring the stroke (the line only), with the connection's parameters. */
  effect?: ConnectionEffect<TUniformTypes, never>;
  params?: readonly number[];
};
