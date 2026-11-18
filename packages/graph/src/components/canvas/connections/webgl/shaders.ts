/**
 * GLSL ES 3.00 sources of the connection programs. Attributes, varyings, outputs, uniforms and helper functions are
 * internal and carry the `graph_` prefix, which leaves every other name to effects.
 */

import { CURVE_CHORDS } from "./encode";

/** Everything an effect can read, before the effect's source. */
export const FRAGMENT_PRELUDE = /* glsl */ `#version 300 es
precision highp float;
#define GRAPH_CONNECTION_FRAGMENT 1

in vec4 graph_vColor;
in float graph_vAcross;
in float graph_vHalfWidth;
in float graph_vHairline;
in float graph_vAlong;
in vec2 graph_vWorld;
flat in vec4 graph_vDash;
flat in float graph_vLength;
flat in vec4 graph_vParams0;
flat in vec4 graph_vParams1;
flat in vec3 graph_vInteraction;
flat in vec4 graph_vSelectionColor;

uniform vec3 graph_camera;
uniform float graph_dpr;
uniform float graph_time;
uniform float graph_extraWidth;

out vec4 graph_fragColor;

struct ConnectionFragment {
  float along;          // world units from the source, continuous across segments
  float length;         // the whole connection's length, world units
  float t;              // along / length: 0 at the source, 1 at the target
  float across;         // CSS pixels from the center line, signed
  float halfWidth;      // half the drawn stroke width, CSS pixels
  float extraWidth;     // the effect's extraWidth, CSS pixels (0 without)
  float coverage;       // 0..1: how much of the pixel the stroke itself covers, anti-aliased
  float scale;          // CSS pixels per world unit
  vec2 world;           // the fragment's world position
  float time;           // seconds since the renderer started
  vec4 params0;         // params[0..3]
  vec4 params1;         // params[4..7]
  float hovered;        // 1.0 while the connection is hovered, else 0.0
  float selected;       // 1.0 while the connection is selected, else 0.0
  vec4 selectionColor;  // the connection's selection color, straight RGBA, whatever the state
};

// Helpers for effects; part of the shader contract, versioned with ConnectionFragment.
// Position in a repeating on/off pattern, 0..on+off, shifted by offset.
float graph_dashPhase(float along, float on, float off, float offset) { return mod(along - offset, on + off); }
// Comet brightness for a position inside the dash (phase < on): the head leads in the direction of speed.
float graph_comet(float phase, float on, float speed) {
  float head = speed >= 0.0 ? phase / on : 1.0 - phase / on;
  return head * head;
}
// Traveling crest, 0.15..1; wavelength 0 pulses the whole line in place.
float graph_wave(vec2 world, float time, float period, float wavelength) {
  float wave = wavelength > 0.0 ? world.x / wavelength : 0.0;
  float pulse = 0.5 + 0.5 * cos(6.2831853 * (time / period - wave));
  return mix(0.15, 1.0, pow(pulse, 4.0));
}
`;

/**
 * The effect of the plain stroke. The plain program also draws the groups of effects that do not compile: a selected
 * line whose effect was to show the selection takes the selection color there.
 */
export const IDENTITY_EFFECT = /* glsl */ `vec4 effect(ConnectionFragment f, vec4 color) {
  return graph_vInteraction.z * f.selected > 0.5 ? f.selectionColor : color;
}`;

export const FRAGMENT_MAIN = /* glsl */ `
void main() {
  // The still dash, two on/off pairs like canvas setLineDash: an effect never draws in its gaps.
  float dashLength = graph_vDash.x + graph_vDash.y + graph_vDash.z + graph_vDash.w;
  if (dashLength > 0.0) {
    float phase = mod(graph_vAlong, dashLength);
    float secondDash = graph_vDash.x + graph_vDash.y;
    if ((phase > graph_vDash.x && phase <= secondDash) || phase > secondDash + graph_vDash.z) discard;
  }
  float across = abs(graph_vAcross);
  float coverage = clamp((graph_vHalfWidth - across) * graph_dpr + 0.5, 0.0, 1.0);
  // The outer edge of the drawn quad: the stroke's own edge without an extra width.
#ifdef GRAPH_STROKE_SAMPLES
  float edge = 1.0;
#else
  float edge = clamp((graph_vHalfWidth + graph_extraWidth - across) * graph_dpr + 0.5, 0.0, 1.0);
#endif
  float t = graph_vLength > 0.0 ? clamp(graph_vAlong / graph_vLength, 0.0, 1.0) : 0.0;
  ConnectionFragment f = ConnectionFragment(
    graph_vAlong,
    graph_vLength,
    t,
    graph_vAcross,
    graph_vHalfWidth,
    graph_extraWidth,
    coverage,
    graph_camera.z,
    graph_vWorld,
    graph_time,
    graph_vParams0,
    graph_vParams1,
    graph_vInteraction.x,
    graph_vInteraction.y,
    graph_vSelectionColor
  );
  vec4 color = effect(f, graph_vColor);
  float alpha = clamp(color.a, 0.0, 1.0) * edge * graph_vHairline;
#ifdef GRAPH_STROKE_SAMPLES
  if (alpha <= 0.0) discard;
#endif
  graph_fragColor = vec4(color.rgb * alpha, alpha);
}
`;

/**
 * The line program's fragment shader. `effect` is GLSL ES 3.00 defining `vec4 effect(ConnectionFragment f, vec4
 * color)` that recolors every fragment the stroke draws (straight RGBA in and out); without it the stroke keeps its
 * color. The library anti-aliases, fades hairlines and premultiplies afterwards. `uniforms` declares the effect's
 * `u_<name>` uniforms. Compiler logs count lines from the effect's first line.
 */
export function createFragmentShader(effect: string = IDENTITY_EFFECT, uniforms = ""): string {
  return `${FRAGMENT_PRELUDE}\n${uniforms}#line 1\n${effect}\n${FRAGMENT_MAIN}`;
}

/** Triangle strip of uniform chords along one piece: (t, side) pairs. */
export function createCurveTemplate(chords = CURVE_CHORDS): Float32Array {
  const vertices: number[] = [];
  for (let i = 0; i <= chords; i++) {
    const t = i / chords;
    vertices.push(t, -1, t, 1);
  }
  return new Float32Array(vertices);
}

/** The strip of a straight segment: one quad, (0, -1) (0, 1) (1, -1) (1, 1). */
export function createLineTemplate(): Float32Array {
  return createCurveTemplate(1);
}
