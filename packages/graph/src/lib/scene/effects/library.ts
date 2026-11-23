import { readColorRgba } from "../utils/colorAlpha";

import { PathEffect } from "./PathEffect";
import { defineSceneEffect } from "./defineSceneEffect";
import type {
  TSceneEffect,
  TSceneEffectDefinition,
  TSceneEffectScaleRange,
  TSceneEffectUse,
  TUniformType,
} from "./types";

/**
 * A running dash: the pattern moves along the line at `speed` world units per second, from the source to the target
 * (a negative speed runs the other way). With `fade` the dash is a comet: transparent tail, opaque head.
 *
 * Selected, the gaps take the selection color and the dashes keep the line's (comet tails fade into the selection
 * color); hover only widens the line. The effect draws the dash itself, so the base stroke of a line using it has no
 * still `dash`. The Canvas2D scene draws the base stroke. The compatibility Canvas batch uses a still dash.
 *
 * @example
 * getStroke() {
 *   return { color: "#4cb", width: 2, effect: dashFlow.use({ pattern: [90, 160], speed: 120, fade: true }) };
 * }
 */
export const dashFlow = defineSceneEffect<
  Record<never, TUniformType>,
  {
    /** On and off lengths in world units; the off length defaults to the on length. */
    pattern: readonly number[];
    /** World units per second; negative runs from the target to the source. */
    speed: number;
    /** A comet: transparent tail, opaque head. */
    fade?: boolean;
  }
>({
  kind: "path",
  animated: true,
  fragment: /* glsl */ `
vec4 effect(PathFragment f, vec4 color) {
  float on = f.params0.x;
  float off = f.params0.y;
  float speed = f.params0.z;
  float phase = graph_dashPhase(f.along, on, off, f.time * speed);
  // The gaps: empty, or the selection color while selected.
  vec4 gap = f.selected > 0.5 ? f.selectionColor : vec4(color.rgb, 0.0);
  float dash = phase > on ? 0.0 : color.a;
  if (f.params0.w > 0.0) dash *= graph_comet(phase, on, speed);
  // The dash over the gap: a comet's tail fades into it.
  return mix(gap, vec4(color.rgb, 1.0), dash);
}`,
  encode: ({ pattern, speed, fade }) => {
    const on = pattern[0];
    return [on, pattern[1] ?? on, speed, fade ? 1 : 0];
  },
  fallback: (stroke, params) => ({ ...stroke, dash: { pattern: [params[0], params[1]] } }),
});

const BLACK_RGB = [0, 0, 0] as const;

function encodeRgb(color: string): readonly [number, number, number] {
  const [r, g, b] = readColorRgba(color) ?? BLACK_RGB;
  return [r / 255, g / 255, b / 255];
}

type TGradientInput = {
  from: string;
  to: string;
  /** Cycles per second. Positive moves toward the target, negative toward the source. Defaults to 0. */
  speed?: number;
};

const gradientDefinition: TSceneEffectDefinition<Record<never, TUniformType>, TGradientInput> = {
  kind: "path",
  fragment: /* glsl */ `
vec4 effect(PathFragment f, vec4 color) {
  float t = f.t;
  float speed = f.params0.w;
  if (speed != 0.0) {
    float phase = 6.2831853 * (t - fract(f.time * speed));
    float wave = 0.5 + 0.5 * sin(phase);
    // Sweep the full palette through the interior and smoothly pin both endpoint colours.
    t = mix(t, wave, smoothstep(0.0, 0.15, min(t, 1.0 - t)));
  }
  vec4 fill = vec4(mix(f.params0.rgb, f.params1.rgb, t), color.a);
  if (f.selected > 0.5) {
    float edge = f.halfWidth - min(1.5, f.halfWidth * 0.5);
    fill = mix(fill, f.selectionColor, smoothstep(edge - 0.5, edge, abs(f.across)));
  }
  if (scene_dimColor.a >= 0.0) fill.rgb = mix(fill.rgb, scene_dimColor.rgb, graph_vDim);
  return fill;
}`,
  encode: ({ from, to, speed = 0 }) => [...encodeRgb(from), speed, ...encodeRgb(to)],
};

// Both variants share the shader. Separate effect instances keep static paths out of animation scheduling.
const movingGradient = defineSceneEffect({ ...gradientDefinition, animated: true });

class PathGradient extends PathEffect<Record<never, TUniformType>, TGradientInput> {
  public override use(input: TGradientInput, range?: TSceneEffectScaleRange): TSceneEffectUse<"path"> {
    const speed = Math.fround(input.speed ?? 0);
    if (!Number.isFinite(speed)) throw new RangeError("[@gravity-ui/graph] Gradient speed must be finite.");
    return speed === 0 ? super.use(input, range) : movingGradient.use(input, range);
  }

  public override clone(): PathGradient {
    return new PathGradient(gradientDefinition);
  }
}

/**
 * A continuous gradient along the whole path. The stroke supplies opacity and the Canvas fallback.
 * A selected connection keeps the gradient inside an edge in its selection color.
 */
export const pathGradient: TSceneEffect<"path", Record<never, TUniformType>, TGradientInput> = new PathGradient(
  gradientDefinition
);
