import { MAX_STYLES } from "./styles";

/**
 * Instance layout shared by both programs (12 floats):
 *   i_a = p0.xy, c1.xy
 *   i_b = c2.xy, p3.xy
 *   i_c = style slot, flags, dash offset (world), approximate length (world)
 *
 * Flags (sum of bits):
 *   1 - hidden
 *   2 - focused: drawn in full (no stubs) and with the arrow at any zoom
 *   4 - draw the arrow
 *   8 - overlay: drawn only in the overlay pass, on top of the others
 */
export const INSTANCE_FLOATS = 12;

export const FLAG_HIDDEN = 1;
export const FLAG_FOCUS = 2;
export const FLAG_ARROW = 4;
export const FLAG_OVERLAY = 8;

const COMMON = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 a_tpl;
layout(location = 1) in vec4 i_a;
layout(location = 2) in vec4 i_b;
layout(location = 3) in vec4 i_c;

uniform vec2 u_viewport;
uniform vec3 u_camera;
uniform float u_dpr;
uniform int u_pass;
uniform bool u_widthWorld;
uniform vec4 u_styleColor[${MAX_STYLES}];
uniform vec4 u_styleParams[${MAX_STYLES}];

out vec4 v_color;
out float v_across;
out float v_halfWidth;
out float v_alpha;
out float v_along;
flat out vec2 v_dash;

vec2 bez(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}

vec2 bezD(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}

bool rejected(int flags) {
  bool overlay = (flags & ${FLAG_OVERLAY}) != 0;
  return (flags & ${FLAG_HIDDEN}) != 0 || (u_pass == 0 && overlay) || (u_pass == 1 && !overlay);
}

// Extrudes a centerline point along the normal; widths below one device pixel are drawn one device
// pixel wide with reduced alpha (like canvas hairlines) instead of disappearing.
void emit(vec2 world, vec2 dir, int style, float side) {
  vec4 params = u_styleParams[style];
  float widthPx = u_widthWorld ? params.x * u_camera.z : params.x;
  float deviceWidth = widthPx * u_dpr;
  float halfPx = max(deviceWidth, 1.0) * 0.5 / u_dpr;
  float extent = halfPx + 1.0 / u_dpr;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 screen = world * u_camera.z + u_camera.xy + normal * side * extent;
  vec2 clip = screen / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_across = side * extent;
  v_halfWidth = halfPx;
  v_alpha = min(deviceWidth, 1.0);
  v_color = u_styleColor[style];
  v_dash = params.yz;
}
`;

/**
 * Curve program. The template is a triangle strip of two parts; a_tpl = (t in part, side, part).
 * Part 0 covers [0, tau], part 1 covers [1 - tau, 1]: with tau = 0.5 they join into the full curve,
 * with a smaller tau only the two stubs at the ends are drawn.
 */
export const CURVE_VERTEX = /* glsl */ `${COMMON}
uniform float u_stubPx;

void main() {
  int flags = int(i_c.y + 0.5);
  if (rejected(flags)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 p0 = i_a.xy;
  vec2 c1 = i_a.zw;
  vec2 c2 = i_b.xy;
  vec2 p3 = i_b.zw;

  float tau = 0.5;
  if (u_stubPx > 0.0 && (flags & ${FLAG_FOCUS}) == 0) {
    float chordPx = length(p3 - p0) * u_camera.z;
    tau = clamp(u_stubPx / max(chordPx, 0.001), 0.0, 0.5);
  }
  float t = a_tpl.z < 0.5 ? a_tpl.x * tau : 1.0 - tau + a_tpl.x * tau;

  vec2 d = bezD(p0, c1, c2, p3, t);
  if (dot(d, d) < 1e-12) d = p3 - p0;
  if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);

  emit(bez(p0, c1, c2, p3, t), normalize(d), int(i_c.x + 0.5), a_tpl.y);
  v_along = i_c.z + t * i_c.w;
}
`;

/**
 * Arrow program: two arms at the curve midpoint, same geometry as the canvas `getArrowCoords`
 * (45 degrees, 8 / cos(45deg) world units). a_tpl = (0 at the midpoint / 1 at the tip, side, arm -1/+1).
 */
export const ARROW_VERTEX = /* glsl */ `${COMMON}
uniform bool u_arrows;

void main() {
  int flags = int(i_c.y + 0.5);
  bool focused = (flags & ${FLAG_FOCUS}) != 0;
  if (rejected(flags) || (flags & ${FLAG_ARROW}) == 0 || (!u_arrows && !focused)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 p0 = i_a.xy;
  vec2 c1 = i_a.zw;
  vec2 c2 = i_b.xy;
  vec2 p3 = i_b.zw;

  vec2 mid = bez(p0, c1, c2, p3, 0.5);
  vec2 d = bezD(p0, c1, c2, p3, 0.5);
  if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);
  vec2 back = -normalize(d);
  float angle = 0.7853981634 * a_tpl.z;
  vec2 arm = vec2(back.x * cos(angle) - back.y * sin(angle), back.x * sin(angle) + back.y * cos(angle));
  vec2 world = mid + arm * (11.3137085 * a_tpl.x);

  emit(world, arm, int(i_c.x + 0.5), a_tpl.y);
  v_along = 0.0;
  v_dash = vec2(0.0);
}
`;

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
in float v_across;
in float v_halfWidth;
in float v_alpha;
in float v_along;
flat in vec2 v_dash;

uniform float u_dpr;

out vec4 outColor;

void main() {
  if (v_dash.x > 0.0 && mod(v_along, v_dash.x + v_dash.y) > v_dash.x) {
    discard;
  }
  float aa = 1.0 / u_dpr;
  float coverage = clamp((v_halfWidth - abs(v_across)) / aa + 0.5, 0.0, 1.0);
  float alpha = v_color.a * coverage * v_alpha;
  outColor = vec4(v_color.rgb * alpha, alpha);
}
`;

/** Segments per curve part. Two parts per curve, so a full curve has 2 * CURVE_SEGMENTS segments. */
export const CURVE_SEGMENTS = 32;

/** Triangle strip for both curve parts, joined with two degenerate vertices. */
export function createCurveTemplate(segments = CURVE_SEGMENTS): Float32Array {
  const vertices: number[] = [];
  for (let part = 0; part < 2; part++) {
    if (part === 1) {
      // repeat the last vertex of part 0 and the first vertex of part 1 to break the strip
      vertices.push(...vertices.slice(-3), 0, -1, 1);
    }
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      vertices.push(t, -1, part, t, 1, part);
    }
  }
  return new Float32Array(vertices);
}

/** Triangle strip for both arrow arms. */
export function createArrowTemplate(): Float32Array {
  const arm = (side: number) => [0, -1, side, 0, 1, side, 1, -1, side, 1, 1, side];
  const first = arm(-1);
  const second = arm(1);
  return new Float32Array([...first, ...first.slice(-3), ...second.slice(0, 3), ...second]);
}
