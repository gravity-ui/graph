import { SCENE_COMMON, SCENE_OUTPUT } from "./scene";

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
  float width = sceneStrokeWidth(rect_borderSize, scale);
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
