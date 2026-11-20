import { TEXT_METRICS_PX } from "../../text/textLayout";
import { USE_BASE_ALPHA } from "../instances/tables";
import { SDF_EDGE } from "../text/GlyphAtlas";

import { SCENE_COMMON, SCENE_OUTPUT } from "./scene";

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

uniform float scene_glyphPass; // 0: ordinary opaque, 1: blended, 2: shared opaque view after fade-in

layout(location = 0) in vec2 scene_template;  // quad corner, 0..1
layout(location = 1) in vec4 glyph_ids;       // element index, clip left, part slot, clip right (+-1e9: none)
layout(location = 2) in vec4 glyph_quad;      // x, y, width, height at the layout size, from the text's anchor
layout(location = 3) in vec4 glyph_uv;        // u0, v0, u1, v1 in the atlas
layout(location = 4) in vec4 glyph_color;     // straight rgba; alpha -3: the base colour
layout(location = 5) in vec4 glyph_size;      // camera-aware font size: mode, value, min, max
layout(location = 6) in vec4 glyph_origin;    // the text's anchor x, y from the element origin, fade end, clip top
layout(location = 7) in vec4 glyph_scales;    // minScale, maxScale, levelMask, clip bottom
layout(location = 8) in float glyph_sub;      // the primitive's sub, from a buffer of its own
${SCENE_COMMON}
out vec2 glyph_vUv;
out vec2 glyph_vLocal;       // world units from the element origin
flat out vec4 glyph_vColor;
flat out vec4 glyph_vClip;   // the text's box from the element origin: left, top, right, bottom

void main() {
  vec4 element = sceneElement(glyph_ids.x);
  bool revealed = glyph_origin.z > glyph_scales.x && scene_camera.z >= glyph_origin.z
    && (glyph_color.a >= 1.0 || glyph_color.a == ${USE_BASE_ALPHA.toFixed(1)});
  if (sceneHidden(element.w, glyph_ids.z) || !sceneShown(element.z, glyph_scales.x, glyph_scales.y)
      || !sceneOnLevel(glyph_scales.z)
      || (scene_glyphPass > 1.5 ? !revealed : scene_glyphPass > 0.5 && revealed)) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  // The text's block of lines scales about its anchor by the resolved size over the size its quads were placed at:
  // between line breaks the glyphs follow the camera continuously (textLayout.ts).
  float s = sceneSize(glyph_size, scene_camera.z) / ${TEXT_METRICS_PX.toFixed(1)};
  vec2 local = glyph_origin.xy + (glyph_quad.xy + scene_template * glyph_quad.zw) * s;
  gl_Position = sceneClip(element.xy + local, sceneDepth(element.z, glyph_sub));
  glyph_vUv = mix(glyph_uv.xy, glyph_uv.zw, scene_template);
  glyph_vLocal = local;
  glyph_vClip = vec4(glyph_ids.y, glyph_origin.w, glyph_ids.w, glyph_scales.w);
  glyph_vColor = sceneDimmed(scenePaint(glyph_color, element.w, glyph_ids.z), sceneDim(element.w, glyph_ids.z));
  if (glyph_origin.z > glyph_scales.x) {
    glyph_vColor.a *= smoothstep(glyph_scales.x, glyph_origin.z, scene_camera.z);
  }
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
