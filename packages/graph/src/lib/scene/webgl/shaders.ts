/**
 * GLSL ES 3.00 of the scene programs: rects, glyphs and paths. Every program reads its element (origin, depth key,
 * style) from the element table and writes its depth from the key, so one depth buffer orders all of them. The target
 * holds premultiplied colour (see `SCENE_OUTPUT`). Effects reach the path program through one luma `ShaderPlugin`
 * (`createPathPlugin`), the only shader injection of the scene.
 */

import type { ShaderModule, ShaderPlugin } from "@luma.gl/shadertools";

import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TUniformTypes } from "../../../components/canvas/connections/effects/types";
import { FRAGMENT_MAIN, FRAGMENT_PRELUDE, IDENTITY_EFFECT } from "../../../components/canvas/connections/webgl/shaders";

import { SCENE_DEPTH } from "./depth";
import { TABLE_WIDTH } from "./tables";

const SUBS = 2 ** SCENE_DEPTH.SUB_BITS;
const KEYS = 2 ** (SCENE_DEPTH.BAND_BITS + SCENE_DEPTH.RANK_BITS + SCENE_DEPTH.SUB_BITS);

/** Shared by every vertex shader: frame uniforms, the element and style tables, depth, sizes and clip space. */
export const SCENE_COMMON = /* glsl */ `
uniform vec2 scene_viewport;            // CSS pixels
uniform vec3 scene_camera;              // x, y, scale: screen = world * scale + (x, y)
uniform float scene_time;               // seconds on the graph clock
uniform highp sampler2D scene_elements; // per element: origin x, y, depth key (-1: hidden), style id
uniform highp sampler2D scene_styles;   // a row per style, a texel per part slot: rgba, a = -1 without an override

// Hidden and culled vertices go outside the clip volume.
const vec4 SCENE_HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);

vec4 sceneElement(float index) {
  return texelFetch(scene_elements, ivec2(int(index) % ${TABLE_WIDTH}, int(index) / ${TABLE_WIDTH}), 0);
}

vec4 sceneStyle(float styleId, float slot) {
  return texelFetch(scene_styles, ivec2(int(slot), int(styleId)), 0);
}

// depthOf(): larger is nearer.
float sceneDepth(float key, float sub) {
  return (key * ${SUBS}.0 + sub + 1.0) / (${KEYS}.0 + 1.0);
}

// resolveSceneSize() of a size written as (mode, value, min, max).
float sceneSize(vec4 size, float scale) {
  if (size.x < 0.5) return size.y;
  if (size.x < 1.5) return clamp(size.y / scale, size.z, size.w);
  return clamp(size.y * scale, size.z, size.w) / scale;
}

vec4 sceneClip(vec2 world, float depth) {
  vec2 screen = world * scene_camera.z + scene_camera.xy;
  return vec4((screen / scene_viewport) * vec2(2.0, -2.0) + vec2(-1.0, 1.0), depth * 2.0 - 1.0, 1.0);
}

// Whether a primitive of the element with this key is drawn: the element is not hidden and the camera scale lies in
// [minScale, maxScale).
bool sceneShown(float key, float minScale, float maxScale) {
  return key >= 0.0 && scene_camera.z >= minScale && scene_camera.z < maxScale;
}

// The colour with the style's override of the part slot: a >= 0 replaces it (a = 0 paints nothing).
vec4 sceneOverride(vec4 color, float styleId, float slot) {
  vec4 paint = sceneStyle(styleId, slot);
  return paint.a >= 0.0 ? paint : color;
}

// Whether the style hides the part slot (visible: false, a < -1.5): then the whole primitive is not drawn.
bool sceneHidden(float styleId, float slot) {
  return sceneStyle(styleId, slot).a < -1.5;
}
`;

/**
 * Shared by the rect and glyph fragment shaders: what a fragment writes in each pass. The target holds premultiplied
 * colour.
 * - The opaque pass (alpha to coverage, no blending) writes the colour at full strength and the coverage as alpha:
 *   alpha to coverage turns the alpha into the sample mask, and the alpha pass then makes the covered samples opaque.
 *   So each covered sample holds the opaque colour and the resolve weighs it by coverage.
 * - The translucent pass writes premultiplied colour for "over" blending (one, one-minus-src-alpha).
 */
export const SCENE_OUTPUT = /* glsl */ `
uniform float scene_opaquePass;  // 1.0 in the opaque pass, 0.0 in the translucent one

vec4 sceneOutput(vec3 premultiplied, float alpha) {
  return scene_opaquePass > 0.5 ? vec4(premultiplied / alpha, alpha) : vec4(premultiplied, alpha);
}
`;

/** The quad of a rect or glyph instance as a triangle strip. */
export const QUAD_TEMPLATE = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

/** Instance attributes of the rect program, one vec4 each, in instance order (see `encodeRects`). */
export const RECT_ATTRIBUTES = [
  "rect_ids",
  "rect_box",
  "rect_radius",
  "rect_fill",
  "rect_border",
  "rect_borderSize",
  "rect_extra",
] as const;

export const RECT_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 scene_template;   // quad corner, 0..1
layout(location = 1) in vec4 rect_ids;         // element index, sub, fill slot, border slot
layout(location = 2) in vec4 rect_box;         // x, y, width, height from the element origin
layout(location = 3) in vec4 rect_radius;      // top-left, top-right, bottom-right, bottom-left
layout(location = 4) in vec4 rect_fill;        // straight rgba; alpha 0: no fill
layout(location = 5) in vec4 rect_border;      // straight rgba; alpha 0: no border
layout(location = 6) in vec4 rect_borderSize;  // camera-aware width: mode, value, min, max
layout(location = 7) in vec4 rect_extra;       // align (0 inside, 1 center, 2 outside), minScale, maxScale
${SCENE_COMMON}
out vec2 rect_vLocal;        // world units from the rect's center
flat out vec2 rect_vHalfSize;
flat out vec4 rect_vRadius;
flat out vec4 rect_vFill;
flat out vec4 rect_vBorder;
flat out vec2 rect_vEdges;   // the border band: distances of its inner and outer edge

void main() {
  vec4 element = sceneElement(rect_ids.x);
  bool hidden = sceneHidden(element.w, rect_ids.z) || sceneHidden(element.w, rect_ids.w);
  if (hidden || !sceneShown(element.z, rect_extra.y, rect_extra.z)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  float scale = scene_camera.z;
  float width = sceneSize(rect_borderSize, scale);
  float outer = rect_extra.x < 0.5 ? 0.0 : (rect_extra.x < 1.5 ? width * 0.5 : width);
  // One CSS pixel past the border's outer edge: room for the anti-aliased edge.
  float pad = outer + 1.0 / scale;
  vec2 halfSize = rect_box.zw * 0.5;
  vec2 local = (scene_template * 2.0 - 1.0) * (halfSize + pad);
  gl_Position = sceneClip(element.xy + rect_box.xy + halfSize + local, sceneDepth(element.z, rect_ids.y));
  rect_vLocal = local;
  rect_vHalfSize = halfSize;
  rect_vRadius = rect_radius;
  rect_vFill = sceneOverride(rect_fill, element.w, rect_ids.z);
  rect_vBorder = sceneOverride(rect_border, element.w, rect_ids.w);
  rect_vEdges = vec2(outer - width, outer);
}
`;

export const RECT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 rect_vLocal;
flat in vec2 rect_vHalfSize;
flat in vec4 rect_vRadius;
flat in vec4 rect_vFill;
flat in vec4 rect_vBorder;
flat in vec2 rect_vEdges;

out vec4 scene_fragColor;
${SCENE_OUTPUT}
// Signed distance to a rounded box around the origin; radii: top-left, top-right, bottom-right, bottom-left.
float roundedBox(vec2 p, vec2 halfSize, vec4 radii) {
  float r = p.x < 0.0 ? (p.y < 0.0 ? radii.x : radii.w) : (p.y < 0.0 ? radii.y : radii.z);
  r = min(r, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Anti-aliased coverage of the region whose distance is below the edge.
float below(float d, float edge, float aa) {
  return clamp(0.5 - (d - edge) / aa, 0.0, 1.0);
}

void main() {
  float d = roundedBox(rect_vLocal, rect_vHalfSize, rect_vRadius);
  float aa = max(fwidth(d), 1e-6);
  // The fill covers the whole rect and the border band lies over it, as Canvas2D strokes over the fill.
  float fillAlpha = rect_vFill.a * below(d, 0.0, aa);
  float borderAlpha = rect_vBorder.a * max(below(d, rect_vEdges.y, aa) - below(d, rect_vEdges.x, aa), 0.0);
  float alpha = borderAlpha + fillAlpha * (1.0 - borderAlpha);
  if (alpha < 0.002) discard;
  vec3 color = rect_vBorder.rgb * borderAlpha + rect_vFill.rgb * fillAlpha * (1.0 - borderAlpha);
  scene_fragColor = sceneOutput(color, alpha);
}
`;

/** Instance attributes of the glyph program, one vec4 each, in instance order (see `encodeText`). */
export const GLYPH_ATTRIBUTES = [
  "glyph_ids",
  "glyph_quad",
  "glyph_uv",
  "glyph_color",
  "glyph_size",
  "glyph_origin",
  "glyph_scales",
] as const;

export const GLYPH_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 scene_template;  // quad corner, 0..1
layout(location = 1) in vec4 glyph_ids;       // element index, sub, part slot
layout(location = 2) in vec4 glyph_quad;      // x, y, width, height at the base size, from the text origin
layout(location = 3) in vec4 glyph_uv;        // u0, v0, u1, v1 in the atlas
layout(location = 4) in vec4 glyph_color;     // straight rgba
layout(location = 5) in vec4 glyph_size;      // camera-aware font size: mode, value, min, max
layout(location = 6) in vec4 glyph_origin;    // text origin x, y from the element origin, base size
layout(location = 7) in vec4 glyph_scales;    // minScale, maxScale
${SCENE_COMMON}
out vec2 glyph_vUv;
flat out vec4 glyph_vColor;

void main() {
  vec4 element = sceneElement(glyph_ids.x);
  if (sceneHidden(element.w, glyph_ids.z) || !sceneShown(element.z, glyph_scales.x, glyph_scales.y)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  float s = sceneSize(glyph_size, scene_camera.z) / glyph_origin.z;
  vec2 world = element.xy + glyph_origin.xy + (glyph_quad.xy + scene_template * glyph_quad.zw) * s;
  gl_Position = sceneClip(world, sceneDepth(element.z, glyph_ids.y));
  glyph_vUv = mix(glyph_uv.xy, glyph_uv.zw, scene_template);
  glyph_vColor = sceneOverride(glyph_color, element.w, glyph_ids.z);
}
`;

export const GLYPH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D scene_atlas;

in vec2 glyph_vUv;
flat in vec4 glyph_vColor;

out vec4 scene_fragColor;
${SCENE_OUTPUT}
void main() {
  float sdf = texture(scene_atlas, glyph_vUv).r;
  // tiny-sdf with cutoff 0.25 puts the glyph's edge at 0.75.
  float e = max(fwidth(sdf) * 0.7, 1e-4);
  float alpha = smoothstep(0.75 - e, 0.75 + e, sdf) * glyph_vColor.a;
  if (alpha < 0.002) discard;
  scene_fragColor = sceneOutput(glyph_vColor.rgb * alpha, alpha);
}
`;

/** Instance attributes of the path program by location (see #451's `INSTANCE_ATTRIBUTES`). */
export const PATH_ATTRIBUTES: Readonly<Record<number, string>> = {
  1: "graph_p0c1",
  2: "graph_c2p3",
  3: "graph_rgba",
  4: "graph_stroke",
  5: "graph_dash",
  6: "graph_params0",
  7: "graph_params1",
  8: "graph_interaction",
};

/** Per-instance element data of the path program, one vec4 each (see `PATH_ELEMENT_FLOATS`). */
export const PATH_ELEMENT_ATTRIBUTES = ["scene_pathIds", "scene_pathScales"] as const;

/**
 * #451's line vertex shader with the element: control points are relative to the element origin, the depth comes
 * from the element key and the path's sub, the style overrides the stroke colour by the path's part slot, and a hidden
 * element or a camera scale outside the path's bounds moves the instance out of the clip volume.
 */
export const PATH_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 graph_template;     // t along the piece, side -1 or +1
layout(location = 1) in vec4 graph_p0c1;         // p0, c1
layout(location = 2) in vec4 graph_c2p3;         // c2, p3
layout(location = 3) in vec4 graph_rgba;         // straight rgba, 0..1
layout(location = 4) in vec4 graph_stroke;       // width, connection length, distance at the piece start, piece length
layout(location = 5) in vec4 graph_dash;         // on, off, on, off; zeros: solid
layout(location = 6) in vec4 graph_params0;      // effect params 0..3
layout(location = 7) in vec4 graph_params1;      // effect params 4..7
// Selection rgb; hovered + 2 selected + 4 round(alpha * 255) + 1024 when the effect shows the selection.
layout(location = 8) in vec4 graph_interaction;
layout(location = 9) in vec4 scene_pathIds;      // element index, sub, stroke part slot
layout(location = 10) in vec4 scene_pathScales; // minScale, maxScale

uniform vec2 graph_viewport;     // CSS pixels
uniform vec3 graph_camera;       // x, y, scale
uniform float graph_dpr;
uniform float graph_extraWidth;  // CSS pixels drawn outside each side of the stroke
${SCENE_COMMON}
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
flat out vec3 graph_vInteraction;     // hovered, selected, the effect shows the selection: 0.0 or 1.0
flat out vec4 graph_vSelectionColor;  // straight rgba

vec2 graph_bezier(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}

vec2 graph_bezierSlope(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}

void main() {
  vec4 element = sceneElement(scene_pathIds.x);
  if (sceneHidden(element.w, scene_pathIds.z) || !sceneShown(element.z, scene_pathScales.x, scene_pathScales.y)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  float t = graph_template.x;
  vec2 p0 = graph_p0c1.xy + element.xy;
  vec2 c1 = graph_p0c1.zw + element.xy;
  vec2 c2 = graph_c2p3.xy + element.xy;
  vec2 p3 = graph_c2p3.zw + element.xy;
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
  gl_Position = vec4(clip.x, -clip.y, sceneDepth(element.z, scene_pathIds.y) * 2.0 - 1.0, 1.0);
  graph_vAcross = graph_template.y * extent;
  graph_vHalfWidth = halfPx;
  graph_vHairline = min(deviceWidth, 1.0);
  graph_vColor = sceneOverride(graph_rgba, element.w, scene_pathIds.z);
  graph_vAlong = graph_stroke.z + t * graph_stroke.w;
  // The vertex's world position, off the center line: each fragment interpolates its own.
  graph_vWorld = center + offset / graph_camera.z;
  graph_vDash = graph_dash;
  graph_vLength = graph_stroke.y;
  graph_vParams0 = graph_params0;
  graph_vParams1 = graph_params1;
  int interaction = int(graph_interaction.w + 0.5);
  graph_vInteraction = vec3(float(interaction & 1), float((interaction >> 1) & 1), float((interaction >> 10) & 1));
  graph_vSelectionColor = vec4(graph_interaction.xyz, float((interaction >> 2) & 255) / 255.0);
}
`;

/** #451's fragment `main()`: the application source of the path program. */
export const PATH_FRAGMENT = `#version 300 es\n${FRAGMENT_MAIN}`;

/**
 * #451's fragment prelude (inputs, uniforms, `ConnectionFragment`, effect helpers) as a shader module. luma places
 * module sources before the `fs:#decl` injections and those before the application source, so the effect lands
 * between the prelude and `main()`.
 */
const PATH_PRELUDE_MODULE: ShaderModule = {
  name: "sceneConnectionFragment",
  // The assembler writes its own #version line.
  fs: FRAGMENT_PRELUDE.slice(FRAGMENT_PRELUDE.indexOf("\n") + 1),
};

/**
 * #451's main() writes premultiplied colour, which the translucent pass blends as is. The opaque pass needs the colour
 * at full strength with the coverage as alpha (see `SCENE_OUTPUT`).
 */
const OPAQUE_PASS_OUTPUT = /* glsl */ `  if (scene_opaquePass > 0.5 && graph_fragColor.a > 0.0) graph_fragColor.rgb /= graph_fragColor.a;
`;

/**
 * The one shader injection of the scene: the path program's effect (the plain stroke without one) after the
 * connection prelude, and the opaque pass's output at the end of `main()`. Compiler logs count lines from the
 * effect's first line, as in #451.
 */
export function createPathPlugin(effect: ConnectionEffect<TUniformTypes, never> | undefined): ShaderPlugin {
  const source = effect ? `${effect.uniformDeclarations}#line 1\n${effect.fragment}` : IDENTITY_EFFECT;
  return {
    name: "sceneConnectionEffect",
    modules: [PATH_PRELUDE_MODULE],
    injections: [
      { target: "fs:#decl", injection: `uniform float scene_opaquePass;\n${source}` },
      { target: "fs:#main-end", injection: OPAQUE_PASS_OUTPUT },
    ],
  };
}

/** The alpha pass: the whole viewport at depth 0, so a depth test "less" reaches only samples geometry wrote. */
export const ALPHA_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 scene_template;  // quad corner, 0..1

void main() {
  gl_Position = vec4(scene_template * 2.0 - 1.0, -1.0, 1.0);
}
`;

/** Writes alpha 1; the pass masks the colour channels. */
export const ALPHA_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

out vec4 scene_fragColor;

void main() {
  scene_fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;
