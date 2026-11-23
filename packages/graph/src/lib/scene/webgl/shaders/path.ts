import type { ShaderModule, ShaderPlugin } from "@luma.gl/shadertools";

import { toPathEffect } from "../../effects/PathEffect";
import type { PathEffect } from "../../effects/PathEffect";
import { dashFlow, pathGradient } from "../../effects/library";
import type { TUniformTypes } from "../../effects/types";
import { MITER_LIMIT } from "../paths/closedStroke";
import { MIXED_PATH_SOURCE_BITS, MIXED_PATH_SOURCE_STRIDE } from "../paths/mixedPathPlan";

import { FRAGMENT_MAIN, FRAGMENT_PRELUDE, IDENTITY_EFFECT } from "./pathSource";
import { SCENE_COMMON } from "./scene";

const MIXED_RECORD_ADDRESS = /* glsl */ `
  int packedSlot = physicalSlot;
  graph_source = packedSlot >> ${MIXED_PATH_SOURCE_BITS};

  int lane = graph_source & 3;
  int rowWidth = graph_source < 4 ? graph_widths0[lane] : graph_widths1[lane];
  int flags = graph_source < 4 ? graph_kinds0[lane] : graph_kinds1[lane];
  int kind = flags & 31;
  graph_vMixedPlain = float((flags >> 5) & 1);
  graph_vStockEffect = float((flags >> 6) & 1);
  int groupShift = (flags & 128) != 0 ? 1 : 2;
  int chordShift = (kind == 8 ? 3 : 4) - groupShift;
  int slot = packedSlot & ${MIXED_PATH_SOURCE_STRIDE - 1};
  if ((flags & 256) != 0) {
    chord += (slot & 1) * 8;
    slot >>= 1;
  }
  int piece = min(chord >> chordShift, (1 << groupShift) - 1);
  int record = (slot + (overview ? piece : 0)) * 10;
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

export const SAMPLE_PATH_VERTEX = pathVertex(0, true);

/** Link only the sampler slots this mixed draw needs. */
export function createMixedPathVertex(sourceCount: number): string {
  return pathVertex(sourceCount);
}

function pathVertex(sourceCount: number, sampleEdges = false): string {
  return /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 graph_template;     // t along the piece, side -1 or +1
layout(location = 1) in float graph_recordId;    // stable resident slot, gathered in logical draw order
${
  sourceCount
    ? mixedRecordDeclarations(sourceCount)
    : `uniform highp sampler2D graph_records;
uniform int graph_recordWidth;
uniform int graph_overviewPairs;`
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
flat out float graph_vDim;
flat out vec4 graph_vDash;
flat out float graph_vLength;
flat out vec4 graph_vParams0;
flat out vec4 graph_vParams1;
flat out vec3 graph_vInteraction;     // hovered, selected, the effect shows the selection: 0.0 or 1.0
flat out vec4 graph_vSelectionColor;  // straight rgba
${sourceCount ? "flat out float graph_vMixedPlain;\nflat out float graph_vStockEffect;" : ""}

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
  int physicalSlot = int(graph_recordId);
  bool overview = physicalSlot < 0;
  int chord = gl_VertexID >> 1;
  if (overview) physicalSlot = -1 - physicalSlot;
  ${
    sourceCount
      ? MIXED_RECORD_ADDRESS
      : `int groupShift = graph_overviewPairs == 1 ? 1 : 2;
  int chordShift = (graph_curveStep == 2.0 ? 3 : 4) - groupShift;
  int piece = min(chord >> chordShift, (1 << groupShift) - 1);
  int record = (physicalSlot + (overview ? piece : 0)) * 10;`
  }
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
      ? "kind == 1 ? (gl_VertexID < 2 ? 0.0 : 1.0) : min(1.0, float(chord) * (kind == 8 ? 0.125 : 0.0625))"
      : "graph_template.x * graph_curveStep"
  };
  if (overview) t = min(1.0, float(chord - (piece << chordShift)) / float(1 << chordShift));
  vec2 p0 = graph_p0c1.xy + element.xy;
  vec2 c1 = graph_p0c1.zw + element.xy;
  vec2 c2 = graph_c2p3.xy + element.xy;
  vec2 p3 = graph_c2p3.zw + element.xy;
  int interaction = int(graph_interaction.w + 0.5);
  int arrow = interaction >> 11;
  float mode = float(levelAndWidth >> 3);
  float width = sceneStrokeWidth(vec4(mode, graph_stroke.x, scene_pathIds.w, scene_pathScales.w), graph_camera.z);
  // A zero-alpha strip can still write depth without MSAA. Filled heads use the width only for their outline.
  if (width == 0.0 && arrow != 2) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  // Positive widths below one device pixel are drawn one pixel wide with reduced alpha, like canvas hairlines.
  float deviceWidth = width * graph_camera.z * graph_dpr;
  float halfPx = max(deviceWidth, 1.0) * 0.5 / graph_dpr;
  // Analytic coverage needs a fringe. A multisampled union uses the physical edge of the strip itself.
  float extent = halfPx + graph_extraWidth${sampleEdges ? "" : " + 1.0 / graph_dpr"};
  vec2 center;
  vec2 offset;
  float across = graph_template.y * extent;
  float along = graph_stroke.z + t * graph_stroke.w;
  if (arrow != 0) {
    vec2 axis = graph_p0c1.xy - graph_c2p3.zw;
    float height = length(axis);
    vec2 dir = axis / max(height, 1e-6);
    vec2 normal = vec2(-dir.y, dir.x);
    height *= graph_camera.z;
    float span = length(graph_p0c1.zw - graph_c2p3.xy) * graph_camera.z * 0.5;
    float pad = arrow == 1 ? extent : extent - halfPx;
    across = graph_template.y * (span + pad);
    along = mix(-height - pad, pad, t);
    center = p0;
    offset = dir * along + normal * across;
    graph_dash = vec4(0.0, height, -float(arrow), span);
  } else {
    vec2 d = graph_bezierSlope(p0, c1, c2, p3, t);
    if (dot(d, d) < 1e-12) d = p3 - p0;
    if (dot(d, d) < 1e-12) d = vec2(1.0, 0.0);
    vec2 dir = normalize(d);
    vec2 normal = vec2(-dir.y, dir.x);
    if (graph_stroke.y < 0.0) {
      // Solid closed contours store the tangent component of each endpoint miter in the distance fields.
      float k = t == 0.0 ? graph_stroke.z : t == 1.0 ? graph_stroke.w : 0.0;
      normal += dir * k;
      if (abs(k) > ${Math.sqrt(MITER_LIMIT ** 2 - 1)}) normal = normalize(normal) * ${MITER_LIMIT}.0;
    }
    center = graph_bezier(p0, c1, c2, p3, t);
    offset = normal * across;
  }
  vec2 screen = center * graph_camera.z + graph_camera.xy + offset;
  vec2 clip = screen / graph_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, sceneDepth(element.z, scene_pathIds.y) * 2.0 - 1.0, 1.0);
  graph_vAcross = across;
  graph_vHalfWidth = halfPx;
  graph_vHairline = arrow == 2 ? 1.0 : min(deviceWidth, 1.0);
  graph_vDim = sceneDim(element.w, scene_pathIds.z);
  graph_vColor = sceneDimmed(scenePaint(graph_rgba, element.w, scene_pathIds.z), graph_vDim);
  graph_vAlong = along;
  // The vertex's world position, off the center line: each fragment interpolates its own.
  graph_vWorld = center + offset / graph_camera.z;
  graph_vDash = graph_dash;
  graph_vLength = graph_stroke.y;
  graph_vParams0 = graph_params0;
  graph_vParams1 = graph_params1;
  graph_vInteraction = vec3(float(interaction & 1), float((interaction >> 1) & 1), float((interaction >> 10) & 1));
  graph_vSelectionColor = vec4(graph_interaction.xyz, float((interaction >> 2) & 255) / 255.0);
}
`;
}

const PATH_IDENTITY_COLOR = "graph_vInteraction.z * f.selected > 0.5 ? f.selectionColor : graph_vColor";

/** Native groups can suspend their effect without changing the resident stroke or its selection treatment. */
const NATIVE_PATH_FRAGMENT = `uniform highp float graph_effectEnabled;
${FRAGMENT_MAIN.replace(
  "vec4 color = effect(f, graph_vColor);",
  `vec4 color = graph_effectEnabled > 0.5 ? effect(f, graph_vColor) : (${PATH_IDENTITY_COLOR});`
)}`;

export const PATH_FRAGMENT = `#version 300 es
${NATIVE_PATH_FRAGMENT}`;

export const SAMPLE_PATH_FRAGMENT = `#version 300 es
#define GRAPH_STROKE_SAMPLES
${NATIVE_PATH_FRAGMENT}`;

/** Plain paths use the same identity treatment even when they share an effect program. */
export const MIXED_PATH_FRAGMENT = `#version 300 es
precision highp float;
flat in float graph_vMixedPlain;
${FRAGMENT_MAIN.replace(
  "vec4 color = effect(f, graph_vColor);",
  `vec4 color = graph_vMixedPlain > 0.5 ? (${PATH_IDENTITY_COLOR}) : effect(f, graph_vColor);`
)}`;

/** Built-in effects share a program in logical draw order; each source independently selects identity or its effect. */
export const STOCK_PATH_FRAGMENT = `#version 300 es
precision highp float;
flat in float graph_vMixedPlain;
flat in float graph_vStockEffect;
${FRAGMENT_MAIN.replace(
  "vec4 color = effect(f, graph_vColor);",
  `vec4 color = graph_vMixedPlain > 0.5 ? (${PATH_IDENTITY_COLOR}) : (graph_vStockEffect > 0.5 ? graph_gradientEffect(f, graph_vColor) : graph_dashFlowEffect(f, graph_vColor));`
)}`;

/**
 * The path fragment prelude (inputs, uniforms, `PathFragment`, effect helpers) as a shader module. luma places
 * module sources before the `fs:#decl` injections and those before the application source, so the effect lands
 * between the prelude and `main()`.
 */
const PATH_PRELUDE_MODULE: ShaderModule = {
  name: "scenePathFragment",
  fs: FRAGMENT_PRELUDE,
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
 * path prelude, and the opaque pass's output at the end of `main()`. Compiler logs count lines from the
 * effect's first line, as in #451.
 */
export function createPathPlugin(effect: PathEffect<TUniformTypes, never> | undefined): ShaderPlugin {
  const source = effect ? `${effect.uniformDeclarations}#line 1\n${effect.fragment}` : IDENTITY_EFFECT;
  return {
    name: "scenePathEffect",
    modules: [PATH_PRELUDE_MODULE],
    injections: [
      { target: "fs:#decl", injection: `uniform float scene_opaquePass;\n${source}` },
      { target: "fs:#main-end", injection: OPAQUE_PASS_OUTPUT },
    ],
  };
}

/** Uses the exact built-in bodies and shared prelude, changing only their entry point names to coexist. */
export function createStockPathPlugin(): ShaderPlugin {
  const dash = toPathEffect(dashFlow).fragment.replace("vec4 effect(", "vec4 graph_dashFlowEffect(");
  const gradient = toPathEffect(pathGradient).fragment.replace("vec4 effect(", "vec4 graph_gradientEffect(");
  return {
    name: "sceneStockPathEffects",
    modules: [PATH_PRELUDE_MODULE],
    injections: [
      { target: "fs:#decl", injection: `uniform float scene_opaquePass;\n${dash}\n${gradient}` },
      { target: "fs:#main-end", injection: OPAQUE_PASS_OUTPUT },
    ],
  };
}
