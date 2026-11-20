import { SCENE_COMMON, SCENE_OUTPUT } from "./scene";

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
