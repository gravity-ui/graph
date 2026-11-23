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
