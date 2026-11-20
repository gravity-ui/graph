import { Texture } from "@luma.gl/core";
import type { Buffer, BufferLayout, Device } from "@luma.gl/core";
import { Model } from "@luma.gl/engine";
import type { ShaderPlugin } from "@luma.gl/shadertools";

import { INSTANCE_FLOATS } from "../../../../components/canvas/connections/webgl/encode";
import { InstanceRanges } from "../instances/InstanceRanges";
import { PathDrawIds } from "../paths/pathDrawIds";
import { PATH_ELEMENT_FLOATS, PATH_RECORD_TEXELS } from "../paths/pathRecords";
import { GLYPH_FRAGMENT, GLYPH_VERTEX } from "../shaders/glyph";
import { PATH_FRAGMENT, PATH_VERTEX, SAMPLE_PATH_FRAGMENT, SAMPLE_PATH_VERTEX } from "../shaders/path";
import { QUAD_TEMPLATE } from "../shaders/scene";
import { OpaqueVisibility } from "../visibility/instanceVisibility";

import type { TBatch, TCompanion, TInstanceBuffer, TPass, TUniforms } from "./batchTypes";
import { GLYPH_PROGRAM, PASS_PARAMETERS, PATH_LAYOUT, PATH_TEXTURES, TEXTURE_USAGE } from "./programs";
import type { TQuadProgram } from "./programs";
import { createInstanceBuffer, createTableTexture } from "./resources";

/**
 * A batch with the shared quad template, one instance buffer (`layout[1]`) and, for a program with a companion
 * list, the companion's buffer.
 */
export function createBatch(
  device: Device,
  quadTemplate: Buffer,
  bindings: Record<string, Texture>,
  id: string,
  program: TQuadProgram,
  pass: TPass,
  spriteTexture?: Texture
): TBatch {
  const { vs, fs, layout, floats, textures } = program;
  const buffer = createInstanceBuffer(device, floats);
  const instanceBuffers: TInstanceBuffer[] = [{ name: layout[1].name, buffer }];
  const bufferLayout: BufferLayout[] = [...layout];
  let companion: TCompanion | undefined;
  if (program.companion) {
    const companionBuffer = createInstanceBuffer(device, program.companion.floats);
    companion = {
      kind: program.companion.kind,
      ranges: new InstanceRanges(program.companion.floats),
      buffer: companionBuffer,
    };
    instanceBuffers.push({ name: program.companion.layout.name, buffer: companionBuffer });
    bufferLayout.push(program.companion.layout);
  }
  const uniforms: TUniforms = { scene_opaquePass: pass === "opaque" ? 1 : 0 };
  if (program === GLYPH_PROGRAM) uniforms.scene_glyphPass = pass === "opaque" ? 0 : 1;
  const model = new Model(device, {
    id,
    vs,
    fs,
    topology: "triangle-strip",
    bufferLayout,
    attributes: {
      [layout[0].name]: quadTemplate,
      ...Object.fromEntries(instanceBuffers.map((instance) => [instance.name, instance.buffer])),
    },
    bindings: { ...bindings, ...(spriteTexture && { sprite_image: spriteTexture }) },
    uniforms,
    parameters: PASS_PARAMETERS[pass],
    vertexCount: program.vertexCount ?? QUAD_TEMPLATE.length / 2,
    isInstanced: true,
    instanceCount: 0,
  });
  return {
    ranges: new InstanceRanges(floats),
    spriteTexture,
    buffer,
    companion,
    model,
    uniforms,
    textures,
    layout: bufferLayout,
    instanceBuffers,
    pointedAt: 0,
  };
}

/** A second draw view, with no second allocation or upload of the glyphs or their subs. */
export function createRevealedGlyphs(
  device: Device,
  quadTemplate: Buffer,
  bindings: Record<string, Texture>,
  source: TBatch
): TBatch {
  const uniforms: TUniforms = { scene_opaquePass: 1, scene_glyphPass: 2 };
  const model = new Model(device, {
    id: "glyph-revealed",
    vs: GLYPH_VERTEX,
    fs: GLYPH_FRAGMENT,
    topology: "triangle-strip",
    bufferLayout: [...source.layout],
    attributes: {
      scene_template: quadTemplate,
      ...Object.fromEntries(source.instanceBuffers.map(({ name, buffer }) => [name, buffer])),
    },
    bindings,
    uniforms,
    parameters: PASS_PARAMETERS.opaque,
    vertexCount: QUAD_TEMPLATE.length / 2,
    isInstanced: true,
    instanceCount: 0,
  });
  return {
    ranges: source.ranges,
    buffer: source.buffer,
    companion: source.companion,
    model,
    uniforms,
    textures: source.textures,
    layout: source.layout,
    instanceBuffers: source.instanceBuffers,
    pointedAt: 0,
    opaqueVisibility: new OpaqueVisibility("glyph-revealed"),
  };
}

export function createPathBatch(
  device: Device,
  bindings: Record<string, Texture>,
  id: string,
  pass: TPass,
  plugin: ShaderPlugin,
  template: Buffer,
  templateData: Float32Array,
  strokeUnion = false
): TBatch {
  const buffer = createInstanceBuffer(device, 1);
  const elements: TCompanion = {
    kind: "elements",
    ranges: new InstanceRanges(PATH_ELEMENT_FLOATS),
  };
  // Empty effect groups need only a placeholder; the first upload allocates their actual record table.
  const pathRecords = {
    // eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
    texture: createTableTexture(device, PATH_RECORD_TEXELS, 1, TEXTURE_USAGE | Texture.COPY_SRC),
    companion: elements,
    ids: new PathDrawIds(),
  };
  const uniforms: TUniforms = {
    scene_opaquePass: pass === "opaque" ? 1 : 0,
    graph_effectEnabled: 1,
    graph_curveStep: 1,
    graph_overviewPairs: 0,
    graph_recordWidth: PATH_RECORD_TEXELS,
  };
  // A plain translucent polyline is one paint operation. At its physical edge MSAA supplies coverage per
  // sample, and strict depth claims that sample once for this element and primitive, across both stroke batches.
  const model = new Model(device, {
    id,
    vs: strokeUnion ? SAMPLE_PATH_VERTEX : PATH_VERTEX,
    fs: strokeUnion ? SAMPLE_PATH_FRAGMENT : PATH_FRAGMENT,
    plugins: [plugin],
    topology: "triangle-strip",
    bufferLayout: PATH_LAYOUT,
    attributes: { graph_template: template, graph_recordId: buffer },
    bindings: { ...bindings, graph_records: pathRecords.texture },
    uniforms,
    parameters: strokeUnion ? { ...PASS_PARAMETERS[pass], depthWriteEnabled: true } : PASS_PARAMETERS[pass],
    vertexCount: templateData.length / 2,
    isInstanced: true,
    instanceCount: 0,
  });
  return {
    ranges: new InstanceRanges(INSTANCE_FLOATS),
    retainRanges: pass === "translucent",
    buffer,
    companion: elements,
    pathRecords,
    model,
    uniforms,
    textures: PATH_TEXTURES,
    layout: PATH_LAYOUT,
    instanceBuffers: [{ name: PATH_LAYOUT[1].name, buffer }],
    pointedAt: 0,
  };
}
