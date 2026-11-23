/**
 * GLSL ES 3.00 of the scene programs. Every program reads its element (origin, depth key,
 * style) from the element table. The shared pass orders them with depth. When connection roots already precede
 * the rest, their subpixel paths can blend in painter order into a single-sample target. Both targets hold
 * premultiplied colour (see `SCENE_OUTPUT`). Effects reach the path program through one luma `ShaderPlugin`
 * (`createPathPlugin`), the only shader injection of the scene.
 */

import { DIM_TEXEL, PART_SLOTS, TABLE_WIDTH } from "../instances/tables";
import { DEPTH_INDICES } from "../order/depth";

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
