import { Buffer, Texture, getAttributeInfosFromLayouts, luma } from "@luma.gl/core";
import type { BufferLayout, Device, RenderPass, RenderPipelineParameters, VertexFormat } from "@luma.gl/core";
import { DynamicBuffer, Model } from "@luma.gl/engine";
import type { ShaderPlugin } from "@luma.gl/shadertools";
import { WEBGLBuffer, WEBGLVertexArray, webgl2Adapter } from "@luma.gl/webgl";

import { toConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TUniformTypes } from "../../../components/canvas/connections/effects/types";
import { INSTANCE_ATTRIBUTES, INSTANCE_FLOATS, scaleBucket } from "../../../components/canvas/connections/webgl/encode";
import { createCurveTemplate, createLineTemplate } from "../../../components/canvas/connections/webgl/shaders";
import type { SceneStore } from "../SceneStore";
import { readColorRgba } from "../colorAlpha";
import { bakeElementStyle } from "../style";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle } from "../types";

import { InstanceRanges } from "./InstanceRanges";
import type {
  ISceneBackend,
  TCreateSceneBackend,
  TSceneBackendEvents,
  TSceneBackendStats,
  TSceneFrame,
} from "./backendTypes";
import { SceneDepth } from "./depth";
import { PATH_ELEMENT_FLOATS, encodePaths } from "./encodePaths";
import { RECT_FLOATS, encodeRects, hasStrokeWidth, isTranslucentPaint } from "./encodeRects";
import { GLYPH_FLOATS, encodeText } from "./encodeText";
import { GlyphAtlas } from "./glyphs";
import { geometryBounds } from "./levelBounds";
import { TranslucentLevels } from "./overlapLevels";
import {
  ALPHA_FRAGMENT,
  ALPHA_VERTEX,
  GLYPH_ATTRIBUTES,
  GLYPH_FRAGMENT,
  GLYPH_VERTEX,
  PATH_ATTRIBUTES,
  PATH_ELEMENT_ATTRIBUTES,
  PATH_FRAGMENT,
  PATH_VERTEX,
  QUAD_TEMPLATE,
  RECT_ATTRIBUTES,
  RECT_FRAGMENT,
  RECT_VERTEX,
  createPathPlugin,
} from "./shaders";
import { ElementTable, STYLE_ROW_TEXELS, StyleTable, TABLE_WIDTH } from "./tables";
import { createTinySdfGenerator } from "./tinySdfGlyphs";
import { elementSteps, orderTranslucent, splitSteps } from "./translucentOrder";
import type { TTranslucentRun } from "./translucentOrder";

type TPass = "opaque" | "translucent";

type TUploadKind = TSceneBackendStats["lastUploadKind"];

type TUniforms = Record<string, number | readonly number[]>;

type TPathPrimitive = Extract<TScenePrimitive, { kind: "path" }>;

/** The tables a program samples. */
type TTextureName = "scene_elements" | "scene_styles" | "scene_atlas";

type TEffect = ConnectionEffect<TUniformTypes, never>;

/** An instance attribute's pointer: shader location, float components, byte offset in the instance and stride. */
type TPointer = { location: number; components: number; byteOffset: number; stride: number };

/** A per-instance buffer of a model: its name in the buffer layout and the buffer. */
type TInstanceBuffer = { name: string; buffer: DynamicBuffer };

/** Per-element instances of one program and pass, their GPU buffer and the model that draws them. */
type TBatch = {
  ranges: InstanceRanges;
  buffer: DynamicBuffer;
  /** Path batches only: the element data of every instance (`PATH_ELEMENT_FLOATS`), kept in step with `ranges`. */
  elements?: { ranges: InstanceRanges; buffer: DynamicBuffer };
  model: Model;
  /** The model's uniforms: luma reads this object at every draw. */
  uniforms: TUniforms;
  textures: readonly TTextureName[];
  /** Every buffer layout of the model, and its per-instance buffers (`buffer`, then the path element data). */
  layout: readonly BufferLayout[];
  instanceBuffers: readonly TInstanceBuffer[];
  /** The pointers of the per-instance attributes, per instance buffer; read from the linked program on first use. */
  pointers?: readonly { buffer: DynamicBuffer; attributes: readonly TPointer[] }[];
  /** The instance the per-instance attributes point at: translucent runs start inside the buffer. */
  pointedAt: number;
};

/** An element's translucent instances of one program, before they are cut into steps. */
type TTranslucentWrite = { batch: TBatch; instances: Float32Array; elements?: Float32Array };

/** The paths of one pass and one effect program ("plain" without an effect): a batch per vertex template. */
type TPathGroup = {
  pass: TPass;
  /** The last effect object seen for the program: its uniform values and extra width are drawn. */
  effect: TEffect | undefined;
  /** The effect does not compile or link: the group draws the plain stroke and never takes the effect up. */
  fallback: boolean;
  lines: TBatch;
  curves: TBatch;
};

/** Curves are tessellated once, for scales up to 2. */
const PATH_BUCKET = scaleBucket(2);

const FLOAT_BYTES = 4;

const INITIAL_INSTANCES = 64;

const GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809e;

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
const BUFFER_USAGE = Buffer.VERTEX | Buffer.COPY_DST;

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
const TEXTURE_USAGE = Texture.SAMPLE | Texture.COPY_DST;

const UPLOAD_COST: Record<TUploadKind, number> = { none: 0, range: 1, full: 2 };

const VERTEX_FORMATS: Record<number, VertexFormat> = {
  1: "float32",
  2: "float32x2",
  3: "float32x3",
  4: "float32x4",
};

/** The target holds premultiplied colour, as the context's `premultipliedAlpha: true` expects. */
const PASS_PARAMETERS: Record<TPass, RenderPipelineParameters> = {
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
const ALPHA_PASS_PARAMETERS: RenderPipelineParameters = {
  depthWriteEnabled: false,
  depthCompare: "less",
  blend: false,
};

/** GPUColorWrite masks of the render pass. */
const WRITE_ALPHA = 0x8;
const WRITE_ALL = 0xf;

const TABLE_SAMPLER = { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" } as const;

/** `scene_dimColor` without a dim colour: alpha -1, the shaders leave every paint undimmed. */
const NO_DIM_COLOR: readonly number[] = [0, 0, 0, -1];

const ATLAS_SAMPLER = { minFilter: "linear", magFilter: "linear", mipmapFilter: "none" } as const;

/** Program keys of effects already reported as broken, so each source is reported once. */
const reportedEffects = new Set<string>();

function vec4Layout(name: string, attributes: readonly string[], floats: number): BufferLayout {
  return {
    name,
    stepMode: "instance",
    byteStride: floats * FLOAT_BYTES,
    attributes: attributes.map((attribute, index) => ({ attribute, format: "float32x4", byteOffset: index * 16 })),
  };
}

/** A program drawn as instanced quads: shaders, buffers (template, instances), floats per instance, tables read. */
type TQuadProgram = {
  vs: string;
  fs: string;
  layout: readonly [BufferLayout, BufferLayout];
  floats: number;
  textures: readonly TTextureName[];
};

const RECT_PROGRAM: TQuadProgram = {
  vs: RECT_VERTEX,
  fs: RECT_FRAGMENT,
  layout: [{ name: "scene_template", format: "float32x2" }, vec4Layout("rect_instances", RECT_ATTRIBUTES, RECT_FLOATS)],
  floats: RECT_FLOATS,
  textures: ["scene_elements", "scene_styles"],
};

const GLYPH_PROGRAM: TQuadProgram = {
  vs: GLYPH_VERTEX,
  fs: GLYPH_FRAGMENT,
  layout: [
    { name: "scene_template", format: "float32x2" },
    vec4Layout("glyph_instances", GLYPH_ATTRIBUTES, GLYPH_FLOATS),
  ],
  floats: GLYPH_FLOATS,
  textures: ["scene_elements", "scene_styles", "scene_atlas"],
};

const PATH_TEXTURES: readonly TTextureName[] = ["scene_elements", "scene_styles"];

const PATH_LAYOUT: BufferLayout[] = [
  { name: "graph_template", format: "float32x2" },
  {
    name: "graph_instances",
    stepMode: "instance",
    byteStride: INSTANCE_FLOATS * FLOAT_BYTES,
    attributes: INSTANCE_ATTRIBUTES.map(([location, size, offset]) => ({
      attribute: PATH_ATTRIBUTES[location],
      format: VERTEX_FORMATS[size],
      byteOffset: offset * FLOAT_BYTES,
    })),
  },
  vec4Layout("scene_pathElements", PATH_ELEMENT_ATTRIBUTES, PATH_ELEMENT_FLOATS),
];

function compilerLog(model: Model): string {
  const { vs, fs } = model.pipeline;
  return [vs, fs]
    .flatMap((shader) => shader?.getCompilationInfoSync() ?? [])
    .map((message) => `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`)
    .join("\n");
}

function isLinked(model: Model): boolean {
  return model.pipeline.linkStatus !== "error";
}

/** Writes the instances of an element, or removes the element when it has none. */
function setInstances(batch: TBatch, id: string, instances: Float32Array, elements?: Float32Array): void {
  if (instances.length > 0) {
    batch.ranges.set(id, instances);
    if (batch.elements && elements) batch.elements.ranges.set(id, elements);
  } else {
    removeInstances(batch, id);
  }
}

function removeInstances(batch: TBatch, id: string): void {
  batch.ranges.delete(id);
  batch.elements?.ranges.delete(id);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Primitives of the kinds the slice does not draw. */
function countSkipped(primitives: readonly TScenePrimitive[]): { polygon: number; icon: number } {
  const counts = { polygon: 0, icon: 0 };
  for (const primitive of primitives) {
    if (primitive.kind === "polygon") counts.polygon++;
    else if (primitive.kind === "icon") counts.icon++;
  }
  return counts;
}

class WebGLSceneBackend implements ISceneBackend {
  public readonly stats: TSceneBackendStats = {
    encodes: 0,
    lastEncodeMs: 0,
    uploads: 0,
    drawCalls: 0,
    instances: 0,
    deviceMs: 0,
    firstFrameMs: 0,
    lastUploadKind: "none",
    lastReplayMs: 0,
    skipped: { polygon: 0, icon: 0 },
    translucentDrawCalls: 0,
    translucentLevels: 0,
    lastLevelsMs: 0,
    lastTranslucentOrderMs: 0,
  };

  private readonly styles = new StyleTable();
  private readonly atlas = new GlyphAtlas(createTinySdfGenerator());
  private table = new ElementTable();
  private depth = new SceneDepth();
  /** The store of the last replay: its style rows are baked into the primitives and raise the depth bucket. */
  private store: SceneStore | undefined;

  /** The elements in the backend: their current origin, visibility and style are written on a depth change. */
  private readonly elements = new Map<string, TSceneElement>();
  private readonly pathGroupsOf = new Map<string, Set<TPathGroup>>();
  /** Polygon and icon primitives per element: the slice does not draw them. Summed in `stats.skipped`. */
  private readonly skippedOf = new Map<string, { polygon: number; icon: number }>();
  /** Elements with a path whose effect is animated. */
  private readonly animated = new Set<string>();

  private readonly quadTemplate: Buffer;
  private readonly lineTemplate: Buffer;
  private readonly curveTemplate: Buffer;
  private elementTexture: Texture;
  private styleTexture: Texture;
  private readonly atlasTexture: Texture;

  private readonly rects: Record<TPass, TBatch>;
  private readonly glyphs: Record<TPass, TBatch>;
  private readonly pathGroups = new Map<string, TPathGroup>();
  private readonly alphaModel: Model;

  /** The overlap levels of the elements with translucent instances. */
  private readonly levels = new TranslucentLevels();
  /**
   * The level revision and the revisions of the translucent instance lists the current runs were built from. Depth keys
   * enter the runs only through the levels.
   */
  private orderStamp: number[] = [];
  /** The layout revisions of the translucent instance lists when the runs were built: a change sorts them again. */
  private layoutStamp: number[] = [];
  /** The translucent batches the runs index, and the runs: scene order where translucent primitives overlap. */
  private translucentBatches: TBatch[] = [];
  private translucentRuns: TTranslucentRun[] = [];

  private frames = 0;
  /** The dim colour of the last frame and its `scene_dimColor` value. */
  private dimColor: string | undefined;
  private dimFloats: readonly number[] = NO_DIM_COLOR;
  private disposed = false;
  /** Set once the context is lost: its GL objects are gone for good, a restore included. */
  private objectsLost = false;

  constructor(
    public readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly device: Device,
    private readonly listeners: AbortController,
    createdAt: number
  ) {
    this.quadTemplate = this.createTemplate(QUAD_TEMPLATE);
    this.lineTemplate = this.createTemplate(createLineTemplate());
    this.curveTemplate = this.createTemplate(createCurveTemplate());
    this.elementTexture = this.createTableTexture(TABLE_WIDTH, 1);
    this.styleTexture = this.createTableTexture(STYLE_ROW_TEXELS, 1);
    this.styleTexture.writeData(this.noStyles(1));
    this.atlasTexture = device.createTexture({
      format: "r8unorm",
      width: this.atlas.size,
      height: this.atlas.size,
      usage: TEXTURE_USAGE,
      sampler: ATLAS_SAMPLER,
    });
    this.rects = {
      opaque: this.createBatch("rect-opaque", RECT_PROGRAM, "opaque"),
      translucent: this.createBatch("rect-translucent", RECT_PROGRAM, "translucent"),
    };
    this.glyphs = {
      opaque: this.createBatch("glyph-opaque", GLYPH_PROGRAM, "opaque"),
      translucent: this.createBatch("glyph-translucent", GLYPH_PROGRAM, "translucent"),
    };
    canvas.addEventListener(
      "webglcontextlost",
      () => {
        this.objectsLost = true;
      },
      { signal: listeners.signal }
    );
    this.alphaModel = new Model(device, {
      id: "alpha",
      vs: ALPHA_VERTEX,
      fs: ALPHA_FRAGMENT,
      topology: "triangle-strip",
      bufferLayout: [{ name: "scene_template", format: "float32x2" }],
      attributes: { scene_template: this.quadTemplate },
      parameters: ALPHA_PASS_PARAMETERS,
      vertexCount: QUAD_TEMPLATE.length / 2,
    });
    // The plain path program is compiled up front, so `deviceMs` covers every base program.
    this.pathGroupFor("opaque", undefined);
    for (const model of [this.alphaModel, ...[...this.allBatches()].map((batch) => batch.model)]) {
      if (!isLinked(model)) {
        throw new Error(`The scene program ${model.id} does not link:\n${compilerLog(model)}`);
      }
    }
    this.stats.deviceMs = performance.now() - createdAt;
  }

  public replay(store: SceneStore): void {
    const start = performance.now();
    this.reset();
    this.store = store;
    this.setStyles(store.getStyles());
    store.forEach((element) => this.applyChange({ type: "add", element }));
    this.flushDepth();
    this.stats.lastReplayMs = performance.now() - start;
  }

  public apply(change: TSceneChange): void {
    this.applyChange(change);
    this.flushDepth();
  }

  public setStyles(styles: readonly TSceneStyle[]): void {
    this.styles.setStyles(styles);
  }

  public draw(frame: TSceneFrame): boolean {
    if (this.disposed || this.gl.isContextLost()) return false;
    const start = performance.now();
    this.device
      .getDefaultCanvasContext()
      .setDrawingBufferSize(
        Math.max(1, Math.round(frame.width * frame.dpr)),
        Math.max(1, Math.round(frame.height * frame.dpr))
      );
    this.uploadTables();
    this.setDimColor(frame.dimColor);
    // Before the uploads: sorting moves translucent instances.
    this.orderTranslucent();
    let uploadKind: TUploadKind = "none";
    for (const batch of this.allBatches()) {
      const kind = this.upload(batch);
      if (UPLOAD_COST[kind] > UPLOAD_COST[uploadKind]) uploadKind = kind;
    }
    this.stats.lastUploadKind = uploadKind;
    this.stats.drawCalls = 0;
    this.stats.instances = 0;
    for (const group of this.pathGroups.values()) this.setEffectUniforms(group);

    const pass = this.device.beginRenderPass({ clearColor: [0, 0, 0, 0], clearDepth: 0, clearStencil: false });
    this.gl.enable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    let opaque = false;
    for (const batch of this.passBatches("opaque")) {
      opaque = this.drawInstances(pass, batch, frame, batch.ranges.count) || opaque;
    }
    this.gl.disable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    if (opaque) {
      pass.setParameters({ colorMask: WRITE_ALPHA });
      this.alphaModel.draw(pass);
      pass.setParameters({ colorMask: WRITE_ALL });
      this.stats.drawCalls += 1;
    }
    // Translucent primitives blend over each other in scene order wherever they overlap, across programs (paths, rects,
    // glyphs): level by level, step by step, one instanced draw per program and range. Depth orders them against the
    // opaque pass.
    for (const run of this.translucentRuns) {
      const batch = this.translucentBatches[run.source];
      this.pointInstances(batch, run.first);
      this.drawInstances(pass, batch, frame, run.count);
    }
    this.stats.translucentDrawCalls = this.translucentRuns.length;
    pass.end();
    this.device.submit();

    if (this.frames++ === 0) this.stats.firstFrameMs = performance.now() - start;
    return this.hasVisibleAnimation();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    for (const batch of this.allBatches()) this.destroyBatch(batch);
    this.alphaModel.destroy();
    if (this.ownsObjects()) {
      this.alphaModel.vertexArray.destroy();
      for (const resource of [this.quadTemplate, this.lineTemplate, this.curveTemplate]) resource.destroy();
      for (const texture of [this.elementTexture, this.styleTexture, this.atlasTexture]) texture.destroy();
    }
    // WebGLDevice.destroy() leaves the canvas observers of an attached context running.
    this.device.getDefaultCanvasContext().destroy();
    this.device.destroy();
    if (!this.gl.isContextLost()) this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.remove();
  }

  private applyChange(change: TSceneChange): void {
    const { element } = change;
    if (change.type === "delete") {
      this.remove(element.id);
      return;
    }
    this.elements.set(element.id, element);
    if (change.type === "add") {
      this.depth.set(element.id, this.zIndexOf(element), element.order);
      this.encode(element);
      // The depth key is written by flushDepth(): a new element always gets one.
      this.table.write(element.id, element.x, element.y, 0, element.hidden, element.styleId);
      return;
    }
    const fields = change.fields;
    const changed = (field: keyof TSceneElement): boolean => fields === undefined || fields.has(field);
    // A change of the style's raise comes as a zIndex change: the bucket is the zIndex plus the raise.
    if (changed("zIndex") || changed("order")) this.depth.set(element.id, this.zIndexOf(element), element.order);
    // Also when the primitives are the same array: the element properties of the style (widths, translucent colours,
    // opacity) changed.
    if (changed("primitives")) this.encode(element);
    if (changed("x") || changed("y") || changed("hidden") || changed("styleId")) this.writeElement(element);
    // A translucent element that moves can start or stop overlapping others.
    if (changed("x") || changed("y") || changed("bounds")) this.levels.moved(element.id);
  }

  /** Writes the element texels of every element whose depth key changed. */
  private flushDepth(): void {
    for (const id of this.depth.takeChanged()) {
      const element = this.elements.get(id);
      if (element) this.writeElement(element);
    }
    // Only an element whose own zIndex or order was set can change the order of the translucent elements among
    // themselves. A raise renumbers the dense ranks of its whole band, but the others keep their order, so their
    // levels stand.
    for (const id of this.depth.takeSet()) this.levels.reordered(id);
  }

  /** The element's zIndex bucket with the raise of its style. */
  private zIndexOf(element: TSceneElement): number {
    return this.store ? this.store.zIndexOf(element) : element.zIndex;
  }

  /** The element's style row in the store: the backend's style table is only updated at the next draw. */
  private styleOf(element: TSceneElement): TSceneStyle | undefined {
    return this.store?.getStyles()[element.styleId];
  }

  private writeElement(element: TSceneElement): void {
    const key = this.depth.keyOf(element.id);
    this.table.write(element.id, element.x, element.y, key, element.hidden, element.styleId);
  }

  private remove(id: string): void {
    for (const batch of this.allBatches()) removeInstances(batch, id);
    this.pathGroupsOf.delete(id);
    this.setSkipped(id, { polygon: 0, icon: 0 });
    this.animated.delete(id);
    this.depth.delete(id);
    this.levels.delete(id);
    this.table.free(id);
    this.elements.delete(id);
  }

  private reset(): void {
    this.elements.clear();
    this.pathGroupsOf.clear();
    this.skippedOf.clear();
    this.stats.skipped.polygon = 0;
    this.stats.skipped.icon = 0;
    this.animated.clear();
    this.depth = new SceneDepth();
    this.levels.clear();
    this.table = new ElementTable();
    for (const batch of this.allBatches()) {
      batch.ranges = new InstanceRanges(batch.ranges.floats);
      if (batch.elements) batch.elements.ranges = new InstanceRanges(PATH_ELEMENT_FLOATS);
    }
  }

  private readonly slotOf = (part: string | undefined): number => this.styles.slotOf(part);

  /**
   * Encodes the element's primitives with the element properties of its style baked in (widths, circle scale,
   * translucent colours, opacity: a faded primitive gets all its colours baked, faded); the other opaque colours and
   * visibility stay in the style table. Instances with a baked alpha below 1 go to the translucent pass.
   */
  private encode(element: TSceneElement): void {
    const start = performance.now();
    const { id } = element;
    const primitives = bakeElementStyle(element.primitives, this.styleOf(element));
    const index = this.table.indexOf(id);
    const rects = encodeRects(primitives, index, this.slotOf);
    const glyphs = encodeText(primitives, index, this.slotOf, this.atlas);
    setInstances(this.rects.opaque, id, rects.opaque);
    setInstances(this.glyphs.opaque, id, glyphs.opaque);
    const translucent = this.encodePathsOf(id, primitives, index);
    translucent.push(
      { batch: this.rects.translucent, instances: rects.translucent },
      { batch: this.glyphs.translucent, instances: glyphs.translucent }
    );
    this.setTranslucent(id, primitives, translucent);
    this.setSkipped(id, countSkipped(primitives));
    this.stats.encodes += primitives.length;
    this.stats.lastEncodeMs = performance.now() - start;
  }

  /** Replaces the element's share of `stats.skipped`. */
  private setSkipped(id: string, now: { polygon: number; icon: number }): void {
    const before = this.skippedOf.get(id);
    this.stats.skipped.polygon += now.polygon - (before?.polygon ?? 0);
    this.stats.skipped.icon += now.icon - (before?.icon ?? 0);
    if (now.polygon + now.icon > 0) this.skippedOf.set(id, now);
    else this.skippedOf.delete(id);
  }

  /**
   * Writes an element's translucent instances of every translucent program (`writes`: its paths' lines and curves,
   * then rects, then glyphs), cut into its local steps: a new step at each change of program in primitive order. Keeps
   * the element in the overlap levels while it has translucent instances, with the bounds of its baked primitives.
   */
  private setTranslucent(id: string, primitives: readonly TScenePrimitive[], writes: TTranslucentWrite[]): void {
    const present = writes.filter((write) => write.instances.length > 0);
    for (const write of writes) if (write.instances.length === 0) removeInstances(write.batch, id);
    const steps = elementSteps(
      present.map((write) => ({
        subs: write.elements ?? write.instances,
        floats: write.elements ? PATH_ELEMENT_FLOATS : write.batch.ranges.floats,
      }))
    );
    present.forEach((write, source) => {
      const { batch, instances, elements } = write;
      batch.ranges.setSteps(id, splitSteps(instances, batch.ranges.floats, steps[source]));
      if (batch.elements && elements) {
        batch.elements.ranges.setSteps(id, splitSteps(elements, PATH_ELEMENT_FLOATS, steps[source]));
      }
    });
    if (present.length > 0) this.levels.set(id, geometryBounds(primitives));
    else this.levels.delete(id);
  }

  /**
   * Encodes the paths of each group separately; `sub` stays the path's index in the element. A path whose stroke width
   * is unset draws nothing and joins no group. Writes the opaque groups and returns the writes of the translucent ones,
   * lines before curves.
   */
  private encodePathsOf(id: string, primitives: readonly TScenePrimitive[], index: number): TTranslucentWrite[] {
    const groupOfSub = primitives.map((primitive) =>
      primitive.kind === "path" && hasStrokeWidth(primitive.stroke) ? this.pathGroupOf(primitive) : undefined
    );
    const groups = new Set<TPathGroup>();
    for (const group of groupOfSub) if (group) groups.add(group);
    const translucent: TTranslucentWrite[] = [];
    for (const group of groups) {
      const select = (_: TScenePrimitive, sub: number): boolean => groupOfSub[sub] === group;
      const encoded = encodePaths(primitives, index, PATH_BUCKET, this.slotOf, select);
      if (group.pass === "translucent") {
        translucent.push(
          { batch: group.lines, instances: encoded.lines, elements: encoded.lineElements },
          { batch: group.curves, instances: encoded.curves, elements: encoded.curveElements }
        );
      } else {
        setInstances(group.lines, id, encoded.lines, encoded.lineElements);
        setInstances(group.curves, id, encoded.curves, encoded.curveElements);
      }
    }
    for (const group of this.pathGroupsOf.get(id) ?? []) {
      if (groups.has(group)) continue;
      removeInstances(group.lines, id);
      removeInstances(group.curves, id);
    }
    if (groups.size > 0) this.pathGroupsOf.set(id, groups);
    else this.pathGroupsOf.delete(id);
    if ([...groups].some((group) => group.effect?.animated)) this.animated.add(id);
    else this.animated.delete(id);
    return translucent;
  }

  /**
   * Effects may draw any alpha, so their paths join the translucent pass; plain ones go by the stroke alpha. An unset
   * stroke colour takes the base colour from the style table, which is opaque or none: it stays opaque.
   */
  private pathGroupOf(primitive: TPathPrimitive): TPathGroup {
    const effect = primitive.effect ? toConnectionEffect(primitive.effect.effect) : undefined;
    const pass: TPass = effect || isTranslucentPaint(primitive.stroke.color) ? "translucent" : "opaque";
    return this.pathGroupFor(pass, effect);
  }

  private pathGroupFor(pass: TPass, effect: TEffect | undefined): TPathGroup {
    const key = `${pass}|${effect ? effect.programKey : "plain"}`;
    const known = this.pathGroups.get(key);
    if (known) {
      if (effect && !known.fallback) known.effect = effect;
      return known;
    }
    const id = `path-${pass}-${this.pathGroups.size}`;
    let plugin = createPathPlugin(effect);
    let group: TPathGroup = {
      pass,
      effect,
      fallback: false,
      lines: this.createPathBatch(`${id}-lines`, pass, plugin, this.lineTemplate, createLineTemplate()),
      curves: this.createPathBatch(`${id}-curves`, pass, plugin, this.curveTemplate, createCurveTemplate()),
    };
    if (effect && (!isLinked(group.lines.model) || !isLinked(group.curves.model))) {
      if (!reportedEffects.has(effect.programKey)) {
        reportedEffects.add(effect.programKey);
        console.error(
          "[@gravity-ui/graph] A connection effect does not compile or link; its paths are drawn with the plain " +
            `stroke.\n${compilerLog(isLinked(group.lines.model) ? group.curves.model : group.lines.model)}`
        );
      }
      this.destroyBatch(group.lines);
      this.destroyBatch(group.curves);
      plugin = createPathPlugin(undefined);
      group = {
        pass,
        effect: undefined,
        fallback: true,
        lines: this.createPathBatch(`${id}-lines`, pass, plugin, this.lineTemplate, createLineTemplate()),
        curves: this.createPathBatch(`${id}-curves`, pass, plugin, this.curveTemplate, createCurveTemplate()),
      };
    }
    this.pathGroups.set(key, group);
    return group;
  }

  /** Whether the GL objects are alive: deleting objects of a lost context, restored or not, only reports errors. */
  private ownsObjects(): boolean {
    return !this.objectsLost && !this.gl.isContextLost();
  }

  private destroyBatch(batch: TBatch): void {
    batch.model.destroy();
    if (!this.ownsObjects()) return;
    batch.model.vertexArray.destroy();
    batch.buffer.destroy();
    batch.elements?.buffer.destroy();
  }

  private createTemplate(data: Float32Array): Buffer {
    return this.device.createBuffer({ usage: BUFFER_USAGE, data });
  }

  private createInstanceBuffer(floats: number): DynamicBuffer {
    return new DynamicBuffer(this.device, {
      usage: BUFFER_USAGE,
      byteLength: INITIAL_INSTANCES * floats * FLOAT_BYTES,
    });
  }

  private createTableTexture(width: number, height: number): Texture {
    return this.device.createTexture({
      format: "rgba32float",
      width,
      height,
      usage: TEXTURE_USAGE,
      sampler: TABLE_SAMPLER,
    });
  }

  /** A rect or glyph batch: the quad template and one instance buffer (`layout[1]`). */
  private createBatch(id: string, program: TQuadProgram, pass: TPass): TBatch {
    const { vs, fs, layout, floats, textures } = program;
    const buffer = this.createInstanceBuffer(floats);
    const uniforms: TUniforms = { scene_opaquePass: pass === "opaque" ? 1 : 0 };
    const model = new Model(this.device, {
      id,
      vs,
      fs,
      topology: "triangle-strip",
      bufferLayout: [...layout],
      attributes: { [layout[0].name]: this.quadTemplate, [layout[1].name]: buffer },
      bindings: this.bindings(textures),
      uniforms,
      parameters: PASS_PARAMETERS[pass],
      vertexCount: QUAD_TEMPLATE.length / 2,
      isInstanced: true,
      instanceCount: 0,
    });
    return {
      ranges: new InstanceRanges(floats),
      buffer,
      model,
      uniforms,
      textures,
      layout,
      instanceBuffers: [{ name: layout[1].name, buffer }],
      pointedAt: 0,
    };
  }

  private createPathBatch(
    id: string,
    pass: TPass,
    plugin: ShaderPlugin,
    template: Buffer,
    templateData: Float32Array
  ): TBatch {
    const buffer = this.createInstanceBuffer(INSTANCE_FLOATS);
    const elements = {
      ranges: new InstanceRanges(PATH_ELEMENT_FLOATS),
      buffer: this.createInstanceBuffer(PATH_ELEMENT_FLOATS),
    };
    const uniforms: TUniforms = { scene_opaquePass: pass === "opaque" ? 1 : 0 };
    const model = new Model(this.device, {
      id,
      vs: PATH_VERTEX,
      fs: PATH_FRAGMENT,
      plugins: [plugin],
      topology: "triangle-strip",
      bufferLayout: PATH_LAYOUT,
      attributes: { graph_template: template, graph_instances: buffer, scene_pathElements: elements.buffer },
      bindings: this.bindings(PATH_TEXTURES),
      uniforms,
      parameters: PASS_PARAMETERS[pass],
      vertexCount: templateData.length / 2,
      isInstanced: true,
      instanceCount: 0,
    });
    return {
      ranges: new InstanceRanges(INSTANCE_FLOATS),
      buffer,
      elements,
      model,
      uniforms,
      textures: PATH_TEXTURES,
      layout: PATH_LAYOUT,
      instanceBuffers: [
        { name: PATH_LAYOUT[1].name, buffer },
        { name: PATH_LAYOUT[2].name, buffer: elements.buffer },
      ],
      pointedAt: 0,
    };
  }

  private bindings(names: readonly TTextureName[]): Record<string, Texture> {
    const textures: Record<TTextureName, Texture> = {
      scene_elements: this.elementTexture,
      scene_styles: this.styleTexture,
      scene_atlas: this.atlasTexture,
    };
    return Object.fromEntries(names.map((name) => [name, textures[name]]));
  }

  private *allBatches(): Generator<TBatch> {
    yield this.rects.opaque;
    yield this.rects.translucent;
    yield this.glyphs.opaque;
    yield this.glyphs.translucent;
    for (const group of this.pathGroups.values()) {
      yield group.lines;
      yield group.curves;
    }
  }

  /**
   * The batches of a pass: paths, rects, glyphs. Depth orders the opaque pass; the translucent pass is drawn by
   * `translucentRuns`, where this order breaks ties (the line and curve pieces of one path).
   */
  private *passBatches(pass: TPass): Generator<TBatch> {
    for (const group of this.pathGroups.values()) {
      if (group.pass !== pass) continue;
      yield group.lines;
      yield group.curves;
    }
    yield this.rects[pass];
    yield this.glyphs[pass];
  }

  private readonly keyOf = (id: string): number => this.depth.keyOf(id);

  private readonly levelOf = (id: string): number => this.levels.levelOf(id);

  private readonly elementOf = (id: string): TSceneElement | undefined => this.elements.get(id);

  /**
   * Updates the overlap levels after a change of the translucent set, of a translucent element's own zIndex or order,
   * or of a translucent element's origin or bounds. Then, when a level or a translucent instance list changed since the
   * runs were built, rebuilds the draw runs: for each level, for each step, a draw per program. The instances are
   * sorted by (level, step, element key) when ranges were added or removed since (the lists upload in full then
   * anyway). A level change alone leaves them where they lie: a moved element's chunks are drawn from there at their
   * new draw position, a draw call or two each, until more than `MAX_OUT_OF_PLACE` buckets are out of place
   * (`orderTranslucent`); sorting instead would move and upload every instance between their old and new places. A pan
   * or a zoom does neither.
   */
  private orderTranslucent(): void {
    if (this.levels.pending) {
      const start = performance.now();
      this.levels.update(this.keyOf, this.elementOf);
      this.stats.lastLevelsMs = performance.now() - start;
      this.stats.translucentLevels = this.levels.count;
    }
    const batches = [...this.passBatches("translucent")];
    const stamp = (): number[] => [this.levels.revision, ...batches.map((batch) => batch.ranges.revision)];
    if (sameNumbers(stamp(), this.orderStamp)) return;
    const start = performance.now();
    const layout = (): number[] => batches.map((batch) => batch.ranges.layoutRevision);
    this.translucentRuns = orderTranslucent(
      batches.map((batch) => ({ instances: batch.ranges, elements: batch.elements?.ranges })),
      this.levelOf,
      this.keyOf,
      !sameNumbers(layout(), this.layoutStamp)
    );
    this.translucentBatches = batches;
    // After the sort: it changes the revisions of the lists it reorders.
    this.orderStamp = stamp();
    this.layoutStamp = layout();
    this.stats.lastTranslucentOrderMs = performance.now() - start;
  }

  /**
   * Points the batch's per-instance attributes at instance `first`. WebGL 2 has no base instance, so a run that starts
   * inside the instance buffer moves the attribute offsets in the model's vertex array; the formats are float32.
   */
  private pointInstances(batch: TBatch, first: number): void {
    if (batch.pointedAt === first) return;
    const vertexArray = batch.model.vertexArray;
    if (!(vertexArray instanceof WEBGLVertexArray)) throw new Error("The scene backend needs a WebGL vertex array");
    batch.pointers ??= this.instancePointers(batch);
    const { gl } = this;
    gl.bindVertexArray(vertexArray.handle);
    for (const { buffer, attributes } of batch.pointers) {
      const target = buffer.buffer;
      if (!(target instanceof WEBGLBuffer)) throw new Error("The scene backend needs WebGL buffers");
      gl.bindBuffer(gl.ARRAY_BUFFER, target.handle);
      for (const { location, components, byteOffset, stride } of attributes) {
        gl.vertexAttribPointer(location, components, gl.FLOAT, false, stride, byteOffset + first * stride);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
    batch.pointedAt = first;
  }

  /**
   * The pointers luma sets for the batch's per-instance attributes (`WEBGLVertexArray.setBuffer`), per buffer. Each
   * must be a float32 attribute, neither integer nor normalized: `pointInstances` re-points them as such.
   */
  private instancePointers(batch: TBatch): { buffer: DynamicBuffer; attributes: TPointer[] }[] {
    const infos = Object.values(getAttributeInfosFromLayouts(batch.model.pipeline.shaderLayout, [...batch.layout]));
    return batch.instanceBuffers.map(({ name, buffer }) => ({
      buffer,
      attributes: infos
        .filter((info) => info.bufferName === name)
        .map((info) => {
          if (info.bufferDataType !== "float32" || info.integer || info.normalized) {
            throw new Error(
              `The scene backend re-points ${info.attributeName} of ${batch.model.id} as float32, but it is ` +
                `${info.bufferDataType}${info.integer ? " integer" : ""}${info.normalized ? " normalized" : ""}`
            );
          }
          return {
            location: info.location,
            components: info.bufferComponents,
            byteOffset: info.byteOffset,
            stride: info.byteStride,
          };
        }),
    }));
  }

  /** The group's extra width (0 without an effect) and its effect's `u_<name>` values. */
  private setEffectUniforms(group: TPathGroup): void {
    const { effect } = group;
    for (const { uniforms } of [group.lines, group.curves]) {
      uniforms.graph_extraWidth = effect?.extraWidth ?? 0;
      if (!effect) continue;
      for (const name of Object.keys(effect.uniformTypes)) {
        const value = effect.uniforms[name]?.peek();
        if (value !== undefined) uniforms[`u_${name}`] = value;
      }
    }
  }

  /**
   * `scene_dimColor` of a dim colour, parsed as the Canvas2D interpreter parses it (`readColorRgba`): a colour that
   * does not parse dims nothing in either renderer.
   */
  private setDimColor(color: string): void {
    if (color === this.dimColor) return;
    this.dimColor = color;
    const rgba = readColorRgba(color);
    this.dimFloats = rgba ? [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, 1] : NO_DIM_COLOR;
  }

  /** Draws `count` instances of the batch from where its attributes point; false when there are none. */
  private drawInstances(pass: RenderPass, batch: TBatch, frame: TSceneFrame, count: number): boolean {
    if (count === 0) return false;
    const viewport = [frame.width, frame.height];
    const camera = [frame.x, frame.y, frame.scale];
    const { uniforms } = batch;
    uniforms.scene_viewport = viewport;
    uniforms.scene_camera = camera;
    uniforms.scene_time = frame.time;
    uniforms.scene_dimColor = this.dimFloats;
    uniforms.graph_viewport = viewport;
    uniforms.graph_camera = camera;
    uniforms.graph_dpr = frame.dpr;
    uniforms.graph_time = frame.time;
    batch.model.setInstanceCount(count);
    batch.model.draw(pass);
    this.stats.drawCalls += 1;
    this.stats.instances += count;
    return true;
  }

  /** Uploads what changed in the instance data of a batch: everything after a resize or removal, else a range. */
  private upload(batch: TBatch): TUploadKind {
    const generations = (): number => batch.buffer.generation + (batch.elements?.buffer.generation ?? 0);
    const before = generations();
    const kind = this.uploadRanges(batch.ranges, batch.buffer);
    if (batch.elements) this.uploadRanges(batch.elements.ranges, batch.elements.buffer);
    if (generations() !== before) {
      // A resize replaced a GPU buffer. Bind it now: luma would rebind it at offset 0 inside the next draw, after
      // pointInstances() set a run's offset.
      batch.model.setAttributes(Object.fromEntries(batch.instanceBuffers.map(({ name, buffer }) => [name, buffer])));
      batch.pointedAt = 0;
    }
    return kind;
  }

  private uploadRanges(ranges: InstanceRanges, buffer: DynamicBuffer): TUploadKind {
    const upload = ranges.takeUpload();
    if (upload.kind === "full") {
      const { data } = ranges;
      if (data.byteLength > buffer.byteLength) {
        buffer.resize({ byteLength: Math.max(data.byteLength, buffer.byteLength * 2) });
      }
      if (data.byteLength > 0) {
        buffer.write(data);
        this.stats.uploads += 1;
      }
    } else if (upload.kind === "range" && upload.data.byteLength > 0) {
      buffer.write(upload.data, upload.byteOffset);
      this.stats.uploads += 1;
    }
    return upload.kind;
  }

  /** Uploads the dirty rows of the element table, the style table and the glyph atlas. */
  private uploadTables(): void {
    const rows = this.table.rows;
    if (rows > this.elementTexture.height) {
      const height = Math.max(rows, this.elementTexture.height * 2);
      this.elementTexture.destroy();
      this.elementTexture = this.createTableTexture(TABLE_WIDTH, height);
      this.rebind();
      this.table.takeDirtyRows();
      this.writeElementRows(0, rows);
    } else {
      const dirty = this.table.takeDirtyRows();
      if (dirty) this.writeElementRows(dirty[0], dirty[1]);
    }
    if (this.styles.takeDirty() && this.styles.rows > 0) {
      if (this.styles.rows > this.styleTexture.height) {
        this.styleTexture.destroy();
        this.styleTexture = this.createTableTexture(STYLE_ROW_TEXELS, this.styles.rows);
        this.rebind();
      }
      this.styleTexture.writeData(this.styles.data, { width: STYLE_ROW_TEXELS, height: this.styles.rows });
      this.stats.uploads += 1;
    }
    if (this.atlas.takeDirty()) {
      this.atlasTexture.writeData(this.atlas.data);
      this.stats.uploads += 1;
    }
  }

  private writeElementRows(from: number, to: number): void {
    const texels = TABLE_WIDTH * 4;
    this.elementTexture.writeData(this.table.data.subarray(from * texels, to * texels), {
      y: from,
      width: TABLE_WIDTH,
      height: to - from,
    });
    this.stats.uploads += 1;
  }

  private rebind(): void {
    for (const batch of this.allBatches()) batch.model.setBindings(this.bindings(batch.textures));
  }

  /** Rows of style texels without overrides and base colours (alpha -1) and without dim (r 0). */
  private noStyles(rows: number): Float32Array {
    const data = new Float32Array(rows * STYLE_ROW_TEXELS * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = -1;
    return data;
  }

  private hasVisibleAnimation(): boolean {
    for (const id of this.animated) {
      if (this.elements.get(id)?.hidden === false) return true;
    }
    return false;
  }
}

/** Creates the WebGL scene backend on a canvas of its own, inserted after `sibling`. */
export const createSceneBackend: TCreateSceneBackend = async (
  sibling: HTMLCanvasElement,
  events: TSceneBackendEvents
): Promise<ISceneBackend> => {
  const createdAt = performance.now();
  const canvas = sibling.ownerDocument.createElement("canvas");
  canvas.className = sibling.className;
  canvas.style.zIndex = sibling.style.zIndex;
  // The canvas only shows the scene: events reach the canvases below.
  canvas.style.pointerEvents = "none";
  sibling.after(canvas);
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    canvas.remove();
    throw new Error("WebGL2 is not available");
  }
  const listeners = new AbortController();
  const { signal } = listeners;
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      events.onLost();
    },
    { signal }
  );
  canvas.addEventListener("webglcontextrestored", () => events.onRestored(), { signal });
  let device: Device | undefined;
  try {
    // luma's debug default follows NODE_ENV; the scene reports its own shader errors.
    device = await luma.attachDevice(gl, { adapters: [webgl2Adapter], debug: false, debugShaders: "never" });
    return new WebGLSceneBackend(canvas, gl, device, listeners, createdAt);
  } catch (error) {
    listeners.abort();
    device?.getDefaultCanvasContext().destroy();
    device?.destroy();
    if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    throw error;
  }
};
