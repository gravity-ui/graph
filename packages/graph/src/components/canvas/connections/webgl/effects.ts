/** Numbers a connection passes to its effect in `getStroke().effect.params`; the shader reads them as two vec4. */
export const CONNECTION_EFFECT_PARAMS = 8;

/**
 * Experimental WebGL connection effect: GLSL that recolors the line of every connection whose `getStroke()` names it.
 * Register effects with the `connectionEffects` setting; the WebGL renderer compiles one program per effect the first
 * time a connection uses it. Arrows, Path2D and connections without `effect` are drawn as usual.
 *
 * `fragment` is GLSL ES 3.00 that defines `vec4 effect(ConnectionFragment f, vec4 color)`. `color` is the stroke's
 * color after its dash, fade and pulse, and the result replaces it; both are straight (not premultiplied) RGBA, and the
 * renderer applies anti-aliasing afterwards. An effect cannot widen or move the line: it only colors the pixels the
 * stroke covers, so a dot as wide as the line needs a stroke that wide.
 *
 * ```glsl
 * struct ConnectionFragment {
 *   float along;      // world units from the connection's source
 *   float length;     // the connection's length, world units
 *   float t;          // along / length: 0 at the source, 1 at the target
 *   float across;     // CSS pixels from the center line, signed
 *   float halfWidth;  // half the drawn width, CSS pixels
 *   float scale;      // camera scale: CSS pixels per world unit
 *   vec2 world;       // world position
 *   float time;       // seconds since the renderer started
 *   vec4 params0;     // effect.params[0..3]
 *   vec4 params1;     // effect.params[4..7]
 * };
 * ```
 *
 * A source that fails to compile is reported once in the console, and its connections are drawn without the effect.
 */
export type TConnectionEffect = {
  name: string;
  fragment: string;
  /** Redraw every animation frame while a connection with this effect is drawn, for effects that read `f.time`. */
  animated?: boolean;
};
