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
import type { TSceneLevel } from "../../../services/scene/types";
import type { SceneStore } from "../SceneStore";
import { readColorRgba } from "../colorAlpha";
import { LEVEL_BIT, isOnLevel } from "../levels";
import { bakeElementStyle } from "../style";
import { DEFAULT_TEXT_POLICY, isLayoutValid, layoutText, resolveTextSize } from "../textLayout";
import type { TTextLayout } from "../textLayout";
import { peekSceneTextLayout, sceneTextLayout, sceneTextMetrics } from "../textMetrics";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle, TSceneTextPolicy } from "../types";

import { InstanceRanges } from "./InstanceRanges";
import type {
  ISceneBackend,
  TCreateSceneBackend,
  TSceneBackendEvents,
  TSceneBackendStats,
  TSceneFrame,
  TSceneTextFrame,
} from "./backendTypes";
import { CameraTextEpochs } from "./cameraTextEpochs";
import { SCENE_DEPTH, SceneDepth, movesInDepth } from "./depth";
import { PATH_ELEMENT_FLOATS, encodePaths } from "./encodePaths";
import { RECT_FLOATS, checkSub, encodeRects, hasStrokeWidth, isTranslucentPaint } from "./encodeRects";
import { GLYPH_FLOATS, GLYPH_SUB_FLOATS, encodeText, writeTextGlyphs } from "./encodeText";
import type { TTextEncodeInput, TTextGlyphPlaces } from "./encodeText";
import { GlyphAtlas, glyphRun } from "./glyphs";
import { geometryBounds } from "./levelBounds";
import { TranslucentLevels } from "./overlapLevels";
import {
  ALPHA_FRAGMENT,
  ALPHA_VERTEX,
  GLYPH_ATTRIBUTES,
  GLYPH_FRAGMENT,
  GLYPH_SUB_ATTRIBUTE,
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
import { adoptTexts, planTextEncode, resubGlyphs, textsOf } from "./textEncodes";
import type { TTextEncode, TTextLayouts } from "./textEncodes";
import { TextRelayout } from "./textRelayout";
import type { ITextRelayoutHost } from "./textRelayout";
import { createTinySdfGenerator } from "./tinySdfGlyphs";
import { SUB_FLOAT, elementSteps, orderTranslucent, splitSteps } from "./translucentOrder";
import type { TElementSubs, TTranslucentRun } from "./translucentOrder";

type TPass = "opaque" | "translucent";

type TUploadKind = TSceneBackendStats["lastUploadKind"];

type TUniforms = Record<string, number | readonly number[]>;

type TPathPrimitive = Extract<TScenePrimitive, { kind: "path" }>;

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/**
 * An element with a camera-aware text: its baked primitives (what a full glyph re-encode encodes again) and its last
 * text encode (the texts' glyph counts and layouts: a zoom across a line break rewrites a text's glyphs in place).
 * Which frame checks it is `CameraTextEpochs`'s.
 */
type TCameraTexts = { primitives: readonly TScenePrimitive[]; encode: TTextEncode };

/** The tables a program samples. */
type TTextureName = "scene_elements" | "scene_styles" | "scene_atlas";

type TEffect = ConnectionEffect<TUniformTypes, never>;

/** An instance attribute's pointer: shader location, float components, byte offset in the instance and stride. */
type TPointer = { location: number; components: number; byteOffset: number; stride: number };

/** A per-instance buffer of a model: its name in the buffer layout and the buffer. */
type TInstanceBuffer = { name: string; buffer: DynamicBuffer };

/**
 * A second per-instance list of a batch, kept in step with its instances (the same elements, steps, counts and order,
 * so each range lies at the same instance offset in both lists), in a GPU buffer of its own:
 * - `"elements"` (paths): each instance's element data, `PATH_ELEMENT_FLOATS` (element index, sub, part slot, scale
 *   bounds, level mask);
 * - `"subs"` (glyphs): each instance's sub, one float (`TEncodedGlyphs.subs`), so that a re-sub of unchanged texts
 *   writes and uploads this buffer only.
 */
type TCompanion = { kind: "elements" | "subs"; ranges: InstanceRanges; buffer: DynamicBuffer };

/** The float of a companion instance that holds the primitive's sub. */
const COMPANION_SUB_FLOAT: Record<TCompanion["kind"], number> = { elements: SUB_FLOAT, subs: 0 };

/** Per-element instances of one program and pass, their GPU buffer and the model that draws them. */
type TBatch = {
  ranges: InstanceRanges;
  buffer: DynamicBuffer;
  /** Path and glyph batches: the companion list of the instances (`TCompanion`), kept in step with `ranges`. */
  companion?: TCompanion;
  model: Model;
  /** The model's uniforms: luma reads this object at every draw. */
  uniforms: TUniforms;
  textures: readonly TTextureName[];
  /** Every buffer layout of the model, and its per-instance buffers (`buffer`, then the companion's). */
  layout: readonly BufferLayout[];
  instanceBuffers: readonly TInstanceBuffer[];
  /** The pointers of the per-instance attributes, per instance buffer; read from the linked program on first use. */
  pointers?: readonly { buffer: DynamicBuffer; attributes: readonly TPointer[] }[];
  /** The instance the per-instance attributes point at: translucent runs start inside the buffer. */
  pointedAt: number;
};

/**
 * An element's translucent instances of one program, before they are cut into steps, and their companion data when the
 * batch keeps a companion list. Arrays of their own, never an encode's view (`TInstanceView`): `translucentWrites`
 * keeps them past later encodes.
 */
type TTranslucentWrite = { batch: TBatch; instances: Float32Array; companion?: Float32Array };

/** An element's translucent glyphs and their subs (`TEncodedGlyphs`). */
type TTranslucentGlyphs = { instances: Float32Array; subs: Float32Array };

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

/** The translucent glyphs of an element whose texts kept their instances: none, its texts are all opaque. */
const NO_GLYPHS: TTranslucentGlyphs = { instances: new Float32Array(0), subs: new Float32Array(0) };

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
const BUFFER_USAGE = Buffer.VERTEX | Buffer.COPY_DST;

// eslint-disable-next-line no-bitwise -- luma usage flags are bit masks
const TEXTURE_USAGE = Texture.SAMPLE | Texture.COPY_DST;

const UPLOAD_COST: Record<TUploadKind, number> = { none: 0, range: 1, full: 2 };

/** RGBA32F texels of the element and style tables, r8 of the atlas: bytes per texel. */
const TABLE_TEXEL_BYTES = 16;

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

/**
 * A program drawn as instanced quads: shaders, buffers (template, instances), floats per instance, tables read, and the
 * kind, buffer layout and floats per instance of its companion list, if it keeps one.
 */
type TQuadProgram = {
  vs: string;
  fs: string;
  layout: readonly [BufferLayout, BufferLayout];
  floats: number;
  textures: readonly TTextureName[];
  companion?: { kind: TCompanion["kind"]; layout: BufferLayout; floats: number };
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

/**
 * The companion data written with instances of a batch that keeps a companion list: one companion instance per
 * instance, or the lists would part.
 */
function companionData<TData extends ArrayLike<number>>(
  batch: TBatch,
  companion: TCompanion,
  instances: ArrayLike<number>,
  data?: TData
): TData {
  if (!data || data.length / companion.ranges.floats !== instances.length / batch.ranges.floats) {
    throw new Error(`The scene batch ${batch.model.id} needs one companion instance per instance`);
  }
  return data;
}

/**
 * Writes the instances of an element and their companion data, or removes the element when it has none. The ranges
 * copy them at once, so they may be an encode's views (`TInstanceView`): each is handed here before the next encode
 * with its encoder.
 */
function setInstances(batch: TBatch, id: string, instances: ArrayLike<number>, companion?: ArrayLike<number>): void {
  if (instances.length > 0) {
    batch.ranges.set(id, instances);
    if (batch.companion) batch.companion.ranges.set(id, companionData(batch, batch.companion, instances, companion));
  } else {
    removeInstances(batch, id);
  }
}

function removeInstances(batch: TBatch, id: string): void {
  batch.ranges.delete(id);
  batch.companion?.ranges.delete(id);
}

/** Where a translucent write holds its subs: in its companion data when its batch keeps them there, else inline. */
function subsOfWrite(write: TTranslucentWrite): TElementSubs {
  const { batch, instances, companion } = write;
  if (!batch.companion) return { subs: instances, floats: batch.ranges.floats };
  return {
    subs: companionData(batch, batch.companion, instances, companion),
    floats: batch.companion.ranges.floats,
    subFloat: COMPANION_SUB_FLOAT[batch.companion.kind],
  };
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

/** Whether two layouts hold the same lines. */
function sameLines(a: TTextLayout | undefined, b: TTextLayout | undefined): boolean {
  if (!a || !b) return a === b;
  return a.lines.length === b.lines.length && a.lines.every((line, index) => line === b.lines[index]);
}

/**
 * The camera-aware texts a re-layout changed: their lines, or the policy they are laid out under (their glyphs' size
 * mode follows it).
 */
function changedTexts(before: TTextLayouts, after: TTextLayouts | undefined): number {
  if (!after) return 0;
  let changed = 0;
  before.texts.forEach((text, index) => {
    if (!text.cameraAware) return;
    const policy = before.policy.cameraAware !== after.policy.cameraAware;
    if (policy || !sameLines(before.layouts[index], after.layouts[index])) changed++;
  });
  return changed;
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
    lastApplyMs: 0,
    textRelayouts: 0,
    lastTextRelayouts: 0,
    lastTextRelayoutGlyphs: 0,
    lastTextRelayoutBytes: 0,
    lastTextRelayoutWrittenBytes: 0,
    lastTextRelayoutDrawnBytes: 0,
    lastTextRelayoutsKept: 0,
    lastTextRelayoutMs: 0,
    staleTexts: 0,
    uploadBytes: 0,
    lastUploadBytes: 0,
    lastUploadWrites: 0,
    subBits: SCENE_DEPTH.MIN_SUB_BITS,
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
  /** The depth sub-order of each child element's first primitive; owners start at 0. */
  private readonly subBases = new Map<string, number>();
  /**
   * Owners whose children need their sub bases checked after this batch, and whose sub-order count (their primitives
   * with their children's) goes to the depth then.
   */
  private readonly rebase = new Set<string>();
  /** Children to encode after this batch, with their sub base. */
  private readonly encodeLater = new Set<string>();
  /** The last text encode of each element whose glyphs all went to the opaque pass (`encodeGlyphs`). */
  private readonly textEncodes = new Map<string, TTextEncode>();
  /**
   * The primitive count of each owner's last encode (children have none): an owner's children move only when it
   * changes.
   */
  private readonly encodedCounts = new Map<string, number>();
  /** The elements with instances in a translucent batch (`setTranslucent`). */
  private readonly translucentIds = new Set<string>();
  /** The scale and policy texts are laid out for: the next draw's (`applyMany`, `replay`, `draw`). */
  private textFrame: TSceneTextFrame = { scale: 1, textPolicy: DEFAULT_TEXT_POLICY };
  /** The text frame of the draws (`refreshTexts`), rewritten by each one. */
  private readonly drawTextFrame: { scale: number; textPolicy: TSceneTextPolicy } = {
    scale: 1,
    textPolicy: DEFAULT_TEXT_POLICY,
  };
  /** The elements with a camera-aware text (`TCameraTexts`). */
  private readonly cameraTexts = new Map<string, TCameraTexts>();
  /** Which elements of `cameraTexts` a frame checks (`refreshTexts`). */
  private readonly textEpochs = new CameraTextEpochs({
    isDrawn: (id) => {
      const element = this.elements.get(id);
      return element !== undefined && !this.hiddenInScene(element);
    },
    showsTexts: (id, scale, level) => this.showsTexts(id, scale, level),
    refresh: (id) => {
      const camera = this.cameraTexts.get(id);
      if (camera && !this.layoutsCurrent(camera.encode)) this.relayoutTexts(id, camera);
    },
  });
  /** Bytes and writes of the uploads in the current draw (`stats.lastUploadBytes`, `stats.lastUploadWrites`). */
  private frameUploadBytes = 0;
  private frameUploadWrites = 0;
  /**
   * The translucent writes of the last encode of each element of `cameraTexts` with translucent instances: a glyph
   * re-encode re-cuts the element's steps with them instead of encoding its rects and paths again.
   */
  private readonly translucentWrites = new Map<string, TTranslucentWrite[]>();
  /** The pass of each text of an encode, and the glyphs its lines placed (`writeGlyphs`), reused by every encode. */
  private readonly glyphPasses: boolean[] = [];
  private readonly glyphPlaced: number[] = [];
  /** The in-place re-layout of `relayoutTexts`, and the element it works on (`relayoutHost`) during a call. */
  private readonly textRelayout = new TextRelayout();
  private relayoutId = "";
  private relayoutCamera: TCameraTexts | undefined;
  private readonly relayoutHost: ITextRelayoutHost = {
    metrics: sceneTextMetrics,
    layout: (text, size) => sceneTextLayout(text, text, size),
    run: (text, layout) => glyphRun(text, layout, this.atlas, sceneTextMetrics),
    edit: (encode, at, first, written, layout, run) => {
      const text = encode.texts[at];
      const batch = encode.translucent?.[at] ? this.glyphs.translucent : this.glyphs.opaque;
      const target = {
        elementIndex: encode.index,
        slot: this.slotOf(text.part),
        policy: this.textFrame.textPolicy,
        atlas: this.atlas,
      };
      return batch.ranges.editSpan(this.relayoutId, first, written, (data, offset) =>
        writeTextGlyphs(data, offset, written, text, layout, run, target)
      );
    },
    rewrite: () => {
      if (this.relayoutCamera) this.rewriteGlyphs(this.relayoutId, this.relayoutCamera);
    },
  };

  private readonly quadTemplate: Buffer;
  private readonly lineTemplate: Buffer;
  private readonly curveTemplate: Buffer;
  private elementTexture: Texture;
  private styleTexture: Texture;
  private readonly atlasTexture: Texture;

  private readonly rects: Record<TPass, TBatch>;
  private readonly glyphs: Record<TPass, TBatch>;
  /** The subs of the opaque glyphs: a re-sub rewrites them only (`encodeGlyphs`). */
  private readonly glyphSubs: TCompanion;
  private readonly pathGroups = new Map<string, TPathGroup>();
  private readonly alphaModel: Model;

  /** The overlap levels of the elements with translucent instances. */
  private readonly levels = new TranslucentLevels();
  /**
   * The depth's width, the level revision and the revisions of the translucent instance lists the current runs were
   * built from. Depth keys enter the runs only through the levels.
   */
  private orderStamp: number[] = [];
  /** The layout revisions of the translucent instance lists when the runs were built: a change sorts them again. */
  private layoutStamp: number[] = [];
  /** The translucent batches the runs index, and the runs: scene order where translucent primitives overlap. */
  private translucentBatches: TBatch[] = [];
  private translucentRuns: TTranslucentRun[] = [];

  private frames = 0;
  /** `scene_subs` of the frame: the depth's sub-orders per key, 2^subBits. */
  private subs = 2 ** SCENE_DEPTH.MIN_SUB_BITS;
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
    const glyphSubs = this.glyphs.opaque.companion;
    if (!glyphSubs) throw new Error("The scene glyph batches keep their subs in a companion list");
    this.glyphSubs = glyphSubs;
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

  public replay(store: SceneStore, text?: TSceneTextFrame): void {
    const start = performance.now();
    this.reset();
    if (text) this.textFrame = text;
    this.store = store;
    this.setStyles(store.getStyles());
    store.forEach((element) => this.applyChange({ type: "add", element }));
    this.rebaseChildren();
    this.flushDepth();
    this.stats.lastReplayMs = performance.now() - start;
  }

  public applyMany(changes: readonly TSceneChange[], text?: TSceneTextFrame): void {
    const start = performance.now();
    if (text) this.textFrame = text;
    // The elements the frame deletes or moves give up their depth places before any element takes one: the frame then
    // fits the depth limits whenever its changes one by one did, whatever the order of different elements' changes.
    for (const change of changes) {
      if (change.type === "delete" || movesInDepth(change)) this.depth.release(change.element.id);
    }
    for (const change of changes) this.applyChange(change);
    this.rebaseChildren();
    this.flushDepth();
    this.stats.lastApplyMs = performance.now() - start;
  }

  public setStyles(styles: readonly TSceneStyle[]): void {
    this.styles.setStyles(styles);
  }

  public draw(frame: TSceneFrame): boolean {
    if (this.disposed || this.gl.isContextLost()) return false;
    const start = performance.now();
    this.frameUploadBytes = 0;
    this.frameUploadWrites = 0;
    // Before the uploads: a re-laid-out text writes glyph instances, and maybe atlas glyphs.
    this.refreshTexts(frame);
    this.device
      .getDefaultCanvasContext()
      .setDrawingBufferSize(
        Math.max(1, Math.round(frame.width * frame.dpr)),
        Math.max(1, Math.round(frame.height * frame.dpr))
      );
    this.uploadTables();
    this.setDimColor(frame.dimColor);
    // The width of the last apply (a no-op renumber): every program multiplies the element keys by it.
    this.depth.renumber();
    this.subs = 2 ** this.depth.subBits;
    // Before the uploads: sorting moves translucent instances.
    this.orderTranslucent();
    let uploadKind: TUploadKind = "none";
    for (const batch of this.allBatches()) {
      const kind = this.upload(batch);
      if (UPLOAD_COST[kind] > UPLOAD_COST[uploadKind]) uploadKind = kind;
    }
    this.stats.lastUploadKind = uploadKind;
    this.stats.lastUploadBytes = this.frameUploadBytes;
    this.stats.lastUploadWrites = this.frameUploadWrites;
    this.stats.uploadBytes += this.frameUploadBytes;
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
      this.addElement(element);
      return;
    }
    const fields = change.fields;
    const changed = (field: keyof TSceneElement): boolean => fields === undefined || fields.has(field);
    const { parent } = element;
    // A change of the style's raise comes as a zIndex change: the bucket is the zIndex plus the raise.
    // The same test as the release in applyMany(): a released element always gets its place back. A child's own
    // zIndex and order are ignored: it draws with its parent's key.
    if (parent === undefined && movesInDepth(change)) {
      this.depth.set(element.id, this.zIndexOf(element), element.order);
    }
    // Also when the primitives are the same array: the element properties of the style (widths, translucent colours,
    // opacity) changed.
    if (changed("primitives")) this.primitivesChanged(element);
    if (parent !== undefined && changed("childOrder")) this.rebase.add(parent);
    if (changed("x") || changed("y") || changed("hidden") || changed("styleId")) this.writeElement(element);
    // The store sends no update to what is nested in an element whose hidden flag changed.
    if (changed("hidden")) this.writeChildren(element.id);
    // A translucent element that moves can start or stop overlapping others.
    const moved = changed("x") || changed("y") || changed("bounds");
    if (moved) this.levels.moved(element.id);
    if (moved || changed("hidden")) this.textsMoved(element, moved, changed("hidden"));
  }

  /**
   * A camera-aware text that moves or shows again (itself, or nested in an element whose hidden flag changed) can
   * enter the view with stale lines: the next frame checks it.
   */
  private textsMoved(element: TSceneElement, moved: boolean, hidden: boolean): void {
    if (this.cameraTexts.has(element.id)) {
      const { x, y, bounds } = element;
      if (moved) this.textEpochs.move(element.id, x + bounds.minX, y + bounds.minY, x + bounds.maxX, y + bounds.maxY);
      else this.textEpochs.showAgain(element.id);
    }
    if (!hidden) return;
    for (const child of this.store?.childrenOf(element.id) ?? []) this.textEpochs.showAgain(child.id);
  }

  /**
   * An owner takes its depth place and is encoded now, and gives the depth its sub-order count after the batch; a
   * child is encoded once the batch knows its sub base.
   */
  private addElement(element: TSceneElement): void {
    if (element.parent === undefined) {
      this.depth.set(element.id, this.zIndexOf(element), element.order);
      this.encode(element);
      this.rebase.add(element.id);
    } else {
      // A child takes no depth place: it draws with its parent's key (`rebaseChildren`).
      this.rebase.add(element.parent);
      this.encodeLater.add(element.id);
    }
    // The depth key is written by flushDepth(): a new owner always gets one, and its children's texels with it.
    this.writeElement(element);
  }

  /**
   * An owner is encoded now and, when its primitive count changed, checks its children's sub bases and its sub-order
   * count after the batch; a child is encoded after the batch, and its parent checks the sub bases of its siblings.
   */
  private primitivesChanged(element: TSceneElement): void {
    if (element.parent === undefined) {
      const before = this.encodedCounts.get(element.id);
      this.encode(element);
      // The same count moves no child and keeps the sub-order count: a child's own changes rebase its parent.
      if (before !== element.primitives.length) this.rebase.add(element.id);
    } else {
      this.encodeLater.add(element.id);
      this.rebase.add(element.parent);
    }
  }

  /**
   * Writes the element texels of every element whose depth key changed, and of their children, which draw with their
   * parent's key; the store sends them no update when only their parent moves in depth.
   */
  private flushDepth(): void {
    for (const id of this.depth.takeChanged()) {
      const element = this.elements.get(id);
      if (element) this.writeElement(element);
      this.writeChildren(id);
    }
    // The width of this batch: a change rewrites nothing, the frame's `scene_subs` and the translucent order take it.
    this.stats.subBits = this.depth.subBits;
    // Only an element whose own zIndex or order was set can change the order of the translucent elements among
    // themselves. A raise renumbers the dense ranks of its whole band, but the others keep their order, so their
    // levels stand. Children move with their parent.
    for (const id of this.depth.takeSet()) {
      this.levels.reordered(id);
      for (const child of this.store?.childrenOf(id) ?? []) this.levels.reordered(child.id);
    }
  }

  /**
   * Writes the texels of the elements drawn after an element in its owner (`SceneStore.childrenOf`: an owner's
   * children, or what is nested in a child): their key follows the owner, their hidden state the nesting.
   */
  private writeChildren(id: string): void {
    for (const child of this.store?.childrenOf(id) ?? []) {
      if (this.elements.has(child.id)) this.writeElement(child);
    }
  }

  private rootIdOf(element: TSceneElement): string {
    return element.parent ?? element.id;
  }

  /** Hidden itself or through an element it is nested in, up to its owner: the texel key is -1 then. */
  private hiddenInScene(element: TSceneElement): boolean {
    if (element.hidden) return true;
    let above = element.nestedIn ?? element.parent;
    while (above !== undefined) {
      const next = this.elements.get(above);
      if (!next) return false;
      if (next.hidden) return true;
      above = next.nestedIn ?? next.parent;
    }
    return false;
  }

  /**
   * The order of an element among translucent ones: its root's depth key, then its sub base, at the depth's current
   * width (below `ELEMENT_KEYS`). The numbers change with the width, the order does not; nothing keeps them.
   */
  private readonly orderKeyOf = (id: string): number => {
    const element = this.elements.get(id);
    if (!element) return 0;
    // keyOf renumbers first, which also sets the width.
    const key = this.depth.keyOf(this.rootIdOf(element));
    return key * 2 ** this.depth.subBits + (this.subBases.get(id) ?? 0);
  };

  /**
   * Gives each child of the owners touched in this batch its sub base (the owner's primitive count plus the counts of
   * the siblings before it), encodes the children whose base moved or that wait for an encode, and gives the depth
   * each owner's sub-order count: its primitives with its children's. Bases are absolute subs, so a width change
   * re-encodes nothing.
   */
  private rebaseChildren(): void {
    for (const parentId of this.rebase) {
      const parent = this.elements.get(parentId);
      let base = parent ? parent.primitives.length : 0;
      for (const child of this.store?.childrenOf(parentId) ?? []) {
        if (!this.elements.has(child.id)) continue;
        if (this.subBases.get(child.id) !== base) {
          this.subBases.set(child.id, base);
          this.encodeLater.add(child.id);
          this.levels.reordered(child.id);
        }
        base += child.primitives.length;
      }
      if (parent) this.depth.setSubCount(parentId, base);
    }
    this.rebase.clear();
    for (const id of this.encodeLater) {
      const element = this.elements.get(id);
      if (element) this.encode(element);
    }
    this.encodeLater.clear();
  }

  /** The element's zIndex bucket with the raise of its style. */
  private zIndexOf(element: TSceneElement): number {
    return this.store ? this.store.zIndexOf(element) : element.zIndex;
  }

  /** The element's style row in the store: the backend's style table is only updated at the next draw. */
  private styleOf(element: TSceneElement): TSceneStyle | undefined {
    return this.store?.getStyles()[element.styleId];
  }

  /**
   * Writes the element's texels with its root's key of the last renumber: a write while changes are applied never
   * renumbers; `flushDepth()` rewrites every element whose key the single renumber changed, children included.
   */
  private writeElement(element: TSceneElement): void {
    const key = this.depth.peekKey(this.rootIdOf(element));
    this.table.write(element.id, element.x, element.y, key, this.hiddenInScene(element), element.styleId);
  }

  private remove(id: string): void {
    const parent = this.elements.get(id)?.parent;
    if (parent !== undefined) {
      this.subBases.delete(id);
      // The siblings after it move down.
      if (this.elements.has(parent)) this.rebase.add(parent);
    }
    for (const batch of this.allBatches()) removeInstances(batch, id);
    this.pathGroupsOf.delete(id);
    this.setSkipped(id, { polygon: 0, icon: 0 });
    this.animated.delete(id);
    this.textEncodes.delete(id);
    this.forgetCameraTexts(id);
    this.encodedCounts.delete(id);
    this.translucentIds.delete(id);
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
    this.subBases.clear();
    this.rebase.clear();
    this.encodeLater.clear();
    this.textEncodes.clear();
    this.cameraTexts.clear();
    this.textEpochs.reset();
    this.translucentWrites.clear();
    this.encodedCounts.clear();
    this.translucentIds.clear();
    this.depth = new SceneDepth();
    this.levels.clear();
    this.table = new ElementTable();
    for (const batch of this.allBatches()) {
      batch.ranges = new InstanceRanges(batch.ranges.floats);
      if (batch.companion) batch.companion.ranges = new InstanceRanges(batch.companion.ranges.floats);
    }
  }

  private readonly slotOf = (part: string | undefined): number => this.styles.slotOf(part);

  /**
   * Encodes the element's primitives with the element properties of its style baked in (widths, circle scale,
   * translucent colours, opacity: a faded primitive gets all its colours baked, faded); the other opaque colours and
   * visibility stay in the style table. Instances with a baked alpha below 1 go to the translucent pass. A child
   * element's subs start at its sub base, after its parent's and its earlier siblings' primitives.
   */
  private encode(element: TSceneElement): void {
    const start = performance.now();
    const { id } = element;
    const primitives = bakeElementStyle(element.primitives, this.styleOf(element));
    const index = this.table.indexOf(id);
    const subBase = this.subBases.get(id) ?? 0;
    const { maxSub } = this.depth;
    const rects = encodeRects(primitives, index, this.slotOf, subBase, maxSub);
    // The opaque rects are a view of the encoder's list (`TInstanceView`): written before any other encode runs.
    setInstances(this.rects.opaque, id, rects.opaque);
    const glyphs = this.encodeGlyphs(id, primitives, index, subBase, maxSub);
    const translucent = this.encodePathsOf(id, primitives, index, subBase, maxSub);
    translucent.push(
      { batch: this.rects.translucent, instances: rects.translucent },
      { batch: this.glyphs.translucent, instances: glyphs.instances, companion: glyphs.subs }
    );
    this.setTranslucent(id, primitives, translucent);
    this.setSkipped(id, countSkipped(primitives));
    if (element.parent === undefined) this.encodedCounts.set(id, primitives.length);
    this.stats.encodes += primitives.length;
    this.stats.lastEncodeMs = performance.now() - start;
  }

  /**
   * Writes the element's opaque glyphs and their subs, and returns its translucent ones. Texts equal to those of its
   * last encode (`sameText`), at the same element index, all opaque and with layouts still current for the text frame
   * (`layoutsCurrent`), keep the instances they wrote (`planTextEncode`): at the same subs nothing is written, and when
   * a primitive before them was added or removed only their subs are (`resubGlyphs`), in the sub list, which uploads
   * alone. Either way the glyph pass and its subs hold the floats a full encode would write; a change of any text
   * encodes them all again. An element without texts keeps no record: its encode finds no text to lay out.
   */
  private encodeGlyphs(
    id: string,
    primitives: readonly TScenePrimitive[],
    index: number,
    subBase: number,
    maxSub: number
  ): TTranslucentGlyphs {
    const last = this.textEncodes.get(id);
    const plan = planTextEncode(last, index, primitives, subBase, this.layoutsCurrent);
    if (last && plan !== "encode") {
      // The widest sub is the last text's: check it before the record takes the new subs, so a throw leaves it intact.
      for (let at = primitives.length - 1; at >= 0; at--) {
        if (primitives[at].kind !== "text") continue;
        checkSub(subBase + at, maxSub);
        break;
      }
      adoptTexts(last, primitives, subBase);
      this.trackCameraTexts(id, primitives, last);
      const { subs } = last;
      if (plan === "resub") {
        // The glyph instances stay as they are: only their subs are rewritten, and only the sub buffer uploads.
        this.glyphSubs.ranges.edit(id, (glyphSubs, step) => {
          // `resubGlyphs` walks the texts from the first glyph of the range it gets: only right for a single range.
          if (step !== 0) throw new Error("The opaque glyph pass of a scene element must be a single step-0 range");
          resubGlyphs(glyphSubs, last.glyphs, subs);
        });
      }
      return NO_GLYPHS;
    }
    return this.writeGlyphs(id, primitives, index, subBase, maxSub);
  }

  /**
   * Encodes the element's texts, laid out for the text frame (`sceneTextLayout`), into the opaque glyph pass and
   * returns the translucent glyphs; keeps the record of its last text encode (`textEncodes` while every glyph is
   * opaque) and of its camera-aware texts.
   */
  private writeGlyphs(
    id: string,
    primitives: readonly TScenePrimitive[],
    index: number,
    subBase: number,
    maxSub: number
  ): TTranslucentGlyphs {
    const { texts, subs } = textsOf(primitives, subBase);
    const layouts: (TTextLayout | undefined)[] = [];
    const { scale, textPolicy } = this.textFrame;
    const input: TTextEncodeInput = {
      policy: textPolicy,
      metrics: sceneTextMetrics,
      layoutOf: (text: TTextPrimitive): TTextLayout => {
        const size = resolveTextSize(text, scale, textPolicy);
        // A world text keeps its lines until the metrics change: the backend keeps no layout of it. A heightless one
        // takes the layout its element's bounds made and the shared cache keeps (`elementBounds`).
        if (!text.cameraAware) {
          layouts.push(undefined);
          const bounded = text.height === undefined ? peekSceneTextLayout(text, size) : undefined;
          return bounded ?? layoutText(text, size, sceneTextMetrics);
        }
        const layout = sceneTextLayout(text, text, size);
        layouts.push(layout);
        return layout;
      },
    };
    const passes = this.glyphPasses;
    passes.length = 0;
    const placedScratch = this.glyphPlaced;
    placedScratch.length = 0;
    const places: TTextGlyphPlaces = { counts: [], translucent: passes, placed: placedScratch };
    const glyphs = encodeText(primitives, index, this.slotOf, this.atlas, input, subBase, maxSub, places);
    // The opaque glyphs and their subs are views of the encoder's lists (`TInstanceView`): written at once. The
    // translucent ones returned below are copies, which `translucentWrites` may keep.
    setInstances(this.glyphs.opaque, id, glyphs.opaque, glyphs.subs.opaque);
    const encode: TTextEncode = {
      index,
      texts,
      subs,
      glyphs: places.counts,
      // Kept only for an element with a translucent text: the others' glyphs all lie in the opaque pass.
      translucent: passes.includes(true) ? passes.slice() : undefined,
      // Kept only for an element with a camera-aware text: a re-layout rewrites the slots its lines use.
      placed: texts.some((text) => text.cameraAware) ? placedScratch.slice() : undefined,
      layouts,
      policy: textPolicy,
      generation: sceneTextMetrics.generation,
    };
    if (texts.length > 0 && glyphs.translucent.length === 0) this.textEncodes.set(id, encode);
    else this.textEncodes.delete(id);
    this.trackCameraTexts(id, primitives, encode);
    return { instances: glyphs.translucent, subs: glyphs.subs.translucent };
  }

  /**
   * Keeps the element in `cameraTexts` and the text index while one of its texts is camera-aware (whatever the policy
   * says), with its baked primitives and its last text encode.
   */
  private trackCameraTexts(id: string, primitives: readonly TScenePrimitive[], encode: TTextEncode): void {
    if (!encode.texts.some((text) => text.cameraAware)) {
      this.forgetCameraTexts(id);
      return;
    }
    const known = this.cameraTexts.get(id);
    if (known) {
      known.primitives = primitives;
      known.encode = encode;
    } else {
      this.cameraTexts.set(id, { primitives, encode });
    }
    const element = this.elements.get(id);
    if (!element) return;
    const { x, y, bounds } = element;
    this.textEpochs.track(id, encode.texts, x + bounds.minX, y + bounds.minY, x + bounds.maxX, y + bounds.maxY);
  }

  private forgetCameraTexts(id: string): void {
    if (!this.cameraTexts.delete(id)) return;
    this.textEpochs.forget(id);
    this.translucentWrites.delete(id);
  }

  /**
   * Whether texts laid out as `encoded` are what an encode for the text frame would lay out: the same metrics, and
   * each camera-aware text laid out under the same policy (its glyphs' size mode follows it) with a layout valid at its
   * size there (`isLayoutValid`). A world text's lines change only with the metrics.
   */
  private readonly layoutsCurrent = (encoded: TTextLayouts): boolean => {
    if (encoded.generation !== sceneTextMetrics.generation) return false;
    const { scale, textPolicy } = this.textFrame;
    for (let index = 0; index < encoded.texts.length; index++) {
      const text = encoded.texts[index];
      if (!text.cameraAware) continue;
      if (encoded.policy.cameraAware !== textPolicy.cameraAware) return false;
      const layout = encoded.layouts[index];
      if (!layout || !isLayoutValid(layout, resolveTextSize(text, scale, textPolicy), sceneTextMetrics)) return false;
    }
    return true;
  };

  /**
   * Before a draw: the camera-aware texts the frame shows whose lines change at its scale, level or policy are laid
   * out again and their glyphs rewritten (`relayoutTexts`); the others may stay stale until a frame shows them
   * (`CameraTextEpochs`). Between line breaks nothing is re-encoded: the shader scales the glyphs. Allocates nothing
   * unless a text is laid out again.
   */
  private refreshTexts(frame: TSceneFrame): void {
    const textPolicy = frame.textPolicy ?? DEFAULT_TEXT_POLICY;
    // Rewritten in place: a zoom frame allocates no text frame.
    const drawn = this.drawTextFrame;
    drawn.scale = frame.scale;
    drawn.textPolicy = textPolicy;
    this.textFrame = drawn;
    const { stats } = this;
    stats.lastTextRelayouts = 0;
    stats.lastTextRelayoutGlyphs = 0;
    stats.lastTextRelayoutBytes = 0;
    stats.lastTextRelayoutWrittenBytes = 0;
    stats.lastTextRelayoutDrawnBytes = 0;
    stats.lastTextRelayoutsKept = 0;
    stats.lastTextRelayoutMs = 0;
    if (this.cameraTexts.size === 0) {
      stats.staleTexts = 0;
      return;
    }
    const start = performance.now();
    const { x, y, width, height, scale, level } = frame;
    this.textEpochs.check(x, y, width, height, scale, level, textPolicy.cameraAware);
    stats.staleTexts = this.textEpochs.stale;
    if (stats.lastTextRelayouts > 0) stats.lastTextRelayoutMs = performance.now() - start;
  }

  /** Whether one of the element's camera-aware texts is on the scale range and the level of a frame. */
  private showsTexts(id: string, scale: number, level: TSceneLevel | undefined): boolean {
    const camera = this.cameraTexts.get(id);
    if (!camera) return false;
    for (const text of camera.encode.texts) {
      if (
        text.cameraAware &&
        (text.minScale === undefined || scale >= text.minScale) &&
        (text.maxScale === undefined || scale < text.maxScale) &&
        isOnLevel(text.levelMask, level)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lays the element's camera-aware texts out for the text frame and rewrites in place the glyphs of each whose glyphs
   * change (`TextRelayout`: only the slots up to the larger of the glyphs its lines placed before and place now; the
   * element's rects, paths, other texts, glyph subs and translucent steps stay as they are). Other metrics or another
   * element index, a text that would place more glyphs than it keeps, or a span its pass does not hold re-encode the
   * element's glyphs instead (`rewriteGlyphs`), against its last encode as it was.
   */
  private relayoutTexts(id: string, camera: TCameraTexts): void {
    const { encode } = camera;
    if (encode.generation !== sceneTextMetrics.generation || encode.index !== this.table.indexOf(id)) {
      this.rewriteGlyphs(id, camera);
      return;
    }
    this.relayoutId = id;
    this.relayoutCamera = camera;
    try {
      const { scale, textPolicy } = this.textFrame;
      this.textRelayout.relayout(encode, scale, textPolicy, this.relayoutHost, this.stats);
    } finally {
      this.relayoutCamera = undefined;
    }
  }

  /**
   * Re-encodes the element's glyphs alone for the text frame, in both passes: the opaque glyph range is replaced, and,
   * when the element had or has translucent glyphs, they replace their write among its last translucent writes, whose
   * steps are cut again (`setTranslucent`). Its rects and paths are not encoded again.
   */
  private rewriteGlyphs(id: string, camera: TCameraTexts): void {
    const before = camera.encode;
    const index = this.table.indexOf(id);
    const subBase = this.subBases.get(id) ?? 0;
    const glyphs = this.writeGlyphs(id, camera.primitives, index, subBase, this.depth.maxSub);
    const writes = this.translucentWrites.get(id);
    const hadGlyphs = writes?.some((write) => write.batch === this.glyphs.translucent && write.instances.length > 0);
    if (hadGlyphs || glyphs.instances.length > 0) {
      const next = (writes ?? []).filter((write) => write.batch !== this.glyphs.translucent);
      next.push({ batch: this.glyphs.translucent, instances: glyphs.instances, companion: glyphs.subs });
      this.setTranslucent(id, camera.primitives, next);
    }
    const { stats } = this;
    const after = this.cameraTexts.get(id)?.encode;
    const count = changedTexts(before, after);
    stats.textRelayouts += count;
    stats.lastTextRelayouts += count;
    for (const glyphCount of after?.glyphs ?? []) {
      stats.lastTextRelayoutGlyphs += glyphCount;
      stats.lastTextRelayoutBytes += glyphCount * GLYPH_FLOATS * FLOAT_BYTES;
      stats.lastTextRelayoutWrittenBytes += glyphCount * GLYPH_FLOATS * FLOAT_BYTES;
    }
    for (const placedCount of after?.placed ?? [])
      stats.lastTextRelayoutDrawnBytes += placedCount * GLYPH_FLOATS * FLOAT_BYTES;
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
   * then rects, then glyphs), and their companion data, cut into its local steps: a new step at each change of program
   * in primitive order. Keeps the element in the overlap levels while it has translucent instances, with the bounds of
   * its baked primitives.
   */
  private setTranslucent(id: string, primitives: readonly TScenePrimitive[], writes: TTranslucentWrite[]): void {
    // Nothing translucent before or now: no instances to remove, no overlap level to drop.
    if (!this.translucentIds.has(id) && writes.every((write) => write.instances.length === 0)) return;
    const present = writes.filter((write) => write.instances.length > 0);
    for (const write of writes) if (write.instances.length === 0) removeInstances(write.batch, id);
    const subs = present.map(subsOfWrite);
    const steps = elementSteps(subs);
    present.forEach((write, source) => {
      const { batch, instances } = write;
      batch.ranges.setSteps(id, splitSteps(instances, batch.ranges.floats, steps[source]));
      // A write with a companion list holds its subs in its companion data (`subsOfWrite`).
      if (batch.companion) {
        batch.companion.ranges.setSteps(
          id,
          splitSteps(subs[source].subs, batch.companion.ranges.floats, steps[source])
        );
      }
    });
    if (present.length > 0) {
      this.levels.set(id, geometryBounds(primitives));
      this.translucentIds.add(id);
    } else {
      this.levels.delete(id);
      this.translucentIds.delete(id);
    }
    // A glyph re-encode of a camera-aware text re-cuts the steps with them (`relayoutTexts`).
    if (present.length > 0 && this.cameraTexts.has(id)) this.translucentWrites.set(id, writes);
    else this.translucentWrites.delete(id);
  }

  /**
   * Encodes the paths of each group separately; `sub` stays `subBase` plus the path's index in the element. A path
   * whose stroke width is unset draws nothing and joins no group. Writes the opaque groups and returns the writes of
   * the translucent ones, lines before curves.
   */
  private encodePathsOf(
    id: string,
    primitives: readonly TScenePrimitive[],
    index: number,
    subBase: number,
    maxSub: number
  ): TTranslucentWrite[] {
    // No path now and none before: no group to write or to leave.
    if (!this.pathGroupsOf.has(id) && !primitives.some((primitive) => primitive.kind === "path")) {
      this.animated.delete(id);
      return [];
    }
    const groupOfSub = primitives.map((primitive) =>
      primitive.kind === "path" && hasStrokeWidth(primitive.stroke) ? this.pathGroupOf(primitive) : undefined
    );
    const groups = new Set<TPathGroup>();
    for (const group of groupOfSub) if (group) groups.add(group);
    const translucent: TTranslucentWrite[] = [];
    for (const group of groups) {
      const select = (_: TScenePrimitive, sub: number): boolean => groupOfSub[sub] === group;
      const encoded = encodePaths(primitives, index, PATH_BUCKET, this.slotOf, select, subBase, maxSub);
      if (group.pass === "translucent") {
        translucent.push(
          { batch: group.lines, instances: encoded.lines, companion: encoded.lineElements },
          { batch: group.curves, instances: encoded.curves, companion: encoded.curveElements }
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
    batch.companion?.buffer.destroy();
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

  /**
   * A rect or glyph batch: the quad template, one instance buffer (`layout[1]`) and, for a program with a companion
   * list (glyphs: their subs), the companion's buffer.
   */
  private createBatch(id: string, program: TQuadProgram, pass: TPass): TBatch {
    const { vs, fs, layout, floats, textures } = program;
    const buffer = this.createInstanceBuffer(floats);
    const instanceBuffers: TInstanceBuffer[] = [{ name: layout[1].name, buffer }];
    const bufferLayout: BufferLayout[] = [...layout];
    let companion: TCompanion | undefined;
    if (program.companion) {
      companion = {
        kind: program.companion.kind,
        ranges: new InstanceRanges(program.companion.floats),
        buffer: this.createInstanceBuffer(program.companion.floats),
      };
      instanceBuffers.push({ name: program.companion.layout.name, buffer: companion.buffer });
      bufferLayout.push(program.companion.layout);
    }
    const uniforms: TUniforms = { scene_opaquePass: pass === "opaque" ? 1 : 0 };
    const model = new Model(this.device, {
      id,
      vs,
      fs,
      topology: "triangle-strip",
      bufferLayout,
      attributes: {
        [layout[0].name]: this.quadTemplate,
        ...Object.fromEntries(instanceBuffers.map((instance) => [instance.name, instance.buffer])),
      },
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
      companion,
      model,
      uniforms,
      textures,
      layout: bufferLayout,
      instanceBuffers,
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
    const elements: TCompanion = {
      kind: "elements",
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
      companion: elements,
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
   * or a zoom does neither. A change of the depth's width rebuilds the runs in its frame: it bounds the steps of an
   * element, so it numbers the draw positions.
   */
  private orderTranslucent(): void {
    if (this.levels.pending) {
      const start = performance.now();
      this.levels.update(this.orderKeyOf, this.elementOf);
      this.stats.lastLevelsMs = performance.now() - start;
      this.stats.translucentLevels = this.levels.count;
    }
    const { subBits } = this.depth;
    const batches = [...this.passBatches("translucent")];
    const stamp = (): number[] => [subBits, this.levels.revision, ...batches.map((batch) => batch.ranges.revision)];
    if (sameNumbers(stamp(), this.orderStamp)) return;
    const start = performance.now();
    const layout = (): number[] => batches.map((batch) => batch.ranges.layoutRevision);
    this.translucentRuns = orderTranslucent(
      batches.map((batch) => ({ instances: batch.ranges, companion: batch.companion?.ranges })),
      this.levelOf,
      this.orderKeyOf,
      subBits,
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
    uniforms.scene_level = frame.level === undefined ? 0 : LEVEL_BIT[frame.level];
    uniforms.scene_subs = this.subs;
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

  /**
   * Uploads what changed in the instance data of a batch and in its companion list, each list on its own: everything
   * after a resize or removal, else its dirty range (a re-sub of glyphs: the range of their subs only). Returns the
   * larger upload of the two.
   */
  private upload(batch: TBatch): TUploadKind {
    const { companion } = batch;
    const generations = (): number => batch.buffer.generation + (companion?.buffer.generation ?? 0);
    const before = generations();
    let kind = this.uploadRanges(batch.ranges, batch.buffer);
    if (companion) {
      const companionKind = this.uploadRanges(companion.ranges, companion.buffer);
      if (UPLOAD_COST[companionKind] > UPLOAD_COST[kind]) kind = companionKind;
    }
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
        this.countUpload(data.byteLength);
      }
    } else if (upload.kind === "range") {
      // Each dirty span on its own (`instanceUploadPolicy` merged them within the byte budget).
      for (const span of upload.spans) {
        if (span.data.byteLength === 0) continue;
        buffer.write(span.data, span.byteOffset);
        this.countUpload(span.data.byteLength);
      }
    }
    return upload.kind;
  }

  /** One buffer or texture write of `bytes` in the current draw. */
  private countUpload(bytes: number): void {
    this.stats.uploads += 1;
    this.frameUploadBytes += bytes;
    this.frameUploadWrites += 1;
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
      this.countUpload(STYLE_ROW_TEXELS * this.styles.rows * TABLE_TEXEL_BYTES);
    }
    const atlasRows = this.atlas.takeDirtyRows();
    if (atlasRows) {
      // Only the rows new glyphs went to: the atlas is 4 MB, a shelf of 48 px glyphs about 130 KB.
      const { size } = this.atlas;
      const [from, to] = atlasRows;
      this.atlasTexture.writeData(this.atlas.data.subarray(from * size, to * size), {
        y: from,
        width: size,
        height: to - from,
      });
      this.countUpload((to - from) * size);
    }
  }

  private writeElementRows(from: number, to: number): void {
    const texels = TABLE_WIDTH * 4;
    this.elementTexture.writeData(this.table.data.subarray(from * texels, to * texels), {
      y: from,
      width: TABLE_WIDTH,
      height: to - from,
    });
    this.countUpload((to - from) * TABLE_WIDTH * TABLE_TEXEL_BYTES);
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
      const element = this.elements.get(id);
      if (element && !this.hiddenInScene(element)) return true;
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
