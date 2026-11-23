import { BlockConnection, SceneLine, dashFlow, pathGradient } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TSceneEffectUse, TSceneLineStroke } from "@gravity-ui/graph";

export type TConnectionClass = typeof BlockConnection<TConnection>;

/** The look of one connection; each renderer draws what it can of it. */
export type TLook = {
  color: string;
  width: number;
  /** A still dash in world units for both renderers. */
  pattern?: readonly number[];
  /** WebGL only. */
  effect?: TSceneEffectUse<"path">;
};

/**
 * The resting look of a connection; `withInteraction()` makes a hovered or selected line 2 units wider and a selected
 * one the selection color. In WebGL, an effect receives the resting color and draws the selection.
 */
export type TDescribe = (id: string | number | undefined, state: TBaseConnectionState) => TLook;

const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

export function hashId(id: string | number | undefined): number {
  let hash = 0;
  for (const char of String(id)) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
}

function toSceneStroke({ color, width, pattern, effect }: TLook): TSceneLineStroke {
  if (effect) return { color, width, effect };
  return pattern ? { color, width, dash: { pattern } } : { color, width };
}

export function createConnection(describe: TDescribe): TConnectionClass {
  // The dash and the effect stay on hover and selection; an effect decides how the selection looks.
  class StyledLine extends SceneLine {
    public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
      return this.withInteraction(toSceneStroke(describe(this.connection.props.id, state)), state);
    }
  }
  class StyledConnection extends BlockConnection<TConnection> {
    public static override line = StyledLine;
  }
  return StyledConnection;
}

export const runningDash = createConnection(() => ({
  color: "#4e79a7",
  width: 2,
  pattern: [12, 8],
  effect: dashFlow.use({ pattern: [12, 8], speed: 40 }),
}));

export const dataStyled = createConnection((id) => {
  const hash = hashId(id);
  return { color: palette[hash % palette.length], width: 1 + (hash % 4) };
});

const gradientEffect = pathGradient.use({ from: "#2f7cf6", to: "#f28e2b" });

export const gradientLines = createConnection(() => ({ color: "#4e79a7", width: 6, effect: gradientEffect }));
