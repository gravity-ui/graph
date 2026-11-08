import type { ConnectionLine } from "./ConnectionLine";

export type TConnectionsRenderer = "canvas" | "webgl";

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
