/**
 * GLSL ES 3.00 sources of the connection programs. Attributes, varyings, outputs, uniforms and helper functions are
 * internal and carry the `graph_` prefix, which leaves every other name to effects.
 */

export const CURVE_SEGMENTS = 32;

/** The line program's vertex shader: one instance per cubic piece, a triangle strip along it. */
export const VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 graph_template;  // t along the piece, side -1 or +1
layout(location = 1) in vec4 graph_p0c1;      // p0, c1
layout(location = 2) in vec4 graph_c2p3;      // c2, p3
layout(location = 3) in vec4 graph_rgba;      // straight rgba, 0..1
layout(location = 4) in vec4 graph_stroke;    // width, connection length, distance at the piece start, piece length
layout(location = 5) in vec4 graph_dash;      // on, off, on, off; zeros: solid
layout(location = 6) in vec4 graph_params0;   // effect params 0..3
layout(location = 7) in vec4 graph_params1;   // effect params 4..7

uniform vec2 graph_viewport;     // CSS pixels
uniform vec3 graph_camera;       // x, y, scale
uniform float graph_dpr;
uniform float graph_extraWidth;  // CSS pixels drawn outside each side of the stroke

out vec4 graph_vColor;
out float graph_vAcross;
out float graph_vHalfWidth;
out float graph_vHairline;
out float graph_vAlong;
out vec2 graph_vWorld;
flat out vec4 graph_vDash;
flat out float graph_vLength;
flat out vec4 graph_vParams0;
flat out vec4 graph_vParams1;

vec2 graph_bezier(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}

vec2 graph_bezierSlope(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}

void main() {
  float t = graph_template.x;
  vec2 p0 = graph_p0c1.xy;
  vec2 c1 = graph_p0c1.zw;
  vec2 c2 = graph_c2p3.xy;
  vec2 p3 = graph_c2p3.zw;
  vec2 d = graph_bezierSlope(p0, c1, c2, p3, t);
  if (dot(d, d) < 1e-12) d = p3 - p0;
  if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);
  vec2 dir = normalize(d);
  // Widths below one device pixel are drawn one pixel wide with reduced alpha, like canvas hairlines.
  float deviceWidth = graph_stroke.x * graph_camera.z * graph_dpr;
  float halfPx = max(deviceWidth, 1.0) * 0.5 / graph_dpr;
  // One device pixel more than the stroke and its extra width: room for the anti-aliased edge.
  float extent = halfPx + graph_extraWidth + 1.0 / graph_dpr;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 center = graph_bezier(p0, c1, c2, p3, t);
  // CSS pixels from the center line.
  vec2 offset = normal * graph_template.y * extent;
  vec2 screen = center * graph_camera.z + graph_camera.xy + offset;
  vec2 clip = screen / graph_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  graph_vAcross = graph_template.y * extent;
  graph_vHalfWidth = halfPx;
  graph_vHairline = min(deviceWidth, 1.0);
  graph_vColor = graph_rgba;
  graph_vAlong = graph_stroke.z + t * graph_stroke.w;
  // The vertex's world position, off the center line: each fragment interpolates its own.
  graph_vWorld = center + offset / graph_camera.z;
  graph_vDash = graph_dash;
  graph_vLength = graph_stroke.y;
  graph_vParams0 = graph_params0;
  graph_vParams1 = graph_params1;
}
`;

/** Everything an effect can read, before the effect's source. */
const FRAGMENT_PRELUDE = /* glsl */ `#version 300 es
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

uniform vec3 graph_camera;
uniform float graph_dpr;
uniform float graph_time;
uniform float graph_extraWidth;

out vec4 graph_fragColor;

struct ConnectionFragment {
  float along;       // world units from the source, continuous across segments
  float length;      // the whole connection's length, world units
  float t;           // along / length: 0 at the source, 1 at the target
  float across;      // CSS pixels from the center line, signed
  float halfWidth;   // half the drawn stroke width, CSS pixels
  float extraWidth;  // the effect's extraWidth, CSS pixels (0 without)
  float coverage;    // 0..1: how much of the pixel the stroke itself covers, anti-aliased
  float scale;       // CSS pixels per world unit
  vec2 world;        // the fragment's world position
  float time;        // seconds since the renderer started
  vec4 params0;      // params[0..3]
  vec4 params1;      // params[4..7]
};
`;

/** The effect of the plain stroke. */
const IDENTITY_EFFECT = /* glsl */ `vec4 effect(ConnectionFragment f, vec4 color) { return color; }`;

const FRAGMENT_MAIN = /* glsl */ `
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
  float edge = clamp((graph_vHalfWidth + graph_extraWidth - across) * graph_dpr + 0.5, 0.0, 1.0);
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
    graph_vParams1
  );
  vec4 color = effect(f, graph_vColor);
  float alpha = clamp(color.a, 0.0, 1.0) * edge * graph_vHairline;
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

/** The fill program's vertex shader: closed arrows as triangles in world coordinates. */
export const FILL_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 graph_position;  // world
layout(location = 1) in vec4 graph_rgba;      // straight rgba, 0..1

uniform vec2 graph_viewport;  // CSS pixels
uniform vec3 graph_camera;    // x, y, scale

out vec4 graph_vColor;

void main() {
  vec2 screen = graph_position * graph_camera.z + graph_camera.xy;
  vec2 clip = screen / graph_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  graph_vColor = graph_rgba;
}
`;

/** The fill program's fragment shader: the color premultiplied. The arrow's stroke anti-aliases its edge. */
export const FILL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 graph_vColor;

out vec4 graph_fragColor;

void main() {
  float alpha = clamp(graph_vColor.a, 0.0, 1.0);
  graph_fragColor = vec4(graph_vColor.rgb * alpha, alpha);
}
`;

/** Triangle strip along one piece: (t, side) pairs. */
export function createCurveTemplate(segments = CURVE_SEGMENTS): Float32Array {
  const vertices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    vertices.push(t, -1, t, 1);
  }
  return new Float32Array(vertices);
}
