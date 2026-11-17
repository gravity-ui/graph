/**
 * GLSL ES 3.00 of the scene programs. Every program reads its element (origin, depth key,
 * style) from the element table. The shared pass orders them with depth. When connection roots already precede
 * the rest, their subpixel paths can blend in painter order into a single-sample target. Both targets hold
 * premultiplied colour (see `SCENE_OUTPUT`). Effects reach the path program through one luma `ShaderPlugin`
 * (`createPathPlugin`), the only shader injection of the scene.
 */

import type { ShaderModule, ShaderPlugin } from "@luma.gl/shadertools";

import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TUniformTypes } from "../../../components/canvas/connections/effects/types";
import { FRAGMENT_MAIN, FRAGMENT_PRELUDE, IDENTITY_EFFECT } from "../../../components/canvas/connections/webgl/shaders";

import { DEPTH_INDICES } from "./depth";
import { SDF_EDGE } from "./glyphs";
import { MIXED_PATH_SOURCE_BITS, MIXED_PATH_SOURCE_STRIDE } from "./mixedPathPlan";
import { DIM_TEXEL, PART_SLOTS, TABLE_WIDTH } from "./tables";

/** Shared by every vertex shader: frame uniforms, the element and style tables, depth, sizes and clip space. */
export const SCENE_COMMON = /* glsl */ `
uniform vec2 scene_viewport;            // CSS pixels
uniform vec3 scene_camera;              // x, y, scale: screen = world * scale + (x, y)
uniform float scene_time;               // seconds on the graph clock
uniform float scene_level;              // the current level's bit (1, 2 or 4); 0 draws every level
uniform float scene_subs;               // 2^subBits: the depth's sub-orders per element key (SceneDepth.subBits)
uniform highp sampler2D scene_elements; // per element: origin x, y, depth key (-1: hidden), style id
// A row per style: texels 0..15 override a part slot (rgba; a = -1: no override, -2: hidden), texels 16..31 are the
// slot's base colour (a = -1: none), texels 32..47 hold the slot's dim in r.
uniform highp sampler2D scene_styles;
uniform vec4 scene_dimColor;            // straight rgb, 0..1, that dim moves paints towards; a < 0: none, no dimming

// Hidden and culled vertices go outside the clip volume.
const vec4 SCENE_HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);

vec4 sceneElement(float index) {
  return texelFetch(scene_elements, ivec2(int(index) % ${TABLE_WIDTH}, int(index) / ${TABLE_WIDTH}), 0);
}

vec4 sceneStyle(float styleId, float slot) {
  return texelFetch(scene_styles, ivec2(int(slot), int(styleId)), 0);
}

vec4 sceneBase(float styleId, float slot) {
  return texelFetch(scene_styles, ivec2(int(slot) + ${PART_SLOTS}, int(styleId)), 0);
}

// depthOf(): larger is nearer. The key is the root's dense depth key and the sub is absolute (the sub base of a child
// element included), so a width change only changes scene_subs. key * scene_subs + sub stays below 2^23: exact floats.
float sceneDepth(float key, float sub) {
  return (key * scene_subs + sub + 1.0) / (${DEPTH_INDICES}.0 + 1.0);
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

// Whether a level mask (a sum of 1 minimalistic, 2 schematic, 4 detailed) includes the current level.
bool sceneOnLevel(float mask) {
  return scene_level < 0.5 || mod(floor(mask / scene_level), 2.0) >= 0.5;
}

// The colour with the style's override of the part slot: a >= 0 replaces it (a = 0 paints nothing).
vec4 sceneOverride(vec4 color, float styleId, float slot) {
  vec4 paint = sceneStyle(styleId, slot);
  return paint.a >= 0.0 ? paint : color;
}

// The paint of a part slot: an unset paint (USE_BASE_ALPHA, a < -2.5) takes the style's base colour, none paints
// nothing; then the style's override applies.
vec4 scenePaint(vec4 color, float styleId, float slot) {
  vec4 paint = color;
  if (paint.a < -2.5) {
    vec4 base = sceneBase(styleId, slot);
    paint = base.a < 0.0 ? vec4(0.0) : base;
  }
  return sceneOverride(paint, styleId, slot);
}

// Whether the style hides the part slot (visible: false, a < -1.5): then the whole primitive is not drawn.
bool sceneHidden(float styleId, float slot) {
  return sceneStyle(styleId, slot).a < -1.5;
}

// The dim of a part slot, 0..1; slot 0 holds the element's dim.
float sceneDim(float styleId, float slot) {
  return texelFetch(scene_styles, ivec2(int(slot) + ${DIM_TEXEL}, int(styleId)), 0).r;
}

// A straight paint (after scenePaint) moved towards the dim colour by the dim. The alpha is kept, so an opaque paint
// stays in the opaque pass; the fragment shader premultiplies afterwards, as for any paint.
vec4 sceneDimmed(vec4 paint, float dim) {
  return scene_dimColor.a < 0.0 ? paint : vec4(mix(paint.rgb, scene_dimColor.rgb, dim), paint.a);
}
`;

/**
 * What a fragment writes in each pass. The target holds premultiplied
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

/** Instance attributes of a filled triangle (see `encodeTriangles`). */
export const TRIANGLE_ATTRIBUTES = ["triangle_ids", "triangle_ab", "triangle_cScales", "triangle_fill"] as const;

export const TRIANGLE_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 scene_template;    // the first three corners of the quad template
layout(location = 1) in vec4 triangle_ids;      // element index, sub, part slot, level mask
layout(location = 2) in vec4 triangle_ab;       // first and second points
layout(location = 3) in vec4 triangle_cScales;  // third point, minScale, maxScale
layout(location = 4) in vec4 triangle_fill;     // straight rgba

${SCENE_COMMON}
flat out vec4 triangle_vColor;

void main() {
  vec4 element = sceneElement(triangle_ids.x);
  float slot = triangle_ids.z;
  if (sceneHidden(element.w, slot) || !sceneShown(element.z, triangle_cScales.z, triangle_cScales.w)
      || !sceneOnLevel(triangle_ids.w)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  vec2 point = scene_template.y > 0.5 ? triangle_cScales.xy : mix(triangle_ab.xy, triangle_ab.zw, scene_template.x);
  gl_Position = sceneClip(element.xy + point, sceneDepth(element.z, triangle_ids.y));
  triangle_vColor = sceneDimmed(scenePaint(triangle_fill, element.w, slot), sceneDim(element.w, slot));
}
`;

export const TRIANGLE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

flat in vec4 triangle_vColor;
out vec4 scene_fragColor;
${SCENE_OUTPUT}
void main() {
  float alpha = triangle_vColor.a;
  if (alpha < 0.002) discard;
  scene_fragColor = sceneOutput(triangle_vColor.rgb * alpha, alpha);
}
`;

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
layout(location = 4) in vec4 rect_fill;        // straight rgba; alpha 0: no fill, -3: the base colour
layout(location = 5) in vec4 rect_border;      // straight rgba; alpha 0: no border, -3: the base colour
layout(location = 6) in vec4 rect_borderSize;  // camera-aware width: mode, value, min, max
layout(location = 7) in vec4 rect_extra;       // align (0 inside, 1 center, 2 outside), minScale, maxScale, levelMask
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
  if (hidden || !sceneShown(element.z, rect_extra.y, rect_extra.z) || !sceneOnLevel(rect_extra.w)) {
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
  // The primitive's part slot: one of the two paint slots is the part's, the other is 0 (both 0 without a part). Dim
  // belongs to the primitive, so it moves both paints, as in the Canvas2D interpreter.
  float dim = sceneDim(element.w, max(rect_ids.z, rect_ids.w));
  rect_vFill = sceneDimmed(scenePaint(rect_fill, element.w, rect_ids.z), dim);
  rect_vBorder = sceneDimmed(scenePaint(rect_border, element.w, rect_ids.w), dim);
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

/**
 * The glyph program's sub attribute, a float per instance in a buffer of its own (`TEncodedGlyphs.subs`): a re-sub of
 * unchanged texts uploads only that buffer.
 */
export const GLYPH_SUB_ATTRIBUTE = "glyph_sub";

/** `SDF_EDGE` as a GLSL float literal. */
const GLYPH_EDGE = SDF_EDGE.toFixed(6);

export const GLYPH_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 scene_template;  // quad corner, 0..1
layout(location = 1) in vec4 glyph_ids;       // element index, clip left, part slot, clip right (+-1e9: none)
layout(location = 2) in vec4 glyph_quad;      // x, y, width, height at the layout size, from the text's anchor
layout(location = 3) in vec4 glyph_uv;        // u0, v0, u1, v1 in the atlas
layout(location = 4) in vec4 glyph_color;     // straight rgba; alpha -3: the base colour
layout(location = 5) in vec4 glyph_size;      // camera-aware font size: mode, value, min, max
layout(location = 6) in vec4 glyph_origin;    // the text's anchor x, y from the element origin, layout size, clip top
layout(location = 7) in vec4 glyph_scales;    // minScale, maxScale, levelMask, clip bottom
layout(location = 8) in float glyph_sub;      // the primitive's sub, from a buffer of its own
${SCENE_COMMON}
out vec2 glyph_vUv;
out vec2 glyph_vLocal;       // world units from the element origin
flat out vec4 glyph_vColor;
flat out vec4 glyph_vClip;   // the text's box from the element origin: left, top, right, bottom

void main() {
  vec4 element = sceneElement(glyph_ids.x);
  if (sceneHidden(element.w, glyph_ids.z) || !sceneShown(element.z, glyph_scales.x, glyph_scales.y)
      || !sceneOnLevel(glyph_scales.z)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  // The text's block of lines scales about its anchor by the resolved size over the size its quads were placed at:
  // between line breaks the glyphs follow the camera continuously (textLayout.ts).
  float s = sceneSize(glyph_size, scene_camera.z) / glyph_origin.z;
  vec2 local = glyph_origin.xy + (glyph_quad.xy + scene_template * glyph_quad.zw) * s;
  gl_Position = sceneClip(element.xy + local, sceneDepth(element.z, glyph_sub));
  glyph_vUv = mix(glyph_uv.xy, glyph_uv.zw, scene_template);
  glyph_vLocal = local;
  glyph_vClip = vec4(glyph_ids.y, glyph_origin.w, glyph_ids.w, glyph_scales.w);
  glyph_vColor = sceneDimmed(scenePaint(glyph_color, element.w, glyph_ids.z), sceneDim(element.w, glyph_ids.z));
}
`;

export const GLYPH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D scene_atlas;

in vec2 glyph_vUv;
in vec2 glyph_vLocal;
flat in vec4 glyph_vColor;
flat in vec4 glyph_vClip;

out vec4 scene_fragColor;
${SCENE_OUTPUT}
void main() {
  // The sample and its derivative come first: derivatives need uniform control flow, before any discard.
  float sdf = texture(scene_atlas, glyph_vUv).r;
  // The field's change per screen pixel across the outline: its gradient's length, on curves and diagonals too.
  float grad = max(length(vec2(dFdx(sdf), dFdy(sdf))), 1e-4);
  // No ink outside the box of a text whose layout overflows it, as Canvas2D clips it (unbounded for the others).
  if (glyph_vLocal.x < glyph_vClip.x || glyph_vLocal.x > glyph_vClip.z || glyph_vLocal.y < glyph_vClip.y
      || glyph_vLocal.y > glyph_vClip.w) {
    discard;
  }
  // The pixel's coverage: a one-pixel ramp centred on the outline (SDF_EDGE, glyphs.ts), as the rect program's edges.
  float alpha = clamp(0.5 + (sdf - ${GLYPH_EDGE}) / grad, 0.0, 1.0) * glyph_vColor.a;
  if (alpha < 0.002) discard;
  scene_fragColor = sceneOutput(glyph_vColor.rgb * alpha, alpha);
}
`;

const MIXED_RECORD_ADDRESS = /* glsl */ `
  int packedSlot = int(graph_recordId);
  graph_source = packedSlot >> ${MIXED_PATH_SOURCE_BITS};
  int record = (packedSlot & ${MIXED_PATH_SOURCE_STRIDE - 1}) * 10;
  int lane = graph_source & 3;
  int rowWidth = graph_source < 4 ? graph_widths0[lane] : graph_widths1[lane];
  int flags = graph_source < 4 ? graph_kinds0[lane] : graph_kinds1[lane];
  int kind = flags & 31;
  graph_vMixedPlain = float(flags >> 5);
  graph_recordBase = ivec2(record % rowWidth, record / rowWidth);
  // Records each occupy ten contiguous texels from the start of a physical row.
  record = 0;
`;

function mixedRecordDeclarations(count: number): string {
  const samplers = Array.from({ length: count }, (_, i) => `uniform highp sampler2D graph_records${i};`).join("\n");
  return `${samplers}
uniform ivec4 graph_widths0;
uniform ivec4 graph_widths1;
uniform ivec4 graph_kinds0;
uniform ivec4 graph_kinds1;
int graph_source;
ivec2 graph_recordBase;`;
}

function mixedRecordLookup(count: number): string {
  const branches = Array.from(
    { length: count - 1 },
    (_, i) => `if (graph_source == ${i}) return texelFetch(graph_records${i}, address, 0);`
  ).join("\n  ");
  return `vec4 graph_record(int texel) {
  ivec2 address = graph_recordBase + ivec2(texel, 0);
  ${branches}
  return texelFetch(graph_records${count - 1}, address, 0);
}`;
}

/**
 * #451's line vertex shader with the element: control points are relative to the element origin, the depth comes
 * from the element key and the path's sub, the style paints the stroke by the path's part slot, and a hidden
 * element or a camera scale outside the path's bounds moves the instance out of the clip volume.
 */
export const PATH_VERTEX = pathVertex(0);

/** Link only the sampler slots this mixed draw needs. */
export function createMixedPathVertex(sourceCount: number): string {
  return pathVertex(sourceCount);
}

function pathVertex(sourceCount: number): string {
  return /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 graph_template;     // t along the piece, side -1 or +1
layout(location = 1) in float graph_recordId;    // stable resident slot, gathered in logical draw order
${
  sourceCount
    ? mixedRecordDeclarations(sourceCount)
    : `uniform highp sampler2D graph_records;
uniform int graph_recordWidth;`
}

uniform vec2 graph_viewport;     // CSS pixels
uniform vec3 graph_camera;       // x, y, scale
uniform float graph_dpr;
uniform float graph_extraWidth;  // CSS pixels drawn outside each side of the stroke
uniform float graph_curveStep;   // dyadic template stride, 1 for the complete resident strip
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
${sourceCount ? "flat out float graph_vMixedPlain;" : ""}

vec2 graph_bezier(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}

vec2 graph_bezierSlope(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}

${
  sourceCount
    ? mixedRecordLookup(sourceCount)
    : `vec4 graph_record(int texel) {
  return texelFetch(graph_records, ivec2(texel % graph_recordWidth, texel / graph_recordWidth), 0);
}`
}

void main() {
  ${sourceCount ? MIXED_RECORD_ADDRESS : "int record = int(graph_recordId) * 10;"}
  vec4 graph_p0c1 = graph_record(record);         // p0, c1
  vec4 graph_c2p3 = graph_record(record + 1);     // c2, p3
  vec4 graph_rgba = graph_record(record + 2);    // straight rgba; alpha -3: base colour
  vec4 graph_stroke = graph_record(record + 3);  // width, full length, piece start and length
  vec4 graph_dash = graph_record(record + 4);
  vec4 graph_params0 = graph_record(record + 5);
  vec4 graph_params1 = graph_record(record + 6);
  vec4 graph_interaction = graph_record(record + 7);
  vec4 scene_pathIds = graph_record(record + 8); // element, sub, stroke part slot, width minimum
  vec4 scene_pathScales = graph_record(record + 9); // min/max scale, level and width mode, width maximum
  vec4 element = sceneElement(scene_pathIds.x);
  int levelAndWidth = int(scene_pathScales.z);
  if (sceneHidden(element.w, scene_pathIds.z) || !sceneShown(element.z, scene_pathScales.x, scene_pathScales.y)
      || !sceneOnLevel(float(levelAndWidth & 7))) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  float t = ${
    sourceCount
      ? "kind == 1 ? (gl_VertexID < 2 ? 0.0 : 1.0) : min(1.0, graph_template.x * (kind == 8 ? 2.0 : 1.0))"
      : "graph_template.x * graph_curveStep"
  };
  vec2 p0 = graph_p0c1.xy + element.xy;
  vec2 c1 = graph_p0c1.zw + element.xy;
  vec2 c2 = graph_c2p3.xy + element.xy;
  vec2 p3 = graph_c2p3.zw + element.xy;
  vec2 d = graph_bezierSlope(p0, c1, c2, p3, t);
  if (dot(d, d) < 1e-12) d = p3 - p0;
  if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);
  vec2 dir = normalize(d);
  // Widths below one device pixel are drawn one pixel wide with reduced alpha, like canvas hairlines.
  float mode = float(levelAndWidth >> 3);
  float width = sceneSize(vec4(mode, graph_stroke.x, scene_pathIds.w, scene_pathScales.w), graph_camera.z);
  float deviceWidth = width * graph_camera.z * graph_dpr;
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
  graph_vColor = sceneDimmed(
    scenePaint(graph_rgba, element.w, scene_pathIds.z),
    sceneDim(element.w, scene_pathIds.z)
  );
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
}

/** #451's fragment `main()`: the application source of the path program. */
export const PATH_FRAGMENT = `#version 300 es\n${FRAGMENT_MAIN}`;

/** Plain paths use the same identity treatment even when they share an effect program. */
export const MIXED_PATH_FRAGMENT = `#version 300 es
precision highp float;
flat in float graph_vMixedPlain;
${FRAGMENT_MAIN.replace(
  "vec4 color = effect(f, graph_vColor);",
  "vec4 color = graph_vMixedPlain > 0.5 ? (graph_vInteraction.z * f.selected > 0.5 ? f.selectionColor : graph_vColor) : effect(f, graph_vColor);"
)}`;

export const MIXED_COMPOSITE_VERTEX = /* glsl */ `#version 300 es
void main() {
  const vec2 vertices[3] = vec2[3](vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
  gl_Position = vec4(vertices[gl_VertexID], 0, 1);
}
`;

export const MIXED_COMPOSITE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D graph_connectionColor;
out vec4 scene_fragColor;
void main() {
  scene_fragColor = texelFetch(graph_connectionColor, ivec2(gl_FragCoord.xy), 0);
}
`;

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
const OPAQUE_PASS_OUTPUT = /* glsl */ `  if (scene_opaquePass > 0.5 && graph_fragColor.a > 0.0) {
    graph_fragColor.rgb /= graph_fragColor.a;
  }
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
