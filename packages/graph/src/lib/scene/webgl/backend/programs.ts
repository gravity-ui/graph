import { Buffer, Texture } from "@luma.gl/core";
import type { BufferLayout, RenderPipelineParameters } from "@luma.gl/core";
import { Model } from "@luma.gl/engine";

import { RECT_FLOATS } from "../instances/encodeRects";
import { TRIANGLE_FLOATS } from "../instances/encodeTriangles";
import { GLYPH_ATTRIBUTES, GLYPH_FRAGMENT, GLYPH_SUB_ATTRIBUTE, GLYPH_VERTEX } from "../shaders/glyph";
import { RECT_ATTRIBUTES, RECT_FRAGMENT, RECT_VERTEX } from "../shaders/rect";
import { TRIANGLE_ATTRIBUTES, TRIANGLE_FRAGMENT, TRIANGLE_VERTEX } from "../shaders/triangle";
import { GLYPH_FLOATS, GLYPH_SUB_FLOATS } from "../text/encodeText";

import type { TCompanion, TPass, TTextureName } from "./batchTypes";

export const FLOAT_BYTES = 4;

export const INITIAL_INSTANCES = 64;

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
export const BUFFER_USAGE = Buffer.VERTEX | Buffer.COPY_DST;

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
export const TEXTURE_USAGE = Texture.SAMPLE | Texture.COPY_DST;

/** The target holds premultiplied colour, as the context's `premultipliedAlpha: true` expects. */
export const PASS_PARAMETERS: Record<TPass, RenderPipelineParameters> = {
  // Coverage comes from alpha to coverage, enabled on the context around this pass (luma 9.4 does not apply it).
  opaque: { depthWriteEnabled: true, depthCompare: "greater", blend: false },
  // Premultiplied "over".
  translucent: {
    depthWriteEnabled: false,
    depthCompare: "greater",
    blend: true,
    blendColorOperation: "add",
    blendColorSrcFactor: "one",
    blendColorDstFactor: "one-minus-src-alpha",
    blendAlphaOperation: "add",
    blendAlphaSrcFactor: "one",
    blendAlphaDstFactor: "one-minus-src-alpha",
  },
};

/**
 * After the opaque pass: alpha 1 in every sample geometry wrote (depth above the cleared 0), colour untouched. Alpha
 * to coverage writes the coverage into the alpha of covered samples, and WebGL has no alpha-to-one.
 */
export const ALPHA_PASS_PARAMETERS: RenderPipelineParameters = {
  depthWriteEnabled: false,
  depthCompare: "less",
  blend: false,
};

/** GPUColorWrite masks of the render pass. */
export const WRITE_ALPHA = 0x8;

export const WRITE_ALL = 0xf;

export const TABLE_SAMPLER = { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" } as const;

export const ATLAS_SAMPLER = { minFilter: "linear", magFilter: "linear", mipmapFilter: "none" } as const;

export function vec4Layout(name: string, attributes: readonly string[], floats: number): BufferLayout {
  return {
    name,
    stepMode: "instance",
    byteStride: floats * FLOAT_BYTES,
    attributes: attributes.map((attribute, index) => ({ attribute, format: "float32x4", byteOffset: index * 16 })),
  };
}

/**
 * A program using the shared quad template: shaders, buffers (template, instances), floats per instance, tables read,
 * and the kind, buffer layout and floats per instance of its companion list, if it keeps one.
 */
export type TQuadProgram = {
  vs: string;
  fs: string;
  layout: readonly [BufferLayout, BufferLayout];
  floats: number;
  vertexCount?: number;
  textures: readonly TTextureName[];
  companion?: { kind: TCompanion["kind"]; layout: BufferLayout; floats: number };
};

export const RECT_PROGRAM: TQuadProgram = {
  vs: RECT_VERTEX,
  fs: RECT_FRAGMENT,
  layout: [{ name: "scene_template", format: "float32x2" }, vec4Layout("rect_instances", RECT_ATTRIBUTES, RECT_FLOATS)],
  floats: RECT_FLOATS,
  textures: ["scene_elements", "scene_styles"],
};

export const TRIANGLE_PROGRAM: TQuadProgram = {
  vs: TRIANGLE_VERTEX,
  fs: TRIANGLE_FRAGMENT,
  layout: [
    { name: "scene_template", format: "float32x2" },
    vec4Layout("triangle_instances", TRIANGLE_ATTRIBUTES, TRIANGLE_FLOATS),
  ],
  floats: TRIANGLE_FLOATS,
  vertexCount: 3,
  textures: ["scene_elements", "scene_styles"],
};

export const GLYPH_PROGRAM: TQuadProgram = {
  vs: GLYPH_VERTEX,
  fs: GLYPH_FRAGMENT,
  layout: [
    { name: "scene_template", format: "float32x2" },
    vec4Layout("glyph_instances", GLYPH_ATTRIBUTES, GLYPH_FLOATS),
  ],
  floats: GLYPH_FLOATS,
  textures: ["scene_elements", "scene_styles", "scene_atlas"],
  companion: {
    kind: "subs",
    layout: {
      name: GLYPH_SUB_ATTRIBUTE,
      stepMode: "instance",
      byteStride: GLYPH_SUB_FLOATS * FLOAT_BYTES,
      format: "float32",
    },
    floats: GLYPH_SUB_FLOATS,
  },
};

export const PATH_TEXTURES: readonly TTextureName[] = ["scene_elements", "scene_styles"];

export const PATH_LAYOUT: BufferLayout[] = [
  { name: "graph_template", format: "float32x2" },
  {
    name: "graph_recordId",
    stepMode: "instance",
    byteStride: FLOAT_BYTES,
    format: "float32",
  },
];

export function compilerLog(model: Model): string {
  const { vs, fs } = model.pipeline;
  return [vs, fs]
    .flatMap((shader) => shader?.getCompilationInfoSync() ?? [])
    .map((message) => `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`)
    .join("\n");
}

export function isLinked(model: Model): boolean {
  return model.pipeline.linkStatus !== "error";
}
