import { defineConnectionEffect } from "./ConnectionEffect";
import type { TUniformType } from "./types";

/**
 * A running dash: the pattern moves along the line at `speed` world units per second, from the source to the target
 * (a negative speed runs the other way). With `fade` the dash is a comet: transparent tail, opaque head.
 *
 * Selected, the gaps take the selection color and the dashes keep the line's (comet tails fade into the selection
 * color); hover only widens the line. The effect draws the dash itself, so the base stroke of a line using it has no
 * still `dash`. While WebGL is unavailable the connection draws a still dash with the same pattern.
 *
 * @example
 * getStroke() {
 *   return { color: "#4cb", width: 2, effect: dashFlow.use({ pattern: [90, 160], speed: 120, fade: true }) };
 * }
 */
export const dashFlow = defineConnectionEffect<
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
  animated: true,
  fragment: /* glsl */ `
vec4 effect(ConnectionFragment f, vec4 color) {
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

/**
 * A brightness wave: the line dims to 15% and a narrow crest passes every `period` seconds. With a `wavelength`
 * (world units) the crest travels along the x axis, so neighbouring connections pulse in step; without it
 * (`0`) the whole line pulses in place. Selected, the dim part takes the selection color and the crest keeps the
 * line's; hover only widens the line.
 *
 * @example
 * getStroke() {
 *   return { color: "#fb4", width: 2, effect: pulse.use({ period: 3, wavelength: 24000 }) };
 * }
 */
export const pulse = defineConnectionEffect<Record<never, TUniformType>, { period: number; wavelength?: number }>({
  animated: true,
  fragment: /* glsl */ `
vec4 effect(ConnectionFragment f, vec4 color) {
  float wave = graph_wave(f.world, f.time, f.params0.x, f.params0.y);
  if (f.selected > 0.5) return mix(f.selectionColor, color, wave);
  return vec4(color.rgb, color.a * wave);
}`,
  encode: ({ period, wavelength }) => [period, wavelength ?? 0],
});
