export const CURVE_SEGMENTS = 32;

export const VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_tpl;     // t along the segment, side -1 or +1
layout(location = 1) in vec4 i_a;       // p0, c1
layout(location = 2) in vec4 i_b;       // c2, p3
layout(location = 3) in vec4 i_color;   // rgba
layout(location = 4) in vec4 i_stroke;  // width (world), dash on, dash off, dash speed
layout(location = 5) in vec4 i_dist;    // distance at the segment start, segment length, dash fade, connection length
layout(location = 6) in vec4 i_pulse;   // pulse period (s), pulse wavelength (world), unused, unused
layout(location = 7) in vec4 i_params0; // effect params 0..3
layout(location = 8) in vec4 i_params1; // effect params 4..7

uniform vec2 u_viewport;  // CSS pixels
uniform vec3 u_camera;    // x, y, scale
uniform float u_dpr;

out vec4 v_color;
out float v_across;
out float v_halfWidth;
out float v_alpha;
out float v_along;
out vec2 v_world;
flat out vec3 v_dash;
flat out vec3 v_effect;
flat out float v_length;
flat out vec4 v_params0;
flat out vec4 v_params1;

vec2 bez(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}

vec2 bezD(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}

void main() {
  float t = a_tpl.x;
  vec2 p0 = i_a.xy;
  vec2 c1 = i_a.zw;
  vec2 c2 = i_b.xy;
  vec2 p3 = i_b.zw;
  vec2 d = bezD(p0, c1, c2, p3, t);
  if (dot(d, d) < 1e-12) d = p3 - p0;
  if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);
  vec2 dir = normalize(d);
  // Widths below one device pixel are drawn one pixel wide with reduced alpha, like canvas hairlines.
  float deviceWidth = i_stroke.x * u_camera.z * u_dpr;
  float halfPx = max(deviceWidth, 1.0) * 0.5 / u_dpr;
  float extent = halfPx + 1.0 / u_dpr;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 world = bez(p0, c1, c2, p3, t);
  vec2 screen = world * u_camera.z + u_camera.xy + normal * a_tpl.y * extent;
  vec2 clip = screen / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_across = a_tpl.y * extent;
  v_halfWidth = halfPx;
  v_alpha = min(deviceWidth, 1.0);
  v_color = i_color;
  v_along = i_dist.x + t * i_dist.y;
  v_world = world;
  v_dash = i_stroke.yzw;
  v_effect = vec3(i_dist.z, i_pulse.xy);
  v_length = i_dist.w;
  v_params0 = i_params0;
  v_params1 = i_params1;
}
`;

const FRAGMENT_HEADER = /* glsl */ `#version 300 es
precision highp float;
`;

const FRAGMENT_INPUTS = /* glsl */ `
in vec4 v_color;
in float v_across;
in float v_halfWidth;
in float v_alpha;
in float v_along;
in vec2 v_world;
flat in vec3 v_dash;
flat in vec3 v_effect;  // dash fade, pulse period, pulse wavelength
flat in float v_length;
flat in vec4 v_params0;
flat in vec4 v_params1;

uniform vec3 u_camera;
uniform float u_dpr;
uniform float u_time;

out vec4 outColor;

struct ConnectionFragment {
  float along;
  float length;
  float t;
  float across;
  float halfWidth;
  float scale;
  vec2 world;
  float time;
  vec4 params0;
  vec4 params1;
};
`;

const FRAGMENT_MAIN = /* glsl */ `
void main() {
  float shade = 1.0;
  if (v_dash.x > 0.0) {
    // A running dash moves from source to target, like a decreasing canvas lineDashOffset.
    float phase = mod(v_along - u_time * v_dash.z, v_dash.x + v_dash.y);
    if (phase > v_dash.x) discard;
    if (v_effect.x > 0.0) {
      // A comet: the head leads in the direction of motion, the tail fades out behind it.
      float head = v_dash.z >= 0.0 ? phase / v_dash.x : 1.0 - phase / v_dash.x;
      shade *= head * head;
    }
  }
  if (v_effect.y > 0.0) {
    float wave = v_effect.z > 0.0 ? v_world.x / v_effect.z : 0.0;
    float pulse = 0.5 + 0.5 * cos(6.2831853 * (u_time / v_effect.y - wave));
    // A narrow crest over a dim line reads as a signal passing by.
    shade *= mix(0.15, 1.0, pow(pulse, 4.0));
  }
  vec4 color = vec4(v_color.rgb, v_color.a * shade);
#ifdef CONNECTION_EFFECT
  float t = v_length > 0.0 ? clamp(v_along / v_length, 0.0, 1.0) : 0.0;
  ConnectionFragment f = ConnectionFragment(
    v_along, v_length, t, v_across, v_halfWidth, u_camera.z, v_world, u_time, v_params0, v_params1
  );
  color = effect(f, color);
#endif
  float coverage = clamp((v_halfWidth - abs(v_across)) * u_dpr + 0.5, 0.0, 1.0);
  float alpha = clamp(color.a, 0.0, 1.0) * coverage * v_alpha;
  outColor = vec4(color.rgb * alpha, alpha);
}
`;

/**
 * The fragment shader of connection lines; with `effect` (GLSL defining `vec4 effect(ConnectionFragment f, vec4
 * color)`, see `TConnectionEffect`), every fragment's color goes through it.
 */
export function createFragmentShader(effect?: string): string {
  if (effect === undefined) return FRAGMENT_HEADER + FRAGMENT_INPUTS + FRAGMENT_MAIN;
  return `${FRAGMENT_HEADER}#define CONNECTION_EFFECT\n${FRAGMENT_INPUTS}\n${effect}\n${FRAGMENT_MAIN}`;
}

/** Triangle strip along one segment: (t, side) pairs. */
export function createCurveTemplate(segments = CURVE_SEGMENTS): Float32Array {
  const vertices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    vertices.push(t, -1, t, 1);
  }
  return new Float32Array(vertices);
}
