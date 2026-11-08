import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../BlockConnection";

import type { ConnectionLine } from "./ConnectionLine";

export type TConnectionsRenderer = "canvas" | "webgl";

/** What Path2D and WebGL draw the same way; lengths in world units. */
export type TLineStroke = { color: string; width: number; dash?: { pattern: readonly number[] } };

export type TConnectionLineClass = (new (connection: BlockConnection<TConnection>) => ConnectionLine) & {
  readonly renderer: TConnectionsRenderer;
};
