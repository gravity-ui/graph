import type { TSceneEffectUse } from "../../../../lib/scene/effects/types";
import type { TPathInteraction } from "../../../../lib/scene/types";

import type { ConnectionLine } from "./ConnectionLine";

/** What Path2D and WebGL draw the same way; lengths in world units. */
export type TLineStroke = { color: string; width: number; dash?: { pattern: readonly number[] } };

/**
 * A line class for `static line`. A static member cannot refer to the instance type, so the connection type is checked
 * on the line class's side: the parameter is `never`, which accepts a line typed for a connection subclass
 * (`class MyLine extends SceneLine<MyConnection>`). The connection passes itself when it creates the line.
 */
export type TConnectionLineClass = new (connection: never) => ConnectionLine;

/** Appearance consumed when the connection builds its path primitive. */
export type TSceneStrokeEffect = {
  stroke: TLineStroke;
  effect: TSceneEffectUse<"path">;
  interaction: TPathInteraction;
  effectShowsSelection?: boolean;
};
