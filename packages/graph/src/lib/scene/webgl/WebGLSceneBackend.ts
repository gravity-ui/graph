import { Buffer, Texture, getAttributeInfosFromLayouts, luma } from "@luma.gl/core";
import type { BufferLayout, Device, Framebuffer, RenderPass, RenderPipelineParameters } from "@luma.gl/core";
import { DynamicBuffer, Model } from "@luma.gl/engine";
import type { ShaderPlugin } from "@luma.gl/shadertools";
import { WEBGLBuffer, WEBGLTexture, WEBGLVertexArray, webgl2Adapter, withGLParameters } from "@luma.gl/webgl";
import { untracked, effect as watch } from "@preact/signals-core";

import {
  isConnectionEffectActive,
  toConnectionEffect,
} from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import { dashFlow, pulse } from "../../../components/canvas/connections/effects/library";
import type { TConnectionEffectScaleRange, TUniformTypes } from "../../../components/canvas/connections/effects/types";
import { turnedPolylineStrokes } from "../../../components/canvas/connections/geometry/utils/polylineStroke";
import { CURVE_CHORDS, INSTANCE_FLOATS, scaleBucket } from "../../../components/canvas/connections/webgl/encode";
import { createCurveTemplate, createLineTemplate } from "../../../components/canvas/connections/webgl/shaders";
import type { TSceneLevel } from "../../../services/scene/types";
import { track } from "../../../utils/functions/track";
import type { TTileRect } from "../../culling/TileIndex";
import type { SceneStore } from "../SceneStore";
import { LEVEL_BIT, isOnLevel } from "../levels";
import { bakeElementStyle, connectionEffectId, styleOpacity } from "../style";
import { DEFAULT_TEXT_POLICY, isLayoutValid, layoutText, resolveTextSize } from "../textLayout";
import type { TTextLayout } from "../textLayout";
import { peekSceneTextLayout, sceneTextLayout, sceneTextMetrics } from "../textMetrics";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle, TSceneTextPolicy } from "../types";
import { readColorRgba } from "../utils/colorAlpha";

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
import { TranslucentRefinement, coalesceTranslucentRuns, translucentRunOwners } from "./coalesceTranslucent";
import { canCoarsenCurves, createCurveBins, partitionCurves } from "./curveTessellation";
import { SCENE_DEPTH, SceneDepth, movesInDepth } from "./depth";
import { PATH_ELEMENT_FLOATS, createPathScratch, encodePaths } from "./encodePaths";
import {
  NO_LIMIT,
  RECT_FLOATS,
  checkSub,
  encodeRects,
  hasStrokeWidth,
  isTranslucentPaint,
  scaleBound,
} from "./encodeRects";
import { GLYPH_FLOATS, GLYPH_SUB_FLOATS, encodeText, isTranslucentText, writeTextGlyphs } from "./encodeText";
import type { TTextEncodeInput, TTextGlyphPlaces } from "./encodeText";
import { TRIANGLE_FLOATS, encodeTriangles, isFilledTriangle } from "./encodeTriangles";
import { GlyphAtlas, glyphRun } from "./glyphs";
import { InstanceVisibility, OpaqueVisibility } from "./instanceVisibility";
import { CachedGeometryBounds, MIN_CAMERA_SCALE, geometryBounds } from "./levelBounds";
import { firstOverlappingOwnerRange, updateMixedOwnerRanges } from "./mixedOwnerRanges";
import type { TMixedOwnerRange, TMixedOwnerSnapshot } from "./mixedOwnerRanges";
import {
  MIXED_PATH_MAX_SOURCES,
  MIXED_PATH_SOURCE_STRIDE,
  MixedStockDepthBands,
  canonicalizeMixedSources,
  fullySubpixelPaths,
  isSplitPathSource,
  mixedPathSchedule,
  mixedSourceCounts,
  separatedConnectionDepths,
} from "./mixedPathPlan";
import type { TLowerPathCommand, TMixedPathRange, TNativePathRange, TSubpixelPathWidth } from "./mixedPathPlan";
import { resizeMixedPlan } from "./mixedPlanResize";
import { createMultisampleTarget } from "./multisampleTarget";
import { TranslucentLevels } from "./overlapLevels";
import { OverviewCurveGroups, overviewCamera } from "./overviewCurves";
import { PathCulling } from "./pathCulling";
import { PathDrawIds } from "./pathDrawIds";
import type { TPathDrawGroups, TPathDrawSpan } from "./pathDrawIds";
import { appendPathPlanInputs, pathPlanResizes, visiblePathResize } from "./pathPlanInputs";
import type { TMixedResize, TPathPlanInput } from "./pathPlanInputs";
import { PATH_RECORD_TEXELS, pathRecordWrites } from "./pathRecords";
import { PreparedTranslucentDraws } from "./preparedTranslucentDraws";
import {
  ALPHA_FRAGMENT,
  ALPHA_VERTEX,
  GLYPH_ATTRIBUTES,
  GLYPH_FRAGMENT,
  GLYPH_SUB_ATTRIBUTE,
  GLYPH_VERTEX,
  MIXED_COMPOSITE_FRAGMENT,
  MIXED_COMPOSITE_VERTEX,
  MIXED_PATH_FRAGMENT,
  PATH_FRAGMENT,
  PATH_VERTEX,
  QUAD_TEMPLATE,
  RECT_ATTRIBUTES,
  RECT_FRAGMENT,
  RECT_VERTEX,
  SAMPLE_PATH_FRAGMENT,
  SAMPLE_PATH_VERTEX,
  STOCK_PATH_FRAGMENT,
  TRIANGLE_ATTRIBUTES,
  TRIANGLE_FRAGMENT,
  TRIANGLE_VERTEX,
  createMixedPathVertex,
  createPathPlugin,
  createStockPathPlugin,
} from "./shaders";
import {
  SAMPLE_SPRITE,
  SPRITE_ATTRIBUTES,
  SPRITE_FLOATS,
  SPRITE_VERTEX,
  appendSprite,
  spriteFragment,
  visibleSpriteAnimation,
} from "./sprites";
import type { TSprite } from "./sprites";
import { StockCommandGroups } from "./stockCommandGroups";
import { orderResidentPathDraws } from "./stockPathOrder";
import { ElementTable, STYLE_ROW_TEXELS, StyleTable, TABLE_WIDTH } from "./tables";
import { adoptTexts, planTextEncode, resubGlyphs, textsOf } from "./textEncodes";
import type { TTextEncode, TTextLayouts } from "./textEncodes";
import { TextRelayout } from "./textRelayout";
import type { ITextRelayoutHost } from "./textRelayout";
import { createTinySdfGenerator } from "./tinySdfGlyphs";
import { SUB_FLOAT, elementSteps, orderTranslucentChunks, splitSteps } from "./translucentOrder";
import type { TElementSubs, TTranslucentOrderCache, TTranslucentPart, TTranslucentRun } from "./translucentOrder";
import { TranslucentVisibility } from "./translucentVisibility";

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
 * so each range lies at the same instance offset in both lists):
 * - `"elements"` (paths): each instance's element data, `PATH_ELEMENT_FLOATS` (element index, sub, part slot, scale
 *   bounds, level mask), uploaded together with the path payload to the record texture;
 * - `"subs"` (glyphs): each instance's sub, one float (`TEncodedGlyphs.subs`), so that a re-sub of unchanged texts
 *   writes and uploads this buffer only.
 */
type TCompanion = { kind: "elements" | "subs"; ranges: InstanceRanges; buffer?: DynamicBuffer };

/** Paths keep one GPU copy of their payload and companion; the instance buffer holds only ordered addresses. */
type TPathRecords = { texture: Texture; ids: PathDrawIds; overview?: OverviewCurveGroups };

/** The float of a companion instance that holds the primitive's sub. */
const COMPANION_SUB_FLOAT: Record<TCompanion["kind"], number> = { elements: SUB_FLOAT, subs: 0 };

/** Per-element instances of one program and pass, their GPU buffer and the model that draws them. */
type TBatch = {
  opaqueVisibility?: OpaqueVisibility;
  ranges: InstanceRanges;
  buffer: DynamicBuffer;
  /** Path and glyph batches: the companion list of the instances (`TCompanion`), kept in step with `ranges`. */
  companion?: TCompanion;
  pathRecords?: TPathRecords;
  model: Model;
  /** Depth-writing custom effects need a plain program while inactive, sharing the same resident storage. */
  plain?: TInstancePointerTarget;
  /** An opaque glyph view after fade-in, sharing this batch's storage; only its model and VAO are owned separately. */
  revealed?: TBatch;
  animated?: boolean;
  spriteTexture?: Texture;
  spriteAnimated?: boolean;
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
  /** Curve batches keep conservative bounds of contiguous resident instances. */
  culling?: PathCulling;
  /** Small culled gaps can cost less to submit than an additional draw. */
  /** Plain opaque pieces certified for this template at the coarse device scale. */
  curveChords?: 8;
  /** Translucent path storage keeps its initial packing after the first upload. */
  retainRanges?: boolean;
};

/** Physical instance offsets until gathering; path commands then address their compact ID stream. */
type TDraw = { batch: TBatch; first: number; count: number; curveDetail?: number };
/** Only when an active effect sets fragment depth: retain native union draws so a later piece can reclaim its samples. */
type TCustomDepth = { opaque: readonly TDraw[]; unions: TDraw[]; withUnions: boolean };
const MIXED_EFFECT_PROGRAMS = new Set([toConnectionEffect(dashFlow).programKey, toConnectionEffect(pulse).programKey]);
const PULSE_PROGRAM = toConnectionEffect(pulse).programKey;
// The extra pass pays off on the measured large fit views. At around 600k vertices the shared pass wins.
const MIN_MIXED_CONNECTION_VERTICES = 1_500_000;

type TMixedSource = { records: TPathRecords; chords: number; group: TPathGroup; tie: number };
type TMixedPathWork = {
  stock?: TPathGroup;
  sources: TMixedSource[];
  ranges: (TMixedPathRange | TNativePathRange<TBatch>)[];
  widths: TSubpixelPathWidth;
  customEffect?: TEffect;
  customKey?: number;
};
type TMixedPage = {
  first: number;
  end: number;
  source: number;
  tie: number;
  depth: number;
  ranges: TMixedPathWork["ranges"];
  widths: TSubpixelPathWidth;
};
type TInstancePointerTarget = Pick<TBatch, "model" | "layout" | "instanceBuffers" | "pointers" | "pointedAt">;
type TMixedPlan = {
  effect?: TEffect;
  effectUniforms?: TUniforms;
  sources: TMixedSource[];
  spans: TPathDrawSpan[];
  commands: TLowerPathCommand<TBatch>[];
  widths: TSubpixelPathWidth;
  upperOpaque: TDraw[];
  upperTranslucent: TDraw[];
  nativeOnlyPaint: TDraw[];
  sourceCounts: number[];
};
type TMixedDraw = TInstancePointerTarget & {
  programKey: string;
  uniforms: TUniforms;
  buffer: DynamicBuffer;
  ids: PathDrawIds;
  splitSources?: number;
};
type TPreparedMixed = { plan: TMixedPlan; draw: TMixedDraw; target: Framebuffer; upload: TUploadKind };
type TStockPlan = Pick<TMixedPlan, "sources" | "spans" | "commands"> & {
  spanGroups?: TPathDrawGroups;
  lineRange?: TPathDrawSpan;
};
type TPreparedStock = { plan: TStockPlan; draw: TMixedDraw; upload: TUploadKind; lineRange?: TPathDrawSpan };

function stockGroup(group: TPathGroup | undefined): boolean {
  return Boolean(
    group &&
      !group.strokeUnion &&
      !group.fallback &&
      (!group.effect || (group.effect.extraWidth === 0 && MIXED_EFFECT_PROGRAMS.has(group.effect.programKey)))
  );
}

/** In the shared pass an inactive custom effect already draws as a plain stroke. */
function nativeStockGroup(group: TPathGroup | undefined): boolean {
  return stockGroup(group) || Boolean(group?.effect && !group.fallback && !group.effectActive);
}

function hasEffectDepthWrites(effect?: TEffect): boolean {
  return /\bgl_FragDepth\b/.test(effect?.fragment ?? "");
}

function sameDraws(left: readonly TDraw[], right: readonly TDraw[]): boolean {
  return (
    left.length === right.length &&
    left.every((draw, index) => {
      const other = right[index];
      return (
        draw.batch === other.batch &&
        draw.first === other.first &&
        draw.count === other.count &&
        draw.curveDetail === other.curveDetail
      );
    })
  );
}

/**
 * An element's translucent instances of one program, before they are cut into steps, and their companion data when the
 * batch keeps a companion list. Arrays of their own, never an encode's view (`TInstanceView`): `translucentWrites`
 * keeps them past later encodes.
 */
type TTranslucentWrite = { batch: TBatch; instances: Float32Array; companion?: Float32Array };

/** Scale interval where the same primitives participate in the overlap pass, with a conservative stroke extent. */
type TOverlapScope = { from: number; to: number; minScale: number; dpr: number; level?: TSceneLevel };

function withinOverlapScope(scope: TOverlapScope, scale: number, level: TSceneLevel | undefined, dpr: number): boolean {
  return scale >= scope.from && scale < scope.to && scope.level === level && scope.dpr === dpr;
}

function containsBox(outer: TTileRect, inner: TTileRect): boolean {
  return inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;
}

/** An element's translucent glyphs and their subs (`TEncodedGlyphs`). */
type TTranslucentGlyphs = { instances: Float32Array; subs: Float32Array };

/** The paths of one pass and one effect instance: a batch per vertex template. */
type TPathGroup = TConnectionEffectScaleRange & {
  pass: TPass;
  strokeUnion?: boolean;
  writesDepth?: boolean;
  programKey?: string;
  effect: TEffect | undefined;
  effectActive: boolean;
  users: number;
  stopUniforms?: () => void;
  /** The effect does not compile or link: the group draws the plain stroke and never takes the effect up. */
  fallback: boolean;
  lines: TBatch;
  curves: TBatch;
  coarseCurves?: TBatch;
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
 * A program using the shared quad template: shaders, buffers (template, instances), floats per instance, tables read,
 * and the kind, buffer layout and floats per instance of its companion list, if it keeps one.
 */
type TQuadProgram = {
  vs: string;
  fs: string;
  layout: readonly [BufferLayout, BufferLayout];
  floats: number;
  vertexCount?: number;
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

const TRIANGLE_PROGRAM: TQuadProgram = {
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
    name: "graph_recordId",
    stepMode: "instance",
    byteStride: FLOAT_BYTES,
    format: "float32",
  },
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
    batch.ranges.set(id, instances, Boolean(batch.pathRecords));
    if (batch.companion) {
      const data = companionData(batch, batch.companion, instances, companion);
      batch.companion.ranges.set(id, data, batch.companion.kind === "elements");
    }
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

/** Geometry of the translucent pass. A text can emit new glyphs on relayout without changing its primitive. */
function translucentPrimitives(
  primitives: readonly TScenePrimitive[],
  sources: readonly TElementSubs[],
  subBase: number
): readonly TScenePrimitive[] {
  if (primitives.length <= 1) return primitives;
  const emitted = new Set<number>();
  for (const { subs, floats, subFloat = SUB_FLOAT } of sources) {
    for (let at = subFloat; at < subs.length; at += floats) {
      const index = subs[at] - subBase;
      if (!Number.isInteger(index) || index < 0 || index >= primitives.length) return primitives;
      emitted.add(index);
    }
  }
  return emitted.size === primitives.length
    ? primitives
    : primitives.filter(
        (primitive, index) => emitted.has(index) || (primitive.kind === "text" && isTranslucentText(primitive))
      );
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Unsupported primitives, including polygons beyond the filled arrow triangles. */
function classifyPrimitives(primitives: readonly TScenePrimitive[]) {
  const counts = { polygon: 0, icon: 0, sprites: false };
  for (const primitive of primitives) {
    if (primitive.kind === "polygon" && !isFilledTriangle(primitive)) counts.polygon++;
    else if (primitive.kind === "icon") counts.icon++;
    else if (primitive.kind === "sprite") counts.sprites = true;
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
  /** Unsupported primitives per element. Summed in `stats.skipped`. */
  private readonly skippedOf = new Map<string, { polygon: number; icon: number }>();
  /** An active animated path survived this frame's spatial and semantic visibility checks. */
  private frameAnimated = false;
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
  private readonly translucentIds = new Set<string>();
  /** Effects have screen-space halos and often different shapes by level. Ordinary paints keep stable overlap boxes. */
  private readonly effectOverlapPrimitives = new Map<string, readonly TScenePrimitive[]>();
  private readonly overlapDirty = new Set<string>();
  private overlapLimits?: { minScale: number; dpr: number };
  private overlapStyles: readonly TSceneStyle[] = [];
  private readonly overlapGeometry = new Map<
    string,
    { primitives: readonly TScenePrimitive[]; geometry: CachedGeometryBounds }
  >();
  /** Above the measured large-upload range, camera changes must not repack the resident lists. */
  private scheduleRevision = 0;
  /** External shader visibility inputs; geometry and numeric painter keys do not change these predicates. */
  private visibilityStateRevision = 0;
  private opaqueOwnerRevision = 0;
  private readonly visibilityOwners = new Set<string>();
  private mixedRootsSeparated?: boolean;
  private readonly mixedResizes: TMixedResize<TBatch>[] = [];
  private mixedOwnershipRevision = 0;
  private readonly mixedBands = new MixedStockDepthBands<TBatch>();
  private readonly mixedPages = new WeakMap<object, TMixedPage>();
  private readonly mixedOwnedRanges = new WeakMap<TBatch, TMixedOwnerSnapshot>();
  private mixedPlan?: {
    layouts: number[];
    opaque: readonly TDraw[];
    translucent: readonly TDraw[];
    plan?: TMixedPlan;
  };
  private mixedDraw?: TMixedDraw;
  private stockDraw?: TMixedDraw;
  private stockPlan?: { revision: number; activity: number; draws: readonly TDraw[]; plan?: TStockPlan };
  private readonly stockCommands = new StockCommandGroups<TBatch, Omit<TMixedSource, "tie">>();
  private readonly stockSources = new WeakMap<TBatch, Map<number, Omit<TMixedSource, "tie">>>();
  private stockActivityRevision = 0;
  private stockOrder?: { stamp: number[]; physical: readonly TDraw[]; ordered: readonly TDraw[] };
  private readonly stockPhysicalDraws: TDraw[] = [];
  private overviewFrame = false;
  private readonly pathBatchGroups = new WeakMap<TBatch, TPathGroup>();
  private readonly mixedDisabled = new Set<string>();
  private readonly defaultMultisampled: boolean;
  private multisampleTarget?: { width: number; height: number; target: ReturnType<typeof createMultisampleTarget> };
  private mixedTarget?: Framebuffer;
  private mixedComposite?: Model;
  private mixedTextureUnits?: number;
  private mixedTextureLimit?: number;
  // Frame commands are mutable scratch; cached mixed plans keep their own physical-range copies.
  private readonly frameDrawPool: TDraw[] = [];
  private frameDrawCount = 0;
  private readonly opaqueFrameDraws: TDraw[] = [];
  private readonly translucentFrameDraws: TDraw[] = [];
  private cullingDrawCount = 0;
  private readonly gatheredDraws = new Map<TBatch, { draws: TDraw[]; count: number }>();
  private cullingBatch?: TBatch;
  private cullingDraws: TDraw[] = [];
  private readonly cullingOptions: { curveChords?: 8 } = {};
  private readonly appendCulledRange = (first: number, count: number, curveDetail?: number): void => {
    const batch = this.cullingBatch;
    if (!batch) return;
    this.cullingDraws[this.cullingDrawCount++] = this.frameDraw(batch, first, count, curveDetail);
    if (!this.frameAnimated && batch.animated && (this.visibility.get(batch)?.any(first, count) ?? true))
      this.frameAnimated = true;
  };
  private readonly visibility = new WeakMap<TBatch, InstanceVisibility>();
  private activeStamp: number[] = [];
  private activeInput?: readonly TTranslucentPart[];
  private readonly translucentVisibility = new TranslucentVisibility();
  private activeGroups: readonly (readonly TTranslucentRun[])[] = [];
  private readonly preparedGroups = new PreparedTranslucentDraws<TBatch>();
  private readonly groupVertexCounts = new WeakMap<readonly TDraw[], number>();
  private activeOwners: ReturnType<typeof translucentRunOwners> = [];
  private coalesceScope?: TOverlapScope & { clip: TTileRect };
  private coalesceRevision = -1;
  private coalescedRuns: TTranslucentRun[] = [];
  private readonly translucentRefinement = new TranslucentRefinement();
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

  private readonly spriteImages = new Map<HTMLImageElement, { texture: Texture; batches: Map<string, TBatch> }>();
  private readonly spriteBatches = new Set<TBatch>();
  private readonly spritesOf = new Map<string, TBatch[]>();
  private readonly rejectedSpriteImages = new WeakSet<HTMLImageElement>();
  private spriteGroupsRemoved = false;
  private spriteUploadBytes = 0;
  private spriteUploadWrites = 0;
  private readonly rects: Record<TPass, TBatch>;
  private readonly triangles: Record<TPass, TBatch>;
  private readonly glyphs: Record<TPass, TBatch>;
  /** The subs of the opaque glyphs: a re-sub rewrites them only (`encodeGlyphs`). */
  private readonly glyphSubs: TCompanion;
  private readonly pathGroups = new Map<string, TPathGroup>();
  /** One unused group per shader source, with its buffers and program but without an effect or subscriptions. */
  private readonly idlePathGroups = new Map<string, TPathGroup>();
  private nextPathGroupId = 0;
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
  private translucentParts: readonly TTranslucentPart[] = [];
  private translucentOrderCache: TTranslucentOrderCache = {};

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
    createdAt: number,
    private readonly events: TSceneBackendEvents
  ) {
    this.defaultMultisampled = gl.getParameter(gl.SAMPLES) > 1;
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
    this.triangles = {
      opaque: this.createBatch("triangle-opaque", TRIANGLE_PROGRAM, "opaque"),
      translucent: this.createBatch("triangle-translucent", TRIANGLE_PROGRAM, "translucent"),
    };
    this.glyphs = {
      opaque: this.createBatch("glyph-opaque", GLYPH_PROGRAM, "opaque"),
      translucent: this.createBatch("glyph-translucent", GLYPH_PROGRAM, "translucent"),
    };
    this.glyphs.translucent.revealed = this.createRevealedGlyphs(this.glyphs.translucent);
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
    for (const model of [
      this.alphaModel,
      ...[...this.allBatches()].flatMap((batch) =>
        batch.revealed ? [batch.model, batch.revealed.model] : [batch.model]
      ),
    ]) {
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
    this.releaseUnusedPathGroups();
    if (this.spriteGroupsRemoved) this.releaseUnusedSprites();
    this.stats.lastReplayMs = performance.now() - start;
  }

  public applyMany(changes: readonly TSceneChange[], text?: TSceneTextFrame): void {
    const start = performance.now();
    if (text) this.textFrame = text;
    // Replacing many owners is cheaper to plan once than to certify their individual record rewrites.
    if (changes.length > 64 && changes.some((change) => change.fields?.has("primitives"))) this.invalidatePathPlans();
    // The elements the frame deletes or moves give up their depth places before any element takes one: the frame then
    // fits the depth limits whenever its changes one by one did, whatever the order of different elements' changes.
    for (const change of changes) {
      if (change.type === "delete" || movesInDepth(change)) this.depth.release(change.element.id);
    }
    for (const change of changes) this.applyChange(change);
    this.rebaseChildren();
    this.flushDepth();
    this.releaseUnusedPathGroups();
    if (this.spriteGroupsRemoved) this.releaseUnusedSprites();
    this.stats.lastApplyMs = performance.now() - start;
  }

  public setStyles(styles: readonly TSceneStyle[]): void {
    this.overlapStyles = styles;
    const previous = this.styles.hiddenParts;
    const previousOrder = this.styles.orderHiddenParts;
    this.styles.setStyles(styles);
    const next = this.styles.hiddenParts;
    const order = this.styles.orderHiddenParts;
    let visibilityChanged = false;
    const changedOrder = new Set<number>();
    for (let row = 0; row < Math.max(previous.length, next.length); row++) {
      if ((previous[row] ?? 0) !== (next[row] ?? 0)) visibilityChanged = true;
      if ((previousOrder[row] ?? 0) !== (order[row] ?? 0)) changedOrder.add(row);
    }
    if (visibilityChanged) {
      this.invalidatePathPlans();
      this.scheduleRevision++;
      this.visibilityStateRevision++;
    }
    if (changedOrder.size) {
      for (const id of this.effectOverlapPrimitives.keys()) {
        const element = this.elements.get(id);
        if (element && changedOrder.has(element.styleId)) this.overlapDirty.add(id);
      }
    }
  }

  public draw(frame: TSceneFrame): boolean {
    if (this.disposed) return false;
    if (this.gl.isContextLost()) {
      // The native event may still be queued when a caller explicitly flushes a frame.
      this.objectsLost = true;
      this.events.onLost();
      return false;
    }
    const start = performance.now();
    this.frameUploadBytes = this.spriteUploadBytes;
    this.frameUploadWrites = this.spriteUploadWrites;
    this.spriteUploadBytes = this.spriteUploadWrites = 0;
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
    if (this.visibilityOwners.size) {
      this.opaqueOwnerRevision++;
      for (const batch of this.allBatches()) {
        const visibility = this.visibility.get(batch);
        if (!visibility) continue;
        const ranges = batch.companion?.kind === "elements" ? batch.companion.ranges : batch.ranges;
        for (const id of this.visibilityOwners) visibility.invalidateOwner(ranges, id);
      }
      this.visibilityOwners.clear();
    }
    // Resident paths never sort: upload their local changes and prepare exact visibility before building buckets.
    let uploadKind = this.uploadPaths(frame);
    let hasStrokeUnion = false;
    let hasCustomDepth = false;
    for (const group of this.pathGroups.values()) {
      this.setEffectUniforms(group, frame.scale);
      hasStrokeUnion ||= Boolean(group.strokeUnion && group.users);
      hasCustomDepth ||= Boolean(group.writesDepth && group.effectActive);
    }
    this.overviewFrame = this.useOverviewCurves(frame);
    this.frameAnimated = false;
    this.frameDrawCount = 0;
    const stockOrder = this.orderedStockPaths(frame);
    if (!stockOrder) {
      this.refreshOverlapBounds(frame);
      this.orderTranslucent();
    }
    // Dense non-path lists may still have moved during ordering.
    for (const batch of this.allBatches()) {
      if (batch.pathRecords) continue;
      const kind = this.upload(batch);
      if (UPLOAD_COST[kind] > UPLOAD_COST[uploadKind]) uploadKind = kind;
    }
    const opaqueDraws = this.opaqueFrameDraws;
    let translucentDraws = this.translucentFrameDraws;
    let directTranslucent = false;
    this.cullingDrawCount = 0;
    for (const batch of this.passBatches("opaque")) {
      if (!batch.pathRecords && batch.ranges.count) {
        batch.opaqueVisibility ??= new OpaqueVisibility(
          batch.companion?.kind === "subs" ? "glyph" : batch.ranges.floats === TRIANGLE_FLOATS ? "triangle" : "rect"
        );
        const stateRevision = this.opaqueOwnerRevision + this.visibilityStateRevision;
        if (!batch.opaqueVisibility.any(batch.ranges, this.table.data, this.styles.data, frame, stateRevision))
          continue;
      }
      this.appendVisibleDraws(opaqueDraws, batch, frame, 0, batch.ranges.count);
    }
    opaqueDraws.length = this.cullingDrawCount;
    this.cullingDrawCount = 0;
    if (stockOrder) {
      // A graph replacement can leave this renderer on the stock-only path for its remaining lifetime.
      if (this.translucentBatches.length > 0) this.clearTranslucentCommands();
      for (const draw of stockOrder)
        translucentDraws[this.cullingDrawCount++] = this.frameDraw(
          draw.batch,
          draw.first,
          draw.count,
          draw.curveDetail
        );
      translucentDraws.length = this.cullingDrawCount;
    } else {
      const runs = this.visibleTranslucentRuns(frame);
      if (runs) {
        for (const run of runs) {
          this.appendVisibleDraws(translucentDraws, this.translucentBatches[run.source], frame, run.first, run.count);
        }
        translucentDraws.length = this.cullingDrawCount;
      } else {
        directTranslucent = true;
        translucentDraws = this.preparedGroupDraws(frame);
      }
    }
    this.cullingBatch = undefined;
    const mixed = this.prepareMixedPlane(frame, opaqueDraws, translucentDraws);
    const nativeRuns: TDraw[][] = [];
    for (const command of mixed?.plan.commands ?? []) {
      // Individual passes prevent gather's local merging from crossing a stock window.
      if (command.native) nativeRuns.push([this.frameDraw(command.native, command.first, command.count)]);
    }
    const upperOpaque = mixed
      ? mixed.plan.upperOpaque.map((draw) => this.frameDraw(draw.batch, draw.first, draw.count, draw.curveDetail))
      : opaqueDraws;
    let upperTranslucent = mixed
      ? mixed.plan.upperTranslucent.map((draw) => this.frameDraw(draw.batch, draw.first, draw.count, draw.curveDetail))
      : translucentDraws;
    const grouped = !mixed && translucentDraws !== this.translucentFrameDraws;
    const stock = this.prepareStockPaths(upperTranslucent, grouped ? this.preparedGroups.ordered : undefined);
    const stockNativeRuns: TDraw[][] = [];
    for (const command of stock?.plan.commands ?? []) {
      if (command.native) stockNativeRuns.push([this.frameDraw(command.native, command.first, command.count)]);
    }
    if (grouped && !stock) {
      // The fallback gather rewrites physical path offsets in place. Keep retained commands in physical coordinates.
      upperTranslucent = this.translucentFrameDraws;
      for (let i = 0; i < translucentDraws.length; i++) {
        const draw = translucentDraws[i];
        upperTranslucent[i] = draw.batch.pathRecords
          ? this.frameDraw(draw.batch, draw.first, draw.count, draw.curveDetail)
          : draw;
      }
      upperTranslucent.length = translucentDraws.length;
    }
    this.frameDrawPool.length = this.frameDrawCount;
    const addressUpload = this.gatherPathDraws([
      ...nativeRuns,
      upperOpaque,
      ...(stock ? stockNativeRuns : [upperTranslucent]),
    ]);
    if (mixed && UPLOAD_COST[mixed.upload] > UPLOAD_COST[uploadKind]) uploadKind = mixed.upload;
    if (stock && UPLOAD_COST[stock.upload] > UPLOAD_COST[uploadKind]) uploadKind = stock.upload;
    if (UPLOAD_COST[addressUpload] > UPLOAD_COST[uploadKind]) uploadKind = addressUpload;
    this.stats.lastUploadKind = uploadKind;
    this.stats.lastUploadBytes = this.frameUploadBytes;
    this.stats.lastUploadWrites = this.frameUploadWrites;
    this.stats.uploadBytes += this.frameUploadBytes;
    this.stats.drawCalls = 0;
    this.stats.translucentDrawCalls = 0;
    this.stats.instances = 0;

    if (this.multisampleTarget && !hasStrokeUnion) {
      this.multisampleTarget.target?.destroy();
      this.multisampleTarget = undefined;
    }
    // Native stroke unions need multiple depth samples even when the browser supplies a single-sample canvas.
    const target =
      !this.defaultMultisampled &&
      hasStrokeUnion &&
      upperTranslucent.some(({ batch }) => this.pathBatchGroups.get(batch)?.strokeUnion)
        ? this.strokeTarget()
        : undefined;
    const pass = mixed
      ? this.beginMixedScene(frame, mixed, nativeRuns)
      : this.device.beginRenderPass({
          framebuffer: target?.framebuffer,
          clearColor: [0, 0, 0, 0],
          clearDepth: 0,
          clearStencil: false,
        });
    this.gl.enable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    this.drawPrepared(pass, upperOpaque, frame);
    this.gl.disable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    if (upperOpaque.length > 0) {
      pass.setParameters({ colorMask: WRITE_ALPHA });
      this.alphaModel.draw(pass);
      pass.setParameters({ colorMask: WRITE_ALL });
      this.stats.drawCalls += 1;
    }
    // Translucent primitives blend over each other in scene order wherever they overlap, across programs: level by
    // level, step by step, one instanced draw per program and range. Depth orders them against the
    // opaque pass.
    const beforeTranslucent = this.stats.drawCalls;
    const customDepth: TCustomDepth | undefined =
      hasStrokeUnion && hasCustomDepth ? { opaque: upperOpaque, unions: [], withUnions: true } : undefined;
    if (stock) this.drawStockPaths(pass, stock, stockNativeRuns, frame, customDepth);
    else this.drawPrepared(pass, upperTranslucent, frame, customDepth);
    this.stats.translucentDrawCalls += this.stats.drawCalls - beforeTranslucent;
    pass.end();
    target?.resolve();
    this.device.submit();

    if (this.frames++ === 0) this.stats.firstFrameMs = performance.now() - start;
    const refine = this.translucentRefinement.record(
      frame,
      directTranslucent ? this.stats.translucentDrawCalls : 0,
      this.stockActivityRevision
    );
    return this.frameAnimated || refine;
  }

  private strokeTarget(): ReturnType<typeof createMultisampleTarget> {
    // luma applies a pending canvas resize when its default framebuffer is acquired.
    this.device.getDefaultCanvasContext().getCurrentFramebuffer();
    const { drawingBufferWidth: width, drawingBufferHeight: height } = this.gl;
    const current = this.multisampleTarget;
    if (!current || current.width !== width || current.height !== height) {
      current?.target?.destroy();
      // A failed allocation still uses the default buffer; retry only when the requested size changes.
      this.multisampleTarget = { width, height, target: createMultisampleTarget(this.device, this.gl, width, height) };
    }
    return this.multisampleTarget?.target;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixedBands.clear();
    this.gatheredDraws.clear();
    this.frameDrawPool.length = 0;
    this.opaqueFrameDraws.length = this.translucentFrameDraws.length = 0;
    this.cullingDraws = [];
    this.cullingBatch = undefined;
    this.listeners.abort();
    for (const group of this.pathGroups.values()) group.stopUniforms?.();
    for (const batch of this.allBatches()) this.destroyBatch(batch);
    if (this.ownsObjects()) for (const { texture } of this.spriteImages.values()) texture.destroy();
    this.spriteImages.clear();
    this.spriteBatches.clear();
    this.spritesOf.clear();
    for (const group of this.idlePathGroups.values()) {
      this.destroyBatch(group.lines);
      this.destroyBatch(group.curves);
    }
    this.pathGroups.clear();
    this.idlePathGroups.clear();
    this.pathGroupsOf.clear();
    this.destroyMixedDraw();
    this.destroyStockDraw();
    this.stockPlan = undefined;
    this.stockOrder = undefined;
    this.stockPhysicalDraws.length = 0;
    this.clearTranslucentCommands();
    this.mixedComposite?.destroy();
    if (this.ownsObjects()) {
      this.multisampleTarget?.target?.destroy();
      this.mixedTarget?.destroy();
      this.mixedComposite?.vertexArray.destroy();
    }
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
    const { element, fields } = change;
    const ownershipChanged = change.type !== "update" || !fields || fields.has("parent") || fields.has("entityType");
    if (ownershipChanged) this.mixedOwnershipRevision++;
    if (ownershipChanged || fields?.has("hidden") || movesInDepth(change)) {
      this.mixedRootsSeparated = undefined;
      this.invalidatePathPlans();
    } else if (fields) {
      for (const field of fields) {
        if (field === "x" || field === "y" || field === "bounds" || field === "primitives" || field === "styleId")
          continue;
        this.invalidatePathPlans();
        break;
      }
    }
    if (change.type === "delete") {
      this.scheduleRevision++;
      this.remove(element.id);
      return;
    }
    this.elements.set(element.id, element);
    if (change.type === "add") {
      this.scheduleRevision++;
      this.addElement(element);
      return;
    }
    const changed = (field: keyof TSceneElement): boolean => fields === undefined || fields.has(field);
    if (changed("parent") || changed("nestedIn")) this.visibilityStateRevision++;
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
    const hiddenChanged = changed("hidden");
    const restyled = changed("styleId");
    const write = changed("x") || changed("y") || hiddenChanged || restyled;
    const partsChanged = write && this.writeElement(element, restyled);
    if (partsChanged) this.invalidatePathPlans();
    if (!fields || fields.size !== 1 || !restyled || partsChanged) this.scheduleRevision++;
    // The store sends no update to what is nested in an element whose hidden flag changed.
    if (hiddenChanged) {
      this.visibilityOwners.add(element.id);
      this.writeChildren(element.id, true);
    }
    if (changed("bounds")) this.invalidateOverlap(element.id);
    // A translucent element that moves can start or stop overlapping others.
    const moved = changed("x") || changed("y") || changed("bounds");
    if (moved) this.levels.moved(element.id);
    if (moved || hiddenChanged) this.textsMoved(element, moved, hiddenChanged);
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
  private writeChildren(id: string, updateVisibility = false): void {
    for (const child of this.store?.childrenOf(id) ?? []) {
      if (this.elements.has(child.id)) {
        this.writeElement(child, updateVisibility);
        if (updateVisibility) this.visibilityOwners.add(child.id);
      }
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
  private writeElement(element: TSceneElement, checkParts = false): boolean {
    const masks = this.styles.hiddenParts;
    const previousStyle = checkParts ? this.table.styleOf(element.id) : element.styleId;
    const partsChanged = (masks[previousStyle] ?? 0) !== (masks[element.styleId] ?? 0);
    const key = this.depth.peekKey(this.rootIdOf(element));
    this.table.write(element.id, element.x, element.y, key, this.hiddenInScene(element), element.styleId);
    if (partsChanged) this.visibilityOwners.add(element.id);
    const order = this.styles.orderHiddenParts;
    if ((order[previousStyle] ?? 0) !== (order[element.styleId] ?? 0)) this.invalidateOverlap(element.id);
    return partsChanged;
  }

  private remove(id: string): void {
    const parent = this.elements.get(id)?.parent;
    if (parent !== undefined) {
      this.subBases.delete(id);
      // The siblings after it move down.
      if (this.elements.has(parent)) this.rebase.add(parent);
    }
    for (const batch of this.allBatches()) removeInstances(batch, id);
    for (const group of this.pathGroupsOf.get(id) ?? []) group.users--;
    this.pathGroupsOf.delete(id);
    if (this.spritesOf.delete(id)) this.spriteGroupsRemoved = true;
    this.setSkipped(id, { polygon: 0, icon: 0 });
    this.textEncodes.delete(id);
    this.forgetCameraTexts(id);
    this.encodedCounts.delete(id);
    this.translucentIds.delete(id);
    this.effectOverlapPrimitives.delete(id);
    this.overlapGeometry.delete(id);
    this.overlapDirty.delete(id);
    this.depth.delete(id);
    this.levels.delete(id);
    this.table.free(id);
    this.elements.delete(id);
  }

  private invalidatePathPlans(): void {
    this.mixedPlan = undefined;
    this.stockOrder = undefined;
    this.mixedResizes.length = 0;
  }

  private clearTranslucentCommands(): void {
    this.translucentOrderCache = {};
    this.translucentParts = [];
    this.translucentBatches = [];
    this.orderStamp = [];
    this.layoutStamp = [];
    this.clearTranslucentGroups();
  }

  private clearTranslucentGroups(): void {
    this.activeStamp = [];
    this.activeInput = undefined;
    this.translucentVisibility.clear();
    this.preparedGroups.clear();
    this.stockCommands.clear();
    this.activeGroups = [];
    this.coalesceScope = undefined;
    this.activeOwners = [];
    this.coalescedRuns = [];
    this.translucentRefinement.clear();
  }

  private reset(): void {
    this.mixedBands.clear();
    this.overviewFrame = false;
    this.invalidatePathPlans();
    this.mixedRootsSeparated = undefined;
    this.gatheredDraws.clear();
    this.stockPlan = undefined;
    this.stockPhysicalDraws.length = 0;
    this.clearTranslucentCommands();
    this.elements.clear();
    this.spriteGroupsRemoved = this.spriteImages.size > 0;
    this.spritesOf.clear();
    for (const group of this.pathGroups.values()) group.users = 0;
    this.pathGroupsOf.clear();
    this.skippedOf.clear();
    this.stats.skipped.polygon = 0;
    this.stats.skipped.icon = 0;
    this.subBases.clear();
    this.rebase.clear();
    this.encodeLater.clear();
    this.textEncodes.clear();
    this.cameraTexts.clear();
    this.textEpochs.reset();
    this.translucentWrites.clear();
    this.encodedCounts.clear();
    this.translucentIds.clear();
    this.effectOverlapPrimitives.clear();
    this.overlapGeometry.clear();
    this.scheduleRevision++;
    this.visibilityStateRevision++;
    this.visibilityOwners.clear();
    this.overlapDirty.clear();
    this.overlapLimits = undefined;
    this.depth = new SceneDepth();
    this.levels.clear();
    this.table = new ElementTable();
    for (const batch of this.allBatches()) {
      batch.ranges = new InstanceRanges(batch.ranges.floats);
      if (batch.companion) batch.companion.ranges = new InstanceRanges(batch.companion.ranges.floats);
      if (batch.revealed) {
        batch.revealed.ranges = batch.ranges;
        batch.revealed.opaqueVisibility = new OpaqueVisibility("glyph-revealed");
      }
    }
  }

  private encodeSprites(
    id: string,
    primitives: readonly TScenePrimitive[],
    index: number,
    subBase: number,
    maxSub: number,
    style: TSceneStyle | undefined,
    writes: TTranslucentWrite[]
  ): void {
    const groups = new Map<TBatch, number[]>();
    for (let i = 0; i < primitives.length; i++) {
      const sprite = primitives[i];
      if (sprite.kind !== "sprite" || !(sprite.width > 0 && sprite.height > 0)) continue;
      const opacity = styleOpacity(style, sprite.part);
      const batch = this.spriteBatch(sprite);
      if (!batch) continue;
      const sub = subBase + i;
      checkSub(sub, maxSub);
      let instances = groups.get(batch);
      if (!instances) groups.set(batch, (instances = []));
      appendSprite(instances, sprite, index, sub, this.slotOf(sprite.part), opacity);
    }
    for (const batch of this.spritesOf.get(id) ?? []) {
      if (!groups.has(batch)) {
        removeInstances(batch, id);
        this.spriteGroupsRemoved = true;
      }
    }
    for (const [batch, instances] of groups) writes.push({ batch, instances: new Float32Array(instances) });
    if (groups.size) this.spritesOf.set(id, [...groups.keys()]);
    else this.spritesOf.delete(id);
  }

  private spriteBatch(sprite: TSprite): TBatch | undefined {
    const { image, effect } = sprite;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight || this.rejectedSpriteImages.has(image))
      return undefined;
    let source = this.spriteImages.get(image);
    if (!source) {
      const texture = this.uploadSpriteImage(image);
      if (!texture) return undefined;
      source = { texture, batches: new Map() };
      this.spriteImages.set(image, source);
    }
    const fragment = effect?.fragment ?? SAMPLE_SPRITE;
    let batch = source.batches.get(fragment);
    if (!batch) {
      const program: TQuadProgram = {
        vs: SPRITE_VERTEX,
        fs: spriteFragment(fragment),
        floats: SPRITE_FLOATS,
        textures: PATH_TEXTURES,
        layout: [
          { name: "scene_template", format: "float32x2" },
          vec4Layout("sprite_instances", SPRITE_ATTRIBUTES, SPRITE_FLOATS),
        ],
      };
      batch = this.createBatch("sprite", program, "translucent", source.texture);
      if (!isLinked(batch.model)) {
        console.error(
          "[@gravity-ui/graph] Sprite effect failed to link; using the source image.",
          compilerLog(batch.model)
        );
        this.destroyBatch(batch);
        batch = this.createBatch(
          "sprite",
          { ...program, fs: spriteFragment(SAMPLE_SPRITE) },
          "translucent",
          source.texture
        );
        batch.spriteAnimated = false;
      }
      source.batches.set(fragment, batch);
      this.spriteBatches.add(batch);
      this.clearTranslucentCommands();
    }
    if (effect?.animated && batch.spriteAnimated !== false) batch.spriteAnimated = true;
    return batch;
  }

  private uploadSpriteImage(image: HTMLImageElement): Texture | undefined {
    const { naturalWidth: width, naturalHeight: height } = image;
    let texture: Texture | undefined;
    try {
      const limit = this.device.limits.maxTextureDimension2D;
      if (Math.max(width, height) > limit)
        throw new RangeError(`Sprite ${width} × ${height} exceeds the texture limit ${limit}`);
      texture = this.device.createTexture({
        width,
        height,
        format: "rgba8unorm",
        usage: TEXTURE_USAGE,
        sampler: ATLAS_SAMPLER,
      });
      texture.copyExternalImage({ image, flipY: false, premultipliedAlpha: false });
    } catch (error) {
      texture?.destroy();
      this.rejectedSpriteImages.add(image);
      console.warn("[@gravity-ui/graph] Could not upload the scene sprite image.", error);
      return undefined;
    }
    this.spriteUploadBytes += width * height * 4;
    this.spriteUploadWrites++;
    return texture;
  }

  private releaseUnusedSprites(): void {
    this.spriteGroupsRemoved = false;
    for (const [image, source] of this.spriteImages) {
      for (const [fragment, batch] of source.batches) {
        if (batch.ranges.liveCount) continue;
        this.destroyBatch(batch);
        this.spriteBatches.delete(batch);
        source.batches.delete(fragment);
        this.clearTranslucentCommands();
      }
      if (!source.batches.size) {
        if (this.ownsObjects()) source.texture.destroy();
        this.spriteImages.delete(image);
      }
    }
  }

  private readonly slotOf = (part: string | undefined): number => this.styles.slotOf(part);

  private readonly pathScratch = createPathScratch();
  private readonly curveScratch = createCurveBins();

  /**
   * Encodes the element's primitives with the element properties of its style baked in (widths, circle scale,
   * translucent colours, opacity: a faded primitive gets all its colours baked, faded); the other opaque colours and
   * visibility stay in the style table. Instances with a baked alpha below 1 go to the translucent pass. A child
   * element's subs start at its sub base, after its parent's and its earlier siblings' primitives.
   */
  private encode(element: TSceneElement): void {
    const start = performance.now();
    const { id } = element;
    const before = this.mixedPlan || this.stockOrder ? this.pathInputsOf(id) : undefined;
    const primitives = bakeElementStyle(element.primitives, this.styleOf(element));
    const index = this.table.indexOf(id);
    const subBase = this.subBases.get(id) ?? 0;
    const { maxSub } = this.depth;
    const rects = encodeRects(primitives, index, this.slotOf, subBase, maxSub);
    // The opaque rects are a view of the encoder's list (`TInstanceView`): written before any other encode runs.
    setInstances(this.rects.opaque, id, rects.opaque);
    const triangles = encodeTriangles(primitives, index, this.slotOf, subBase, maxSub);
    setInstances(this.triangles.opaque, id, triangles.opaque);
    const glyphs = this.encodeGlyphs(id, primitives, index, subBase, maxSub);
    const translucent = this.encodePathsOf(id, primitives, index, subBase, maxSub);
    translucent.push(
      { batch: this.rects.translucent, instances: rects.translucent },
      { batch: this.triangles.translucent, instances: triangles.translucent },
      { batch: this.glyphs.translucent, instances: glyphs.instances, companion: glyphs.subs }
    );
    const classified = classifyPrimitives(primitives);
    if (classified.sprites || (this.spritesOf.size && this.spritesOf.has(id))) {
      this.encodeSprites(id, primitives, index, subBase, maxSub, this.styleOf(element), translucent);
    }
    this.setTranslucent(id, primitives, translucent);
    if (before) {
      const edits = pathPlanResizes(before, this.pathInputsOf(id));
      if (!edits || edits.some((edit) => this.mixedResizes.some((previous) => previous.batch === edit.batch))) {
        this.invalidatePathPlans();
      } else if (this.mixedPlan) {
        this.mixedResizes.push(...edits);
      }
    }
    this.setSkipped(id, classified);
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
   * Writes an element's translucent instances of every translucent program and their companion data, cut into its
   * local steps: a new step at each change of program
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
      this.translucentIds.add(id);
      const hasEffects = primitives.some((primitive) => primitive.kind === "path" && primitive.effect);
      if (this.overlapGeometry.get(id)?.primitives !== primitives) {
        const paint = hasEffects ? translucentPrimitives(primitives, subs, this.subBases.get(id) ?? 0) : primitives;
        this.overlapGeometry.set(id, { primitives, geometry: new CachedGeometryBounds(paint) });
        if (hasEffects) this.effectOverlapPrimitives.set(id, paint);
      }
      if (hasEffects) {
        this.overlapDirty.add(id);
      } else {
        this.effectOverlapPrimitives.delete(id);
        this.overlapDirty.delete(id);
        this.levels.set(id, geometryBounds(primitives));
      }
    } else {
      this.levels.delete(id);
      this.overlapGeometry.delete(id);
      this.translucentIds.delete(id);
      this.effectOverlapPrimitives.delete(id);
      this.overlapDirty.delete(id);
    }
    // A glyph re-encode of a camera-aware text re-cuts the steps with them (`relayoutTexts`).
    if (present.length > 0 && this.cameraTexts.has(id)) this.translucentWrites.set(id, writes);
    else this.translucentWrites.delete(id);
  }

  private pathInputsOf(id: string): TPathPlanInput<TBatch>[] {
    const inputs: TPathPlanInput<TBatch>[] = [];
    for (const group of this.pathGroupsOf.get(id) ?? []) {
      const opaque = group.pass === "opaque";
      appendPathPlanInputs(inputs, group.lines, id, opaque);
      appendPathPlanInputs(inputs, group.curves, id, opaque);
      if (group.coarseCurves) appendPathPlanInputs(inputs, group.coarseCurves, id, opaque);
    }
    return inputs;
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
      return [];
    }
    const groupOfSub = primitives.map((primitive) =>
      primitive.kind === "path" && hasStrokeWidth(primitive.stroke) ? this.pathGroupOf(primitive) : undefined
    );
    const groups = new Set<TPathGroup>();
    for (const group of groupOfSub) if (group) groups.add(group);
    const previous = this.pathGroupsOf.get(id);
    const translucent: TTranslucentWrite[] = [];
    for (const group of groups) {
      if (!previous?.has(group)) group.users++;
      const select = (_: TScenePrimitive, sub: number): boolean => groupOfSub[sub] === group;
      const overview =
        this.elements.get(id)?.entityType === "connection" &&
        !group.fallback &&
        (!group.effect || (MIXED_EFFECT_PROGRAMS.has(group.effect.programKey) && (group.minScale ?? 0) > 0));
      const encoded = encodePaths(primitives, index, PATH_BUCKET, this.slotOf, select, subBase, maxSub, {
        scratch: this.pathScratch,
        retain: group.pass === "translucent",
        overviewChords: overview ? (group.coarseCurves ? 8 : 16) : undefined,
      });
      if (encoded.hasOverview) {
        for (const batch of [group.curves, group.coarseCurves]) {
          if (batch?.pathRecords)
            batch.pathRecords.overview ??= new OverviewCurveGroups(batch === group.coarseCurves ? 2 : 4);
        }
      }
      if (group.pass === "translucent") {
        translucent.push(
          { batch: group.lines, instances: encoded.lines, companion: encoded.lineElements },
          { batch: group.curves, instances: encoded.curves, companion: encoded.curveElements }
        );
      } else {
        setInstances(group.lines, id, encoded.lines, encoded.lineElements);
        if (group.coarseCurves) {
          const batches = [group.coarseCurves, group.curves];
          partitionCurves(this.curveScratch, encoded.curves, encoded.curveElements);
          this.curveScratch.forEach((bin, i) =>
            setInstances(
              batches[i],
              id,
              bin.paths.subarray(0, bin.count * INSTANCE_FLOATS),
              bin.elements.subarray(0, bin.count * PATH_ELEMENT_FLOATS)
            )
          );
        } else {
          setInstances(group.curves, id, encoded.curves, encoded.curveElements);
        }
      }
    }
    for (const group of previous ?? []) {
      if (groups.has(group)) continue;
      group.users--;
      removeInstances(group.lines, id);
      removeInstances(group.curves, id);
      if (group.coarseCurves) removeInstances(group.coarseCurves, id);
    }
    if (groups.size > 0) this.pathGroupsOf.set(id, groups);
    else this.pathGroupsOf.delete(id);
    return translucent;
  }

  /**
   * Effects may draw any alpha, so their paths join the translucent pass; plain ones go by the stroke alpha. An unset
   * stroke colour takes the base colour from the style table, which is opaque or none: it stays opaque.
   */
  private pathGroupOf(primitive: TPathPrimitive): TPathGroup {
    const effect = primitive.effect ? toConnectionEffect(primitive.effect.effect) : undefined;
    const pass: TPass = effect || isTranslucentPaint(primitive.stroke.color) ? "translucent" : "opaque";
    const strokeUnion = !effect && pass === "translucent" && turnedPolylineStrokes.has(primitive.segments);
    return this.pathGroupFor(pass, effect, primitive.effect, strokeUnion);
  }

  private pathGroupFor(
    pass: TPass,
    effect: TEffect | undefined,
    range?: TConnectionEffectScaleRange,
    strokeUnion = false
  ): TPathGroup {
    const plainGroup = strokeUnion ? "union" : "plain";
    const key = `${pass}|${effect ? connectionEffectId(effect) : plainGroup}|${range?.minScale ?? 0}|${range?.maxScale ?? Infinity}`;
    const known = this.pathGroups.get(key);
    if (known) return known;
    const programKey = effect?.programKey;
    let group = programKey === undefined ? undefined : this.idlePathGroups.get(programKey);
    if (programKey !== undefined && group) {
      this.idlePathGroups.delete(programKey);
      // A table can have grown and replaced its texture while this group was idle.
      group.lines.model.setBindings(this.batchBindings(group.lines));
      group.curves.model.setBindings(this.batchBindings(group.curves));
      group.lines.plain?.model.setBindings(this.batchBindings(group.lines));
      group.curves.plain?.model.setBindings(this.batchBindings(group.curves));
    }
    group ??= this.createPathGroup(pass, effect, strokeUnion);
    group.effect = group.fallback ? undefined : effect;
    group.minScale = range?.minScale;
    group.maxScale = range?.maxScale;
    group.effectActive = Boolean(group.effect);
    if (group.effect) group.stopUniforms = this.watchUniforms(group);
    this.pathGroups.set(key, group);
    this.orderStamp = [];
    this.layoutStamp = [];
    return group;
  }

  private createPathGroup(pass: TPass, effect: TEffect | undefined, strokeUnion: boolean): TPathGroup {
    const id = `path-${pass}-${this.nextPathGroupId++}`;
    const programKey = effect?.programKey;
    let plugin = createPathPlugin(effect);
    let group: TPathGroup = {
      pass,
      strokeUnion,
      writesDepth: hasEffectDepthWrites(effect),
      programKey,
      effect: undefined,
      effectActive: false,
      users: 0,
      fallback: false,
      lines: this.createPathBatch(`${id}-lines`, pass, plugin, this.lineTemplate, createLineTemplate(), strokeUnion),
      curves: this.createPathBatch(
        `${id}-curves`,
        pass,
        plugin,
        this.curveTemplate,
        createCurveTemplate(),
        strokeUnion
      ),
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
        programKey,
        effect: undefined,
        effectActive: false,
        users: 0,
        fallback: true,
        lines: this.createPathBatch(`${id}-lines`, pass, plugin, this.lineTemplate, createLineTemplate()),
        curves: this.createPathBatch(`${id}-curves`, pass, plugin, this.curveTemplate, createCurveTemplate()),
      };
    }
    group.curves.culling = new PathCulling();
    group.lines.culling = new PathCulling();
    if (pass === "opaque" && !effect) {
      // Same-depth pieces have the same RGB: alpha-to-coverage unions their samples independent of bin order.
      group.coarseCurves = this.createPathBatch(
        `${id}-curves-coarse`,
        pass,
        plugin,
        this.curveTemplate,
        createCurveTemplate()
      );
      group.coarseCurves.curveChords = 8;
      group.coarseCurves.uniforms.graph_overviewPairs = 1;
      group.coarseCurves.culling = new PathCulling();
    }
    this.pathBatchGroups.set(group.lines, group);
    this.pathBatchGroups.set(group.curves, group);
    if (group.coarseCurves) this.pathBatchGroups.set(group.coarseCurves, group);
    return group;
  }

  private watchUniforms(group: TPathGroup): (() => void) | undefined {
    const effect = group.effect;
    if (!effect) return undefined;
    const uniforms = Object.values(effect.uniforms);
    const requestDraw = this.events.onInvalidate;
    if (uniforms.length === 0 || !requestDraw) return undefined;
    let subscribed = false;
    return watch(() => {
      for (const uniform of uniforms) track(uniform);
      if (subscribed && group.effectActive) untracked(requestDraw);
      subscribed = true;
    });
  }

  private releaseUnusedPathGroups(): void {
    for (const [key, group] of this.pathGroups) {
      const { programKey } = group;
      if (programKey === undefined || group.users > 0) continue;
      group.stopUniforms?.();
      group.stopUniforms = undefined;
      group.effect = undefined;
      this.pathGroups.delete(key);
      if (this.idlePathGroups.has(programKey)) {
        this.destroyBatch(group.lines);
        this.destroyBatch(group.curves);
      } else {
        this.idlePathGroups.set(programKey, group);
      }
      this.orderStamp = [];
      this.layoutStamp = [];
    }
  }

  /** Whether the GL objects are alive: deleting objects of a lost context, restored or not, only reports errors. */
  private ownsObjects(): boolean {
    return !this.objectsLost && !this.gl.isContextLost();
  }

  private destroyBatch(batch: TBatch): void {
    batch.model.destroy();
    batch.plain?.model.destroy();
    batch.revealed?.model.destroy();
    if (!this.ownsObjects()) return;
    batch.model.vertexArray.destroy();
    batch.plain?.model.vertexArray.destroy();
    batch.revealed?.model.vertexArray.destroy();
    batch.buffer.destroy();
    batch.companion?.buffer?.destroy();
    batch.pathRecords?.texture.destroy();
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
   * A batch with the shared quad template, one instance buffer (`layout[1]`) and, for a program with a companion
   * list, the companion's buffer.
   */
  private createBatch(id: string, program: TQuadProgram, pass: TPass, spriteTexture?: Texture): TBatch {
    const { vs, fs, layout, floats, textures } = program;
    const buffer = this.createInstanceBuffer(floats);
    const instanceBuffers: TInstanceBuffer[] = [{ name: layout[1].name, buffer }];
    const bufferLayout: BufferLayout[] = [...layout];
    let companion: TCompanion | undefined;
    if (program.companion) {
      const companionBuffer = this.createInstanceBuffer(program.companion.floats);
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
      bindings: { ...this.bindings(textures), ...(spriteTexture && { sprite_image: spriteTexture }) },
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
  private createRevealedGlyphs(source: TBatch): TBatch {
    const uniforms: TUniforms = { scene_opaquePass: 1, scene_glyphPass: 2 };
    const model = new Model(this.device, {
      id: "glyph-revealed",
      vs: GLYPH_VERTEX,
      fs: GLYPH_FRAGMENT,
      topology: "triangle-strip",
      bufferLayout: [...source.layout],
      attributes: {
        scene_template: this.quadTemplate,
        ...Object.fromEntries(source.instanceBuffers.map(({ name, buffer }) => [name, buffer])),
      },
      bindings: this.batchBindings(source),
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

  private createPathBatch(
    id: string,
    pass: TPass,
    plugin: ShaderPlugin,
    template: Buffer,
    templateData: Float32Array,
    strokeUnion = false
  ): TBatch {
    const buffer = this.createInstanceBuffer(1);
    const elements: TCompanion = {
      kind: "elements",
      ranges: new InstanceRanges(PATH_ELEMENT_FLOATS),
    };
    // Empty effect groups need only a placeholder; the first upload allocates their actual record table.
    const pathRecords = { texture: this.createTableTexture(PATH_RECORD_TEXELS, 1), ids: new PathDrawIds() };
    const uniforms: TUniforms = {
      scene_opaquePass: pass === "opaque" ? 1 : 0,
      graph_effectEnabled: 1,
      graph_curveStep: 1,
      graph_overviewPairs: 0,
      graph_recordWidth: PATH_RECORD_TEXELS,
    };
    // A plain translucent polyline is one paint operation. At its physical edge MSAA supplies coverage per
    // sample, and strict depth claims that sample once for this element and primitive, across both stroke batches.
    const model = new Model(this.device, {
      id,
      vs: strokeUnion ? SAMPLE_PATH_VERTEX : PATH_VERTEX,
      fs: strokeUnion ? SAMPLE_PATH_FRAGMENT : PATH_FRAGMENT,
      plugins: [plugin],
      topology: "triangle-strip",
      bufferLayout: PATH_LAYOUT,
      attributes: { graph_template: template, graph_recordId: buffer },
      bindings: { ...this.bindings(PATH_TEXTURES), graph_records: pathRecords.texture },
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

  private bindings(names: readonly TTextureName[]): Record<string, Texture> {
    const textures: Record<TTextureName, Texture> = {
      scene_elements: this.elementTexture,
      scene_styles: this.styleTexture,
      scene_atlas: this.atlasTexture,
    };
    return Object.fromEntries(names.map((name) => [name, textures[name]]));
  }

  private batchBindings(batch: TBatch): Record<string, Texture> {
    const bindings = this.bindings(batch.textures);
    if (batch.pathRecords) bindings.graph_records = batch.pathRecords.texture;
    if (batch.spriteTexture) bindings.sprite_image = batch.spriteTexture;
    return bindings;
  }

  private *allBatches(): Generator<TBatch> {
    yield this.rects.opaque;
    yield this.rects.translucent;
    yield this.triangles.opaque;
    yield this.triangles.translucent;
    yield this.glyphs.opaque;
    yield this.glyphs.translucent;
    if (this.spriteBatches.size) yield* this.spriteBatches;
    for (const group of this.pathGroups.values()) {
      yield group.lines;
      yield group.curves;
      if (group.coarseCurves) yield group.coarseCurves;
    }
  }

  /**
   * The batches of a pass. Depth orders the opaque pass; the translucent pass is drawn by
   * `translucentParts`, where this order breaks ties (the line and curve pieces of one path).
   */
  private *passBatches(pass: TPass): Generator<TBatch> {
    for (const group of this.pathGroups.values()) {
      if (group.pass !== pass) continue;
      yield group.lines;
      yield group.curves;
      if (group.coarseCurves) yield group.coarseCurves;
    }
    yield this.rects[pass];
    yield this.triangles[pass];
    yield this.glyphs[pass];
    if (pass === "opaque" && this.glyphs.translucent.revealed) yield this.glyphs.translucent.revealed;
    if (pass === "translucent" && this.spriteBatches.size) yield* this.spriteBatches;
  }

  private invalidateOverlap(id: string): void {
    if (this.effectOverlapPrimitives.has(id)) this.overlapDirty.add(id);
  }

  private refreshOverlapBounds(frame: TSceneFrame): void {
    if (this.effectOverlapPrimitives.size === 0) return;
    const requested = Math.fround(Math.min(frame.scale, frame.scaleMin ?? MIN_CAMERA_SCALE));
    const minScale = requested > 0 && Number.isFinite(requested) ? requested : MIN_CAMERA_SCALE;
    const dpr = frame.dpr > 0 && Number.isFinite(frame.dpr) ? Math.fround(frame.dpr) : 1;
    let limits = this.overlapLimits;
    let ids: Iterable<string> = this.overlapDirty;
    if (!limits || minScale < limits.minScale || dpr < limits.dpr) {
      limits = { minScale: Math.min(minScale, limits?.minScale ?? minScale), dpr: Math.min(dpr, limits?.dpr ?? dpr) };
      this.overlapLimits = limits;
      ids = this.effectOverlapPrimitives.keys();
    }
    for (const id of ids) {
      const element = this.elements.get(id);
      const primitives = this.effectOverlapPrimitives.get(id);
      const box = element && primitives && this.overlapEnvelope(element, primitives, limits);
      if (box) this.levels.set(id, box, true);
      else this.levels.delete(id);
    }
    this.overlapDirty.clear();
  }

  /** Keep a place for parts used in other states. Permanently hidden paint adds no overlap constraints. */
  private overlapEnvelope(
    element: TSceneElement,
    primitives: readonly TScenePrimitive[],
    limits: { minScale: number; dpr: number }
  ): TTileRect | undefined {
    let lowest = Infinity;
    let text = false;
    const cache = this.overlapGeometry.get(element.id)?.geometry ?? new CachedGeometryBounds(primitives);
    const geometry = cache.at(
      (primitive) => {
        if (this.styles.hiddenForOrder(element.styleId, primitive.part)) return undefined;
        const scale = Math.max(limits.minScale, Math.fround(scaleBound(primitive.minScale, 0)));
        lowest = Math.min(lowest, scale);
        text ||= primitive.kind === "text" && isTranslucentText(primitive);
        return scale;
      },
      cache.pathsOnly ? limits.dpr : undefined
    );
    if (cache.pathsOnly) return geometry;
    const bounds = text ? element.bounds : geometry;
    if (!bounds) return undefined;
    const paint = geometry ?? bounds;
    const pad = Math.max(1, 1.5 / limits.dpr) / lowest;
    return {
      minX: Math.min(paint.minX, bounds.minX) - pad,
      minY: Math.min(paint.minY, bounds.minY) - pad,
      maxX: Math.max(paint.maxX, bounds.maxX) + pad,
      maxY: Math.max(paint.maxY, bounds.maxY) + pad,
    };
  }

  private overlapBounds(
    element: TSceneElement,
    primitives: readonly TScenePrimitive[],
    scope: TOverlapScope,
    scale: number
  ): TTileRect | undefined {
    // Keep hidden owners in the conservative overlap order. HTML viewport handover changes only their final
    // visibility: showing an owner again must find its ranges in the same valid order without a global rebuild.
    const style = this.overlapStyles[element.styleId];
    let hasTranslucentText = false;
    const geometry = (this.overlapGeometry.get(element.id)?.geometry ?? new CachedGeometryBounds(primitives)).at(
      (primitive) => {
        if (!isOnLevel(primitive.levelMask, scope.level)) return undefined;
        const { part } = primitive;
        if (part !== undefined && (style?.parts?.[part]?.visible ?? style?.base?.[part]?.visible) === false)
          return undefined;
        const from = Math.fround(scaleBound(primitive.minScale, 0));
        const to = Math.fround(scaleBound(primitive.maxScale, NO_LIMIT));
        const translucentText = primitive.kind === "text" && isTranslucentText(primitive);
        if (scale < from) {
          scope.to = Math.min(scope.to, from);
          return undefined;
        }
        if (scale >= to) {
          scope.from = Math.max(scope.from, to);
          return undefined;
        }
        scope.from = Math.max(scope.from, from);
        scope.to = Math.min(scope.to, to);
        hasTranslucentText = hasTranslucentText || translucentText;
        return scope.minScale;
      }
    );
    // Glyph ink bounds come from the scene's text layout. Opaque text needs no translucent ordering.
    const bounds = hasTranslucentText ? element.bounds : geometry;
    if (!bounds) return undefined;
    const paint = geometry ?? bounds;
    // Include the anti-aliased rim of rects and the minimum device-pixel width of paths.
    const pad = Math.max(1, 1.5 / scope.dpr) / scope.minScale;
    return {
      minX: Math.min(paint.minX, bounds.minX) - pad,
      minY: Math.min(paint.minY, bounds.minY) - pad,
      maxX: Math.max(paint.maxX, bounds.maxX) + pad,
      maxY: Math.max(paint.maxY, bounds.maxY) + pad,
    };
  }

  private readonly levelOf = (id: string): number => this.levels.levelOf(id);
  private readonly orderLevelOf = (id: string): number => this.levels.orderLevelOf(id);

  private readonly elementOf = (id: string): TSceneElement | undefined => this.elements.get(id);

  private readonly depthBandOf = (id: string): number => {
    const element = this.elements.get(id);
    const root = element?.parent === undefined ? element : this.elements.get(element.parent);
    return root ? this.zIndexOf(root) : 0;
  };

  /**
   * Updates the overlap levels after a change of the translucent set, of a translucent element's own zIndex or order,
   * or of a translucent element's origin or bounds. When levels or range layout change, rebuilds
   * the draw runs: for each level, for each step, a draw per program. Retained path ranges stay at their resident
   * offsets; only their visible draw schedule follows the levels. Dense lists sort after structural changes or more than
   * `MAX_OUT_OF_PLACE` buckets move; a smaller level change adds draws without moving their instances. Camera, LOD
   * and visibility changes only filter these runs. A change of the depth's width rebuilds the runs: it bounds the steps of an element, so it
   * numbers the draw positions.
   */
  private orderTranslucent(): void {
    if (this.levels.pending) {
      const start = performance.now();
      this.levels.update(this.orderKeyOf, this.elementOf, this.depthBandOf);
      this.stats.lastLevelsMs = performance.now() - start;
      this.stats.translucentLevels = this.levels.count;
    }
    const { subBits } = this.depth;
    const batches = [...this.passBatches("translucent")];
    // Draw positions depend on range membership, steps and offsets, not in-place paint or geometry edits.
    const stamp = (): number[] => [
      subBits,
      this.levels.revision,
      ...batches.map((batch) => batch.ranges.layoutRevision),
    ];
    if (sameNumbers(stamp(), this.orderStamp)) return;
    const start = performance.now();
    const layout = (): number[] => batches.map((batch) => batch.ranges.layoutRevision);
    this.translucentOrderCache.levelRevision = this.levels.revision;
    this.translucentOrderCache.changedLevelIds = this.levels.changedLevelIds;
    this.translucentParts = orderTranslucentChunks(
      batches.map((batch) => ({ instances: batch.ranges, companion: batch.companion?.ranges })),
      this.orderLevelOf,
      this.orderKeyOf,
      subBits,
      !sameNumbers(layout(), this.layoutStamp),
      this.translucentOrderCache,
      this.levelOf
    );
    this.translucentBatches = batches;
    // After the sort: it changes the revisions of the lists it reorders.
    this.orderStamp = stamp();
    this.layoutStamp = layout();
    this.stats.lastTranslucentOrderMs = performance.now() - start;
  }

  private *rawTranslucentRuns(): Iterable<TTranslucentRun> {
    if (this.activeInput) this.clearTranslucentGroups();
    for (const { runs, first, end } of this.translucentParts) {
      for (let i = first; i < end; i++) yield runs[i];
    }
  }

  private preparedGroupDraws(frame: TSceneFrame): TDraw[] {
    const batches = this.translucentBatches;
    const views = batches.map((batch) =>
      batch.culling?.preparedRanges(
        frame,
        Number(batch.uniforms.graph_extraWidth ?? 0),
        batch.curveChords && canCoarsenCurves(frame, batch.culling.untranslated) ? batch.curveChords : undefined
      )
    );
    const draws = this.preparedGroups.update(this.activeGroups, batches, views);
    if (!this.frameAnimated && batches.some((batch) => batch.animated)) {
      this.frameAnimated = draws.some(
        ({ batch, first, count }) => batch.animated && (this.visibility.get(batch)?.any(first, count) ?? true)
      );
    }
    return draws;
  }

  /** Returns an alternate raw/coalesced schedule when the retained active groups cannot be submitted directly. */
  private visibleTranslucentRuns(frame: TSceneFrame): Iterable<TTranslucentRun> | undefined {
    const batches = this.translucentBatches;
    if (!batches.some((batch) => batch.ranges.layoutRetained && batch.ranges.liveCount > 0))
      return this.rawTranslucentRuns();
    const scale = Math.fround(frame.scale);
    if (!(scale > 0) || !Number.isFinite(scale)) return this.rawTranslucentRuns();
    const visibility = batches.map((batch) => this.updateVisibility(batch, frame));
    // The physical schedule and its shader predicates are independent of paint and in-place geometry writes.
    const stamp = [...this.orderStamp, ...visibility.map((source) => source.visibilityRevision)];
    const changed = this.activeInput !== this.translucentParts || !sameNumbers(stamp, this.activeStamp);
    if (changed) {
      this.activeGroups = this.translucentVisibility.update(
        this.translucentParts,
        visibility,
        batches.map((batch) => !batch.pathRecords),
        this.translucentOrderCache.partGroups
      );
      this.activeOwners = [];
      this.activeInput = this.translucentParts;
      this.activeStamp = stamp;
    }
    // Coalescing additionally depends on exact ink footprints, even when the filtered order is unchanged.
    if (changed || this.coalesceRevision !== this.scheduleRevision) {
      this.coalesceRevision = this.scheduleRevision;
      this.coalesceScope = undefined;
      this.translucentRefinement.clear();
    }
    const refine = this.translucentRefinement.take(frame, this.stockActivityRevision);
    let scope = this.coalesceScope;
    if (!scope && !refine) return undefined;
    const x = Math.fround(frame.x),
      y = Math.fround(frame.y);
    const width = Math.fround(frame.width),
      height = Math.fround(frame.height);
    const view: TTileRect = {
      minX: (-x - 2) / scale,
      minY: (-y - 2) / scale,
      maxX: (width - x + 2) / scale,
      maxY: (height - y + 2) / scale,
    };
    if (!Number.isFinite(view.minX + view.minY + view.maxX + view.maxY)) return this.rawTranslucentRuns();
    if (scope && withinOverlapScope(scope, scale, frame.level, frame.dpr) && containsBox(scope.clip, view))
      return this.coalescedRuns;
    // The direct plan has already been clipped and submitted. Its actual draw count includes stock batching.
    if (!refine) return undefined;
    if (this.activeOwners.length === 0) {
      this.activeOwners = translucentRunOwners(
        this.activeGroups.flat(),
        batches.map((batch) => batch.ranges),
        batches.map((batch) => batch.companion?.kind === "subs")
      );
    }
    const padX = (view.maxX - view.minX) / 4,
      padY = (view.maxY - view.minY) / 4;
    const clip = { minX: view.minX - padX, minY: view.minY - padY, maxX: view.maxX + padX, maxY: view.maxY + padY };
    const minScale = 2 ** Math.floor(Math.log2(scale));
    scope = { from: minScale, to: 2 * minScale, minScale, level: frame.level, dpr: frame.dpr, clip };
    const current = scope;
    this.coalescedRuns = coalesceTranslucentRuns(this.activeOwners, clip, (id) => {
      const element = this.elements.get(id);
      const cached = this.overlapGeometry.get(id);
      // Unknown ink is a barrier. Glyph sources are always barriers: their ink can overhang authored layout bounds.
      if (!element || !cached) return clip;
      const box = this.overlapBounds(element, cached.primitives, current, scale);
      if (!box) return this.hiddenInScene(element) ? undefined : clip;
      const ox = Math.fround(element.x),
        oy = Math.fround(element.y);
      const magnitude = Math.max(
        Math.abs(ox),
        Math.abs(oy),
        Math.abs(box.minX),
        Math.abs(box.minY),
        Math.abs(box.maxX),
        Math.abs(box.maxY),
        Math.abs(clip.minX),
        Math.abs(clip.minY),
        Math.abs(clip.maxX),
        Math.abs(clip.maxY)
      );
      // Include encoded float coordinates, origin addition and projection, even for cancelling large operands.
      const pad = (magnitude + 1) * 2 ** -18 + 2 / minScale;
      return {
        minX: ox + box.minX - pad,
        minY: oy + box.minY - pad,
        maxX: ox + box.maxX + pad,
        maxY: oy + box.maxY + pad,
      };
    });
    this.coalesceScope = scope;
    return this.coalescedRuns;
  }

  /**
   * Points the batch's per-instance attributes at instance `first`. WebGL 2 has no base instance, so a run that starts
   * inside the instance buffer moves the attribute offsets in the model's vertex array; the formats are float32.
   */
  private pointInstances(batch: TInstancePointerTarget, first: number): void {
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
  private instancePointers(batch: TInstancePointerTarget): { buffer: DynamicBuffer; attributes: TPointer[] }[] {
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
  private setEffectUniforms(group: TPathGroup, scale: number): void {
    const { effect } = group;
    const active = Boolean(effect) && isConnectionEffectActive(group, scale);
    if (group.effectActive !== active && !stockGroup(group)) this.stockActivityRevision++;
    group.effectActive = active;
    for (const batch of [group.lines, group.curves, group.coarseCurves]) {
      if (!batch) continue;
      const { uniforms } = batch;
      batch.animated = group.effectActive && Boolean(effect?.animated);
      uniforms.graph_effectEnabled = group.effectActive ? 1 : 0;
      uniforms.graph_extraWidth = group.effectActive ? effect?.extraWidth ?? 0 : 0;
      if (effect && !group.effectActive && hasEffectDepthWrites(effect) && !batch.plain) {
        const line = batch === group.lines;
        batch.plain = {
          model: new Model(this.device, {
            id: `${batch.model.id}-plain`,
            vs: PATH_VERTEX,
            fs: PATH_FRAGMENT,
            plugins: [createPathPlugin(undefined)],
            topology: "triangle-strip",
            bufferLayout: PATH_LAYOUT,
            attributes: { graph_template: line ? this.lineTemplate : this.curveTemplate, graph_recordId: batch.buffer },
            bindings: this.batchBindings(batch),
            uniforms,
            parameters: PASS_PARAMETERS[group.pass],
            vertexCount: (line ? createLineTemplate() : createCurveTemplate()).length / 2,
            isInstanced: true,
            instanceCount: 0,
          }),
          layout: batch.layout,
          instanceBuffers: batch.instanceBuffers,
          pointedAt: 0,
        };
      }
      if (!effect) continue;
      for (const name of Object.keys(effect.uniformTypes)) {
        const value = effect.uniforms[name]?.peek();
        if (value !== undefined) uniforms[`u_${name}`] = value;
      }
    }
  }

  /** Ownership follows the existing scene root, even for a path painted by a block's child. */
  private ownedDrawRanges(batch: TBatch): readonly TMixedOwnerRange[] {
    const cached = this.mixedOwnedRanges.get(batch);
    if (cached?.layout === batch.ranges.layoutRevision && cached.ownership === this.mixedOwnershipRevision)
      return cached.ranges;
    const updated = updateMixedOwnerRanges(batch.ranges, this.mixedOwnershipRevision, cached, (id) => {
      const element = this.elements.get(id);
      const root = element && this.elements.get(this.rootIdOf(element));
      return (root ?? element)?.entityType === "connection";
    });
    this.mixedOwnedRanges.set(batch, updated);
    return updated.ranges;
  }

  /** Splits physical ranges before gatherPathDraws can map their first indices to compact addresses. */
  private splitMixedDraws(draws: readonly TDraw[], upper: TDraw[], connection: TDraw[]): void {
    for (const draw of draws) {
      const ranges = this.ownedDrawRanges(draw.batch);
      if (ranges.length === 1 && ranges[0].first === 0) {
        (ranges[0].connection ? connection : upper).push({ ...draw });
        continue;
      }
      const end = draw.first + draw.count;
      for (let i = firstOverlappingOwnerRange(ranges, draw.first); i < ranges.length && ranges[i].first < end; i++) {
        const range = ranges[i];
        const first = Math.max(draw.first, range.first);
        const count = Math.min(end, range.first + range.count) - first;
        (range.connection ? connection : upper).push({ ...draw, first, count });
      }
    }
  }

  private buildMixedPlane(opaque: readonly TDraw[], translucent: readonly TDraw[]): TMixedPlan | undefined {
    const upperOpaque: TDraw[] = [];
    const upperTranslucent: TDraw[] = [];
    const lowerOpaque: TDraw[] = [];
    const lowerTranslucent: TDraw[] = [];
    this.splitMixedDraws(opaque, upperOpaque, lowerOpaque);
    this.splitMixedDraws(translucent, upperTranslucent, lowerTranslucent);
    const lower = [...lowerOpaque, ...lowerTranslucent];
    const nativeOnlyPaint: TDraw[] = [];
    const lowerPaths: TDraw[] = [];
    for (const draw of lower) {
      // The lower plane has neither per-sample coverage nor scene depth.
      const canFlatten = draw.batch.pathRecords && !this.pathBatchGroups.get(draw.batch)?.strokeUnion;
      (canFlatten ? lowerPaths : nativeOnlyPaint).push(draw);
    }
    if (!lowerPaths.length) return undefined;

    const groupOf = new Map<TBatch, TPathGroup>();
    for (const group of this.pathGroups.values()) {
      groupOf.set(group.lines, group);
      groupOf.set(group.curves, group);
      if (group.coarseCurves) groupOf.set(group.coarseCurves, group);
    }
    // Explicit shader depth writes are interpreted by the shared depth buffer.
    if ([...upperOpaque, ...upperTranslucent].some(({ batch }) => hasEffectDepthWrites(groupOf.get(batch)?.effect)))
      return undefined;
    const ties = new Map(
      [...this.passBatches("opaque"), ...this.passBatches("translucent")].map((batch, index) => [batch, index])
    );
    const stock = this.mixedStockGroup(lowerPaths, groupOf);
    const work: TMixedPathWork = {
      stock,
      sources: [],
      ranges: [],
      widths: { worldWidth: 0, pixelWidth: 0 },
    };
    for (const draw of lowerPaths) {
      const group = groupOf.get(draw.batch);
      const tie = ties.get(draw.batch);
      if (!group || tie === undefined || !this.collectMixedPaths(draw, group, tie, work)) return undefined;
    }
    canonicalizeMixedSources(work.sources, work.ranges);
    const schedule = this.mixedBands.schedule(work.ranges);
    if (!schedule?.spans.length) return undefined;
    return {
      ...schedule,
      effect: stock?.effect,
      effectUniforms: stock?.curves.uniforms,
      sources: work.sources,
      sourceCounts: mixedSourceCounts(schedule.spans, work.sources.length),
      widths: work.widths,
      upperOpaque,
      upperTranslucent,
      nativeOnlyPaint,
    };
  }

  /** Labels and filled arrows stay in the shared pass whenever their vertex predicates allow paint. */
  private hasVisibleNativeOnlyPaint(plan: TMixedPlan, frame: TSceneFrame): boolean {
    for (const { batch, first, count } of plan.nativeOnlyPaint) {
      // The shared glyph view owns no visibility cache. A lower-plane candidate keeps native depth composition.
      if (batch === this.glyphs.translucent.revealed && count > 0) return true;
      if (this.updateVisibility(batch, frame).any(first, count)) return true;
    }
    return false;
  }

  /** Keep the common stock shader when a single connection has another effect. */
  private mixedStockGroup(lower: readonly TDraw[], groups: ReadonlyMap<TBatch, TPathGroup>): TPathGroup | undefined {
    const weights = new Map<TEffect, number>();
    let stock: TPathGroup | undefined;
    let weight = 0;
    for (const { batch, count } of lower) {
      const group = groups.get(batch);
      const effect = group?.effect;
      if (!effect || !MIXED_EFFECT_PROGRAMS.has(effect.programKey) || effect.extraWidth !== 0) continue;
      const total = (weights.get(effect) ?? 0) + count;
      weights.set(effect, total);
      if (total > weight) {
        stock = group;
        weight = total;
      }
    }
    return stock;
  }

  private collectMixedPaths(draw: TDraw, group: TPathGroup, tie: number, work: TMixedPathWork): boolean {
    const { batch } = draw;
    const { pathRecords, companion } = batch;
    if (!pathRecords || !companion || group.fallback) return false;
    const native = group.effect && !stockGroup(group) ? group.effect : undefined;
    if (native && ((work.customEffect && work.customEffect !== native) || hasEffectDepthWrites(native))) return false;
    const chords = batch === group.lines ? 1 : draw.curveDetail ?? 16;
    let source = work.sources.findIndex((entry) => entry.records === pathRecords && entry.chords === chords);
    if (!native && source < 0) {
      source = work.sources.length;
      if (source >= MIXED_PATH_MAX_SOURCES) return false;
      work.sources.push({ records: pathRecords, chords, group, tie });
    }
    const elements = companion.ranges.data;
    const data = batch.ranges.data;
    const scan = (
      first: number,
      end: number,
      ranges: TMixedPathWork["ranges"],
      widths: TSubpixelPathWidth
    ): boolean => {
      while (first < end) {
        const at = first * PATH_ELEMENT_FLOATS;
        const owner = elements[at];
        const sub = elements[at + SUB_FLOAT];
        let last = first + 1;
        while (
          last < end &&
          elements[last * PATH_ELEMENT_FLOATS] === owner &&
          elements[last * PATH_ELEMENT_FLOATS + SUB_FLOAT] === sub
        )
          last++;
        const key = this.table.data[owner * 4 + 2];
        if (key >= 0) {
          if (native) {
            if (work.customKey !== undefined && work.customKey !== key) return false;
            work.customEffect = native;
            work.customKey = key;
            ranges.push({ key, sub, tie, first, count: last - first, native: batch });
          } else {
            ranges.push({ key, sub, tie, first, count: last - first, source });
          }
          if (group.pass === "opaque") {
            // All pieces of this primitive share its stroke. Zero-filled holes can alias only owner 0, sub 0.
            const widthEnd = owner === 0 && sub === 0 ? last : first + 1;
            this.extendMixedWidth(widths, data, elements, first, widthEnd);
          }
        }
        first = last;
      }
      return true;
    };
    if (native || group.pass !== "opaque" || !batch.culling)
      return scan(draw.first, draw.first + draw.count, work.ranges, work.widths);

    const depth = this.table.depthRevision;
    batch.culling.visitChunks(draw.first, draw.count, (chunk, first, end) => {
      let page = this.mixedPages.get(chunk);
      if (
        !page ||
        page.first !== first ||
        page.end !== end ||
        page.source !== source ||
        page.tie !== tie ||
        page.depth !== depth
      ) {
        page = { first, end, source, tie, depth, ranges: [], widths: { worldWidth: 0, pixelWidth: 0 } };
        scan(first, end, page.ranges, page.widths);
        this.mixedPages.set(chunk, page);
      }
      work.ranges.push(...page.ranges);
      work.widths.worldWidth = Math.max(work.widths.worldWidth, page.widths.worldWidth);
      work.widths.pixelWidth = Math.max(work.widths.pixelWidth, page.widths.pixelWidth);
    });
    return true;
  }

  private extendMixedWidth(
    widths: TSubpixelPathWidth,
    data: Float32Array,
    elements: Float32Array,
    first: number,
    end: number
  ): void {
    for (let slot = first; slot < end; slot++) {
      const e = slot * PATH_ELEMENT_FLOATS;
      const mode = Math.floor(elements[e + 6] / 8);
      const minimum = elements[e + 3];
      const value = data[slot * INSTANCE_FLOATS + 12];
      widths.worldWidth = Math.max(widths.worldWidth, mode === 1 ? minimum : value);
      if (mode !== 0) widths.pixelWidth = Math.max(widths.pixelWidth, mode === 1 ? value : minimum);
    }
  }

  private hasMixedVertexWork(
    opaque: readonly TDraw[],
    translucent: readonly TDraw[],
    connectionOnly: boolean
  ): boolean {
    let remaining = MIN_MIXED_CONNECTION_VERTICES;
    const grouped = !connectionOnly && translucent !== this.translucentFrameDraws;
    const lists = grouped ? [opaque, ...this.preparedGroups.ordered] : [opaque, translucent];
    for (const draws of lists) {
      // Prepared groups keep their instance counts and curve detail. Connection ownership may change independently.
      const cache = grouped && draws !== opaque ? this.groupVertexCounts : undefined;
      const cached = cache?.get(draws);
      if (cached !== undefined) {
        remaining -= cached;
        if (remaining <= 0) return true;
        continue;
      }
      const before = remaining;
      for (const draw of draws) {
        const { batch } = draw;
        if (!batch.pathRecords) continue;
        const chords = draw.curveDetail ?? (batch.curveChords ? CURVE_CHORDS : undefined);
        const vertices = chords === undefined ? batch.model.vertexCount : (chords + 1) * 2;
        remaining -= vertices * (connectionOnly ? this.connectionInstances(draw) : draw.count);
        if (remaining <= 0) return true;
      }
      cache?.set(draws, before - remaining);
    }
    return false;
  }

  private connectionInstances({ batch, first, count }: TDraw): number {
    const ranges = this.ownedDrawRanges(batch);
    if (ranges.length === 1 && ranges[0].first === 0) return ranges[0].connection ? count : 0;
    const end = first + count;
    let result = 0;
    for (let i = firstOverlappingOwnerRange(ranges, first); i < ranges.length && ranges[i].first < end; i++) {
      const range = ranges[i];
      if (range.connection) result += Math.min(end, range.first + range.count) - Math.max(first, range.first);
    }
    return result;
  }

  private useOverviewCurves(frame: TSceneFrame): boolean {
    return overviewCamera(frame, this.overviewFrame);
  }

  private overviewSource(batch: TBatch, group: TPathGroup): OverviewCurveGroups | undefined {
    const overview = batch.pathRecords?.overview;
    return this.overviewFrame && !group.effectActive && batch.culling?.untranslated && overview?.count
      ? overview
      : undefined;
  }

  private combinedOverview(sources: readonly TMixedSource[]): (OverviewCurveGroups | undefined)[] | undefined {
    if (!this.overviewFrame) return undefined;
    let groups: (OverviewCurveGroups | undefined)[] | undefined;
    for (let index = 0; index < sources.length; index++) {
      const { records, group } = sources[index];
      if (!records.overview?.count) continue;
      const batch = group.coarseCurves?.pathRecords === records ? group.coarseCurves : group.curves;
      const overview = this.overviewSource(batch, group);
      if (overview) {
        groups ??= Array<OverviewCurveGroups | undefined>(sources.length).fill(undefined);
        groups[index] = overview;
      }
    }
    return groups;
  }

  /**
   * An eight-chord submission removes 16 unused vertices from every short strip. Splitting a long
   * strip repeats its shared edge (two vertices), preserving every triangle and its painter order.
   * Count short strips after the largest possible overview compaction, long ones before any compaction.
   */
  private splitMixedSources(plan: TMixedPlan, overview?: readonly (OverviewCurveGroups | undefined)[]): number {
    let split = 0;
    let saved = 0;
    for (let i = 0; i < plan.sources.length; i++) {
      const { chords, records } = plan.sources[i];
      const count = plan.sourceCounts[i];
      if (chords === 16) {
        // The phase bit shares the physical slot field with the original record address.
        if (records.texture.width * records.texture.height > (MIXED_PATH_SOURCE_STRIDE / 2) * PATH_RECORD_TEXELS)
          return 0;
        split += 2 ** i;
        saved -= 2 * count;
      } else {
        saved += (16 * count) / (overview?.[i]?.pieces ?? 1);
      }
    }
    return saved >= MIN_MIXED_CONNECTION_VERTICES ? split : 0;
  }

  private prepareMixedPlane(
    frame: TSceneFrame,
    opaque: readonly TDraw[],
    translucent: readonly TDraw[]
  ): TPreparedMixed | undefined {
    // Reject light workloads before inspecting ownership or allocating the target.
    if (
      this.mixedRootsSeparated === false ||
      !this.pathGroupsOf.size ||
      !this.hasMixedVertexWork(opaque, translucent, false)
    )
      return undefined;
    this.mixedTextureUnits ??= this.defaultMultisampled
      ? (this.gl.getParameter(this.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) as number)
      : 0;
    if (this.mixedTextureUnits < 3) return undefined;
    this.mixedTextureLimit ??= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    const width = Math.max(1, Math.round(frame.width * frame.dpr));
    const height = Math.max(1, Math.round(frame.height * frame.dpr));
    if (!(Math.max(width, height) <= this.mixedTextureLimit)) return undefined;
    if (this.mixedRootsSeparated === undefined) {
      const roots = [];
      for (const element of this.elements.values()) {
        if (element.parent !== undefined || element.hidden) continue;
        roots.push({ entityType: element.entityType, key: this.depth.peekKey(element.id) });
      }
      this.mixedRootsSeparated = separatedConnectionDepths(roots);
    }
    if (!this.mixedRootsSeparated || !this.hasMixedVertexWork(opaque, translucent, true)) return undefined;
    const plan = this.cachedMixedPlane(opaque, translucent);
    if (
      !plan ||
      plan.sources.length + 2 > this.mixedTextureUnits ||
      !fullySubpixelPaths(plan.widths, frame.scale, frame.dpr) ||
      this.hasVisibleNativeOnlyPaint(plan, frame)
    )
      return undefined;

    const draw = this.mixedDrawFor(plan);
    if (!draw) return undefined;
    if (!this.mixedTarget || this.mixedTarget.width !== width || this.mixedTarget.height !== height) {
      this.mixedTarget?.destroy();
      this.mixedTarget = undefined;
      try {
        this.mixedTarget = this.device.createFramebuffer({ width, height, colorAttachments: ["rgba8unorm"] });
      } catch {
        return undefined;
      }
    }
    const overview = this.combinedOverview(plan.sources);
    draw.splitSources = this.splitMixedSources(plan, overview);
    let changed = draw.ids.updatePlan(plan.spans, overview, draw.splitSources);
    let upload: TUploadKind = changed ? "range" : "none";
    if (draw.ids.data.byteLength > draw.buffer.byteLength) {
      draw.buffer.resize({ byteLength: Math.max(draw.ids.data.byteLength, draw.buffer.byteLength * 2) });
      draw.model.setAttributes({ graph_recordId: draw.buffer });
      draw.pointedAt = 0;
      changed = { byteOffset: 0, data: draw.ids.data };
      upload = "full";
    }
    if (changed) {
      draw.buffer.write(changed.data, changed.byteOffset);
      this.countUpload(changed.data.byteLength);
    }
    return { plan, draw, target: this.mixedTarget, upload };
  }

  private cachedMixedPlane(opaque: readonly TDraw[], translucent: readonly TDraw[]): TMixedPlan | undefined {
    // Camera-driven packing can move records while a prepared span retains identical first/count values.
    const batches = new Set<TBatch>();
    for (const draw of opaque) batches.add(draw.batch);
    for (const draw of translucent) batches.add(draw.batch);
    const layouts: number[] = [];
    for (const batch of batches) layouts.push(batch.ranges.layoutRevision, batch.companion?.ranges.layoutRevision ?? 0);
    let cached = this.mixedPlan;
    if (
      !cached ||
      !sameNumbers(cached.layouts, layouts) ||
      !sameDraws(cached.opaque, opaque) ||
      !sameDraws(cached.translucent, translucent)
    ) {
      const repaired = cached?.plan && this.repairMixedPlane(cached, opaque, translucent, layouts);
      cached = {
        layouts,
        opaque: opaque.map((draw) => ({ ...draw })),
        translucent: translucent.map((draw) => ({ ...draw })),
        plan: repaired ?? this.buildMixedPlane(opaque, translucent),
      };
      this.mixedPlan = cached;
    }
    this.mixedResizes.length = 0;
    return cached.plan;
  }

  /** Replace only the affected connection ranges, after culling has chosen their visible pieces and templates. */
  private repairMixedPlane(
    cached: NonNullable<WebGLSceneBackend["mixedPlan"]>,
    opaque: readonly TDraw[],
    translucent: readonly TDraw[],
    layouts: readonly number[]
  ): TMixedPlan | undefined {
    const plan = cached.plan;
    if (
      !plan ||
      !this.mixedResizes.length ||
      plan.sources.some((source) => source.group.effect) ||
      cached.layouts.length !== layouts.length ||
      !sameDraws(cached.translucent, translucent)
    )
      return undefined;
    const edits = new Map(this.mixedResizes.map((edit) => [edit.batch, edit]));
    const unaffected = (draw: TDraw): boolean => !edits.has(draw.batch);
    if (!plan.upperOpaque.every(unaffected) || !sameDraws(cached.opaque.filter(unaffected), opaque.filter(unaffected)))
      return undefined;
    const oldBatches = [...new Set([...cached.opaque, ...cached.translucent].map((draw) => draw.batch))];
    const batches = new Set([...opaque, ...translucent].map((draw) => draw.batch));
    let i = 0;
    for (const batch of batches) {
      if (batch !== oldBatches[i / 2]) return undefined;
      const edit = edits.get(batch);
      if (edit) {
        if (
          cached.layouts[i] !== edit.layoutBefore ||
          layouts[i] !== edit.layoutAfter ||
          cached.layouts[i + 1] !== edit.companionBefore ||
          layouts[i + 1] !== edit.companionAfter
        )
          return undefined;
      } else if (cached.layouts[i] !== layouts[i] || cached.layouts[i + 1] !== layouts[i + 1]) return undefined;
      i += 2;
    }
    const patches = [];
    for (const edit of edits.values()) {
      const group = this.pathBatchGroups.get(edit.batch);
      if (group?.pass !== "opaque" || group.effect) return undefined;
      const patch = visiblePathResize(cached.opaque, opaque, edit, group.lines === edit.batch ? 1 : 16);
      if (!patch) return undefined;
      if (patch === "hidden") continue;
      const source = plan.sources.findIndex(
        (entry) => entry.records === edit.batch.pathRecords && entry.chords === patch.chords
      );
      if (source < 0) return undefined;
      patches.push({ ...patch, source });
    }
    if (!patches.length) return plan;
    const schedule = resizeMixedPlan(plan.spans, plan.commands, patches, true);
    if (!schedule) return undefined;
    const sourceCounts = plan.sourceCounts.slice();
    for (const patch of patches) sourceCounts[patch.source] += patch.after - patch.before;
    return { ...plan, ...schedule, sourceCounts };
  }

  /** A shared stock program needs painter order, but no spatial overlap search to batch it. */
  private orderedStockPaths(frame: TSceneFrame): readonly TDraw[] | undefined {
    const batches = [...this.passBatches("translucent")].filter((batch) => batch.ranges.liveCount > 0);
    // Keep order preparation independent of custom-effect activity; only native batching changes at its bounds.
    if (
      batches.length === 0 ||
      batches.length > MIXED_PATH_MAX_SOURCES ||
      batches.some(
        (batch) =>
          !batch.pathRecords ||
          batch.ranges.count > MIXED_PATH_SOURCE_STRIDE ||
          !stockGroup(this.pathBatchGroups.get(batch))
      )
    ) {
      this.stockOrder = undefined;
      this.stockPhysicalDraws.length = 0;
      return undefined;
    }
    const draws = this.stockPhysicalDraws;
    this.cullingDrawCount = 0;
    for (const batch of batches) this.appendVisibleDraws(draws, batch, frame, 0, batch.ranges.count);
    draws.length = this.cullingDrawCount;
    const stamp = [
      ...batches.flatMap((batch) => [
        batch.companion?.ranges.layoutRevision ?? 0,
        this.visibility.get(batch)?.visibilityRevision ?? 0,
      ]),
    ];
    let cached = this.stockOrder;
    if (!cached || !sameNumbers(cached.stamp, stamp) || !sameDraws(cached.physical, draws)) {
      const sources = new Map(
        batches.map((batch, tie) => [batch, batch.companion && { elements: batch.companion.ranges.data, tie }])
      );
      const ordered = orderResidentPathDraws(
        draws,
        this.table.data,
        (batch) => sources.get(batch),
        (batch, first, count) => this.visibility.get(batch)?.any(first, count) ?? true
      );
      if (!ordered) {
        this.stockOrder = undefined;
        return undefined;
      }
      cached = { stamp, physical: draws.map((draw) => ({ ...draw })), ordered };
      this.stockOrder = cached;
    }
    return cached.ordered;
  }

  /** Preserve the supplied logical order and native barriers; only the GPU address stream is combined. */
  private buildStockPlan(draws: readonly TDraw[], isStock = nativeStockGroup): TStockPlan | undefined {
    const sources: TMixedSource[] = [];
    const ranges: (TMixedPathRange | TNativePathRange<TBatch>)[] = [];
    let ordinaryGroups = 0;
    let previous: TDraw | undefined;
    for (const [key, draw] of draws.entries()) {
      const { batch, first, count } = draw;
      if (!previous || previous.batch !== batch || previous.curveDetail !== draw.curveDetail || !batch.pathRecords)
        ordinaryGroups++;
      previous = draw;
      const group = this.pathBatchGroups.get(batch);
      const range = { key, sub: 0, tie: 0, first, count };
      if (!batch.pathRecords || !group || !isStock(group)) {
        ranges.push({ ...range, native: batch });
        continue;
      }
      const chords = batch === group.lines ? 1 : draw.curveDetail ?? 16;
      let source = sources.findIndex((item) => item.records === batch.pathRecords && item.chords === chords);
      if (source < 0) {
        source = sources.length;
        if (source >= MIXED_PATH_MAX_SOURCES) return this.retryStockPlan(draws, isStock);
        sources.push({ records: batch.pathRecords, chords, group, tie: source });
      }
      ranges.push({ ...range, source });
    }
    if (ordinaryGroups < 32 || sources.length === 0) return undefined;
    const schedule = mixedPathSchedule(ranges);
    if (!schedule) return this.retryStockPlan(draws, isStock);
    if (schedule.commands.length + 16 > ordinaryGroups) return undefined;
    return { sources, ...schedule };
  }

  /** Preserve the original grouping if inactive custom sources cannot fit in the packed layout. */
  private retryStockPlan(draws: readonly TDraw[], isStock: typeof stockGroup): TStockPlan | undefined {
    return isStock === stockGroup ? undefined : this.buildStockPlan(draws, stockGroup);
  }

  private readonly nativeStockSource = (batch: TBatch, detail?: number): Omit<TMixedSource, "tie"> | undefined => {
    const records = batch.pathRecords;
    const group = this.pathBatchGroups.get(batch);
    if (!records || !group || !nativeStockGroup(group)) return undefined;
    const chords = batch === group.lines ? 1 : detail ?? 16;
    let variants = this.stockSources.get(batch);
    if (!variants) this.stockSources.set(batch, (variants = new Map()));
    let source = variants.get(chords);
    if (!source || source.records !== records || source.group !== group) {
      source = { records, chords, group };
      variants.set(chords, source);
    }
    return source;
  };

  private flatStockPlan(draws: readonly TDraw[]): TStockPlan | undefined {
    let cached = this.stockPlan;
    if (
      !cached ||
      cached.revision !== this.scheduleRevision ||
      cached.activity !== this.stockActivityRevision ||
      !sameDraws(cached.draws, draws)
    ) {
      cached = {
        revision: this.scheduleRevision,
        activity: this.stockActivityRevision,
        draws: draws.map((draw) => ({ ...draw })),
        plan: this.buildStockPlan(draws),
      };
      this.stockPlan = cached;
    }
    return cached.plan;
  }

  private prepareStockPaths(
    draws: readonly TDraw[],
    groups?: readonly (readonly TDraw[])[]
  ): TPreparedStock | undefined {
    if (!groups || draws.length < 32) this.stockCommands.clear();
    if (draws.length < 32) {
      this.stockPlan = undefined;
      return undefined;
    }
    const grouped = groups ? this.stockCommands.update(groups, this.nativeStockSource) : "fallback";
    if (grouped !== "fallback") this.stockPlan = undefined;
    const plan = grouped === "fallback" ? this.flatStockPlan(draws) : grouped;
    if (!plan) return undefined;
    const key = `native-stock|${plan.sources.length}`;
    if (this.mixedDisabled.has(key)) return undefined;
    let draw = this.stockDraw;
    if (draw?.programKey !== key) {
      this.destroyStockDraw();
      const buffer = this.createInstanceBuffer(1);
      const uniforms: TUniforms = { scene_opaquePass: 0 };
      const model = new Model(this.device, {
        id: "scene-stock-paths",
        vs: createMixedPathVertex(plan.sources.length),
        fs: STOCK_PATH_FRAGMENT,
        plugins: [createStockPathPlugin()],
        topology: "triangle-strip",
        bufferLayout: PATH_LAYOUT,
        attributes: { graph_template: this.curveTemplate, graph_recordId: buffer },
        uniforms,
        parameters: PASS_PARAMETERS.translucent,
        vertexCount: createCurveTemplate().length / 2,
        isInstanced: true,
        instanceCount: 0,
      });
      draw = {
        programKey: key,
        model,
        uniforms,
        buffer,
        ids: new PathDrawIds(),
        layout: PATH_LAYOUT,
        instanceBuffers: [{ name: PATH_LAYOUT[1].name, buffer }],
        pointedAt: 0,
      };
      this.stockDraw = draw;
      if (!isLinked(model)) {
        this.mixedDisabled.add(key);
        this.destroyStockDraw();
        return undefined;
      }
    }
    const overview = this.combinedOverview(plan.sources);
    let changed =
      plan.spanGroups && !overview ? draw.ids.updateGroups(plan.spanGroups) : draw.ids.updatePlan(plan.spans, overview);
    let upload: TUploadKind = changed ? "range" : "none";
    if (draw.ids.data.byteLength > draw.buffer.byteLength) {
      draw.buffer.resize({ byteLength: Math.max(draw.ids.data.byteLength, draw.buffer.byteLength * 2) });
      draw.model.setAttributes({ graph_recordId: draw.buffer });
      draw.pointedAt = 0;
      changed = { byteOffset: 0, data: draw.ids.data };
      upload = "full";
    }
    if (changed) {
      draw.buffer.write(changed.data, changed.byteOffset);
      this.countUpload(changed.data.byteLength);
    }
    return { plan, draw, upload, lineRange: overview ? undefined : plan.lineRange };
  }

  private drawStockPaths(
    pass: RenderPass,
    { plan, draw, lineRange }: TPreparedStock,
    nativeRuns: readonly TDraw[][],
    frame: TSceneFrame,
    customDepth?: TCustomDepth
  ): void {
    this.setPathSources(draw, plan.sources);
    const vertices = draw.model.vertexCount;
    // A line needs just the first four strip vertices. Bound the extra submissions to two for the entire plan.
    const split =
      lineRange && lineRange.count * (vertices - 4) >= MIN_MIXED_CONNECTION_VERTICES ? lineRange : undefined;
    const submit = (first: number, end: number): void => {
      if (first === end) return;
      this.pointInstances(draw, first);
      this.drawInstances(pass, draw, frame, end - first);
    };
    let nativeIndex = 0;
    for (const command of plan.commands) {
      if (command.native) this.drawPrepared(pass, nativeRuns[nativeIndex++], frame, customDepth);
      else {
        const first = draw.ids.offset(command.first);
        const end = draw.ids.offset(command.first + command.count);
        if (split && first <= split.first && split.first + split.count <= end) {
          submit(first, split.first);
          draw.model.setVertexCount(4);
          submit(split.first, split.first + split.count);
          draw.model.setVertexCount(vertices);
          submit(split.first + split.count, end);
        } else submit(first, end);
      }
    }
  }

  private destroyStockDraw(): void {
    const draw = this.stockDraw;
    if (!draw) return;
    draw.model.destroy();
    if (this.ownsObjects()) {
      draw.model.vertexArray.destroy();
      draw.buffer.destroy();
    }
    this.stockDraw = undefined;
  }

  private mixedDrawFor(plan: TMixedPlan): TMixedDraw | undefined {
    const key = `${plan.effect ? "stock" : "plain"}|${plan.sources.length}`;
    if (this.mixedDisabled.has(key)) return undefined;
    let draw = this.mixedDraw;
    if (draw?.programKey !== key) {
      this.destroyMixedDraw();
      const buffer = this.createInstanceBuffer(1);
      const uniforms: TUniforms = { scene_opaquePass: 0 };
      const model = new Model(this.device, {
        id: "scene-mixed-connections",
        vs: createMixedPathVertex(plan.sources.length),
        fs: plan.effect ? STOCK_PATH_FRAGMENT : MIXED_PATH_FRAGMENT,
        plugins: [plan.effect ? createStockPathPlugin() : createPathPlugin(undefined)],
        topology: "triangle-strip",
        bufferLayout: PATH_LAYOUT,
        attributes: { graph_template: this.curveTemplate, graph_recordId: buffer },
        uniforms,
        parameters: { ...PASS_PARAMETERS.translucent, depthCompare: "always" },
        vertexCount: createCurveTemplate().length / 2,
        isInstanced: true,
        instanceCount: 0,
      });
      draw = {
        programKey: key,
        model,
        uniforms,
        buffer,
        ids: new PathDrawIds(),
        layout: PATH_LAYOUT,
        instanceBuffers: [{ name: PATH_LAYOUT[1].name, buffer }],
        pointedAt: 0,
      };
      this.mixedDraw = draw;
      if (!isLinked(model)) {
        this.mixedDisabled.add(key);
        this.destroyMixedDraw();
        return undefined;
      }
    }
    return draw;
  }

  private destroyMixedDraw(): void {
    const draw = this.mixedDraw;
    if (!draw) return;
    draw.model.destroy();
    if (this.ownsObjects()) {
      draw.model.vertexArray.destroy();
      draw.buffer.destroy();
    }
    this.mixedDraw = undefined;
  }

  private setPathSources(draw: TMixedDraw, sources: readonly TMixedSource[]): void {
    const bindings: Record<string, Texture> = this.bindings(PATH_TEXTURES);
    const widths = Array<number>(8).fill(10);
    const kinds = Array<number>(8).fill(16);
    sources.forEach(({ records, chords, group }, index) => {
      const { texture } = records;
      bindings[`graph_records${index}`] = texture;
      widths[index] = texture.width;
      kinds[index] =
        (isSplitPathSource(draw.splitSources ?? 0, index) ? 256 : 0) +
        chords +
        (group.effectActive ? 0 : 32) +
        (group.effect?.programKey === PULSE_PROGRAM ? 64 : 0) +
        (records.overview?.pieces === 2 ? 128 : 0);
    });
    draw.model.setBindings(bindings);
    draw.model.setVertexCount(draw.splitSources ? 18 : (Math.max(...sources.map(({ chords }) => chords)) + 1) * 2);
    Object.assign(draw.uniforms, {
      graph_extraWidth: 0,
      graph_widths0: widths.slice(0, 4),
      graph_widths1: widths.slice(4),
      graph_kinds0: kinds.slice(0, 4),
      graph_kinds1: kinds.slice(4),
    });
  }

  private beginMixedScene(
    frame: TSceneFrame,
    { plan, draw, target }: TPreparedMixed,
    nativeRuns: readonly TDraw[][]
  ): RenderPass {
    const clear = {
      clearColor: [0, 0, 0, 0] as [number, number, number, number],
      clearDepth: 0,
      clearStencil: false as const,
    };
    Object.assign(draw.uniforms, plan.effectUniforms);
    this.setPathSources(draw, plan.sources);
    const connectionPass = this.device.beginRenderPass({ ...clear, clearDepth: false, framebuffer: target });
    let nativeIndex = 0;
    for (const command of plan.commands) {
      if (command.native) this.drawPrepared(connectionPass, nativeRuns[nativeIndex++], frame);
      else {
        const first = draw.ids.offset(command.first);
        this.pointInstances(draw, first);
        this.drawInstances(connectionPass, draw, frame, draw.ids.offset(command.first + command.count) - first);
      }
    }
    connectionPass.end();
    // Count the lower blended draws before the fullscreen composite and the upper opaque pass.
    this.stats.translucentDrawCalls = this.stats.drawCalls;

    // An ordinary fullscreen draw replicates the lower premultiplied color into each default sample.
    const color = target.colorAttachments[0].texture;
    this.mixedComposite ??= new Model(this.device, {
      id: "scene-mixed-composite",
      vs: MIXED_COMPOSITE_VERTEX,
      fs: MIXED_COMPOSITE_FRAGMENT,
      parameters: { depthWriteEnabled: false, depthCompare: "always", blend: false },
      vertexCount: 3,
    });
    this.mixedComposite.setBindings({ graph_connectionColor: color });
    const pass = this.device.beginRenderPass(clear);
    this.mixedComposite.draw(pass);
    this.stats.drawCalls += 1;
    return pass;
  }

  /** `scene_dimColor` matches the colors parsed by the Canvas2D interpreter. */
  private setDimColor(color: string): void {
    if (color === this.dimColor) return;
    this.dimColor = color;
    const rgba = readColorRgba(color);
    this.dimFloats = rgba ? [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, 1] : NO_DIM_COLOR;
  }

  private frameDraw(batch: TBatch, first: number, count: number, curveDetail?: number): TDraw {
    let draw = this.frameDrawPool[this.frameDrawCount];
    if (!draw) {
      draw = { batch, first, count, curveDetail };
      this.frameDrawPool.push(draw);
    } else {
      draw.batch = batch;
      draw.first = first;
      draw.count = count;
      draw.curveDetail = curveDetail;
    }
    this.frameDrawCount++;
    return draw;
  }

  /** Culls physical resident ranges before the path address stream is gathered. */
  private appendVisibleDraws(draws: TDraw[], batch: TBatch, frame: TSceneFrame, first: number, count: number): void {
    if (count === 0) return;
    if (!batch.culling) {
      draws[this.cullingDrawCount++] = this.frameDraw(batch, first, count);
      return;
    }
    this.cullingOptions.curveChords =
      batch.curveChords && canCoarsenCurves(frame, batch.culling.untranslated) ? batch.curveChords : undefined;
    this.cullingBatch = batch;
    this.cullingDraws = draws;
    batch.culling.forEachRange(
      first,
      count,
      frame,
      Number(batch.uniforms.graph_extraWidth ?? 0),
      this.appendCulledRange,
      this.cullingOptions
    );
  }

  /**
   * Gather only after physical visibility, owner and ordering queries. Adjacent commands can then share a draw
   * even when their resident slots lie apart or run backwards; non-path commands remain ordering barriers.
   */
  private gatherPathDraws(passes: readonly TDraw[][]): TUploadKind {
    const batches: { batch: TBatch; ordered: { draws: TDraw[]; count: number } }[] = [];
    for (const draws of passes) {
      for (const draw of draws) {
        if (!draw.batch.pathRecords) continue;
        let ordered = this.gatheredDraws.get(draw.batch);
        if (!ordered) this.gatheredDraws.set(draw.batch, (ordered = { draws: [], count: 0 }));
        if (ordered.count === 0) batches.push({ batch: draw.batch, ordered });
        ordered.draws[ordered.count++] = draw;
      }
    }
    // Dormant lists must not retain commands whose pooled slots now belong to another batch.
    for (const [batch, ordered] of this.gatheredDraws) {
      if (ordered.count === 0) this.gatheredDraws.delete(batch);
    }
    let kind: TUploadKind = "none";
    for (const { batch, ordered } of batches) {
      const draws = ordered.draws;
      draws.length = ordered.count;
      ordered.count = 0;
      const records = batch.pathRecords;
      if (!records) continue;
      const { ids } = records;
      const group = records.overview && this.pathBatchGroups.get(batch);
      const overview = group && this.overviewSource(batch, group);
      let changed = ids.update(draws, overview ? [overview] : undefined);
      if (ids.data.byteLength > batch.buffer.byteLength) {
        batch.buffer.resize({ byteLength: Math.max(ids.data.byteLength, batch.buffer.byteLength * 2) });
        // A new GPU buffer needs the complete address list, including its unchanged prefix.
        changed = { byteOffset: 0, data: ids.data };
        batch.model.setAttributes({ graph_recordId: batch.buffer });
        batch.pointedAt = 0;
        if (batch.plain) {
          batch.plain.model.setAttributes({ graph_recordId: batch.buffer });
          batch.plain.pointedAt = 0;
        }
        kind = "full";
      }
      if (changed) {
        batch.buffer.write(changed.data, changed.byteOffset);
        this.countUpload(changed.data.byteLength);
        if (kind === "none") kind = "range";
      }
      let first = 0;
      for (const draw of draws) {
        draw.first = ids.offset(first);
        first += draw.count;
        draw.count = ids.offset(first) - draw.first;
      }
    }
    for (const draws of passes) {
      let last: TDraw | undefined;
      for (const draw of draws) {
        if (
          draw.batch.pathRecords &&
          last?.batch === draw.batch &&
          last.curveDetail === draw.curveDetail &&
          last.first + last.count === draw.first
        ) {
          last.count += draw.count;
          // Keep the reusable list's storage; only the surviving command issues a draw.
          draw.count = 0;
        } else {
          last = draw;
        }
      }
    }
    return kind;
  }

  private drawPrepared(
    pass: RenderPass,
    draws: readonly TDraw[],
    frame: TSceneFrame,
    customDepth?: TCustomDepth
  ): void {
    for (const draw of draws) {
      const { batch, first, count, curveDetail } = draw;
      if (count === 0) continue;
      if (customDepth) {
        const group = this.pathBatchGroups.get(batch);
        if (group?.strokeUnion) {
          if (!customDepth.withUnions) this.replayDepth(pass, frame, customDepth.unions, false);
          customDepth.withUnions = true;
          customDepth.unions.push(draw);
        } else if (group?.writesDepth && group.effectActive && customDepth.withUnions && customDepth.unions.length) {
          this.replayDepth(pass, frame, customDepth.opaque, true);
          customDepth.withUnions = false;
        }
      }
      if (batch.spriteAnimated && !this.frameAnimated) {
        this.frameAnimated = visibleSpriteAnimation(
          batch.ranges.data,
          first,
          count,
          this.table.data,
          this.styles.data,
          frame
        );
      }
      const target = batch.uniforms.graph_effectEnabled === 0 && batch.plain ? batch.plain : batch;
      this.pointInstances(target, first);
      this.drawInstances(pass, batch, frame, count, curveDetail, target.model);
    }
  }

  /** Custom fragment depths see only the opaque pass. The colour buffer keeps its painter order throughout. */
  private replayDepth(pass: RenderPass, frame: TSceneFrame, draws: readonly TDraw[], opaque: boolean): void {
    const depthOnly = this.device.beginRenderPass({
      framebuffer: pass.props.framebuffer,
      clearColor: false,
      clearDepth: opaque ? 0 : false,
      clearStencil: false,
      parameters: { colorMask: 0 },
    });
    if (opaque) this.gl.enable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    this.drawPrepared(depthOnly, draws, frame);
    if (opaque) this.gl.disable(GL_SAMPLE_ALPHA_TO_COVERAGE);
    depthOnly.end();
  }

  /** Draws `count` instances of the batch from where its attributes point; false when there are none. */
  private drawInstances(
    pass: RenderPass,
    batch: Pick<TBatch, "model" | "uniforms" | "curveChords" | "culling">,
    frame: TSceneFrame,
    count: number,
    curveDetail?: number,
    model = batch.model
  ): boolean {
    if (count === 0) return false;
    const viewport = [frame.width, frame.height];
    const camera = [frame.x, frame.y, frame.scale];
    const { uniforms } = batch;
    if (batch.curveChords) {
      const chords =
        curveDetail ??
        (batch.curveChords && canCoarsenCurves(frame, batch.culling?.untranslated === true) ? batch.curveChords : 16);
      uniforms.graph_curveStep = 16 / chords;
      model.setVertexCount((chords + 1) * 2);
    }
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
    model.setInstanceCount(count);
    model.draw(pass);
    this.stats.drawCalls += 1;
    this.stats.instances += count;
    return true;
  }

  /**
   * Uploads changed physical records. Paths interleave their payload and companion into one texture; other batches
   * keep separate attribute buffers (a re-sub of glyphs uploads their subs only).
   */
  private uploadPaths(frame: TSceneFrame): TUploadKind {
    let kind: TUploadKind = "none";
    for (const batch of this.allBatches()) {
      if (!batch.pathRecords || !batch.companion) continue;
      const uploaded = this.upload(batch);
      if (UPLOAD_COST[uploaded] > UPLOAD_COST[kind]) kind = uploaded;
      batch.culling?.update(batch.ranges.data, batch.companion.ranges.data, this.table, frame);
      if (batch.retainRanges) this.updateVisibility(batch, frame);
    }
    return kind;
  }

  private updateVisibility(batch: TBatch, frame: TSceneFrame): InstanceVisibility {
    const path = batch.companion?.kind === "elements";
    let visibility = this.visibility.get(batch);
    if (!visibility) {
      if (path) visibility = new InstanceVisibility("path");
      else if (batch.companion?.kind === "subs")
        visibility = new InstanceVisibility(batch === this.glyphs.translucent ? "glyph-blended" : "glyph");
      else if (batch.ranges.floats === TRIANGLE_FLOATS) visibility = new InstanceVisibility("triangle");
      else visibility = new InstanceVisibility("rect");
      this.visibility.set(batch, visibility);
    }
    const ranges = path && batch.companion ? batch.companion.ranges : batch.ranges;
    visibility.update(ranges, this.table.data, this.styles.data, frame, this.visibilityStateRevision);
    return visibility;
  }

  private upload(batch: TBatch): TUploadKind {
    const { companion } = batch;
    if (batch.pathRecords && companion) {
      const kind = this.uploadPathRecords(batch, batch.pathRecords, companion);
      // Moving a path between paint passes must not repack the other paths or invalidate their culling bounds.
      batch.ranges.retainLayout();
      companion.ranges.retainLayout();
      return kind;
    }
    const generations = (): number => batch.buffer.generation + (companion?.buffer?.generation ?? 0);
    const before = generations();
    let kind = this.uploadRanges(batch.ranges, batch.buffer, batch.culling, this.visibility.get(batch));
    if (companion?.buffer) {
      const companionKind = this.uploadRanges(companion.ranges, companion.buffer, batch.culling);
      if (UPLOAD_COST[companionKind] > UPLOAD_COST[kind]) kind = companionKind;
    }
    if (generations() !== before) {
      // A resize replaced a GPU buffer. Bind it now: luma would rebind it at offset 0 inside the next draw, after
      // pointInstances() set a run's offset.
      const attributes = Object.fromEntries(batch.instanceBuffers.map(({ name, buffer }) => [name, buffer]));
      batch.model.setAttributes(attributes);
      batch.pointedAt = 0;
      if (batch.revealed) {
        batch.revealed.model.setAttributes(attributes);
        batch.revealed.pointedAt = 0;
      }
    }
    if (batch.retainRanges) {
      batch.ranges.retainLayout();
      companion?.ranges.retainLayout();
    }
    return kind;
  }

  /** The CPU lists retain physical slots; only dirty records go to their one GPU texture. */
  private uploadPathRecords(batch: TBatch, records: TPathRecords, companion: TCompanion): TUploadKind {
    let payload = batch.ranges.takeUpload();
    const elements = companion.ranges.takeUpload();
    records.overview?.update(companion.ranges.data, elements);
    this.visibility.get(batch)?.invalidate(elements, companion.ranges);
    batch.culling?.invalidate(payload, batch.ranges.floats);
    batch.culling?.invalidate(elements, companion.ranges.floats);
    const count = batch.ranges.count;
    const texels = count * PATH_RECORD_TEXELS;
    if (count > 2 ** 24) throw new Error("Path record addresses must be exact float32 integers");
    if (texels > records.texture.width * records.texture.height) {
      const limit = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
      // Entire records share a row. Small groups start with at most one old instance-buffer's capacity; large
      // tables settle at a fixed width and grow vertically without moving the resident record addresses.
      const maxWidth = Math.floor(Math.min(4096, limit) / PATH_RECORD_TEXELS) * PATH_RECORD_TEXELS;
      const width = Math.min(
        maxWidth,
        Math.max(INITIAL_INSTANCES, 2 ** Math.ceil(Math.log2(count))) * PATH_RECORD_TEXELS
      );
      const rows = Math.ceil(texels / width);
      if (rows > limit) throw new Error("Path record table exceeds the device texture capacity");
      // Leave one row for local growth so the first new pieces do not reupload an entire multi-row texture.
      const reservedRows = rows > 1 ? rows + 1 : rows;
      const height = Math.min(
        limit,
        Math.max(reservedRows, records.texture.width === width ? records.texture.height * 2 : 1)
      );
      records.texture.destroy();
      records.texture = this.createTableTexture(width, height);
      batch.uniforms.graph_recordWidth = width;
      batch.model.setBindings(this.batchBindings(batch));
      batch.plain?.model.setBindings(this.batchBindings(batch));
      payload = { kind: "full" };
    }
    const writes = pathRecordWrites(batch.ranges.data, companion.ranges.data, payload, elements, records.texture.width);
    const texture = records.texture;
    if (writes.length > 1 && texture instanceof WEBGLTexture) {
      const gl = this.gl;
      // These RGBA32F rectangles are tightly packed. All regions of this texture share their unpack state.
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      withGLParameters(
        gl,
        { [gl.UNPACK_ALIGNMENT]: 1, [gl.UNPACK_ROW_LENGTH]: 0, [gl.UNPACK_IMAGE_HEIGHT]: 0, nocatch: false },
        () => {
          gl.bindTexture(gl.TEXTURE_2D, texture.handle);
          try {
            for (const { x, y, width, height, data } of writes) {
              gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, gl.RGBA, gl.FLOAT, data, 0);
              this.countUpload(data.byteLength);
            }
          } finally {
            gl.bindTexture(gl.TEXTURE_2D, null);
          }
        }
      );
    } else {
      for (const { data, ...region } of writes) {
        texture.writeData(data, region);
        this.countUpload(data.byteLength);
      }
    }
    return UPLOAD_COST[payload.kind] >= UPLOAD_COST[elements.kind] ? payload.kind : elements.kind;
  }

  private uploadRanges(
    ranges: InstanceRanges,
    buffer: DynamicBuffer,
    culling?: PathCulling,
    visibility?: InstanceVisibility
  ): TUploadKind {
    let upload = ranges.takeUpload();
    visibility?.invalidate(upload, ranges);
    const data = ranges.data;
    if (data.byteLength > buffer.byteLength) {
      buffer.resize({ byteLength: Math.max(data.byteLength, buffer.byteLength * 2) });
      upload = { kind: "full" };
    }
    culling?.invalidate(upload, ranges.floats);
    if (upload.kind === "full") {
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
    for (const batch of this.allBatches()) {
      const bindings = this.batchBindings(batch);
      batch.model.setBindings(bindings);
      batch.plain?.model.setBindings(bindings);
      batch.revealed?.model.setBindings(bindings);
    }
  }

  /** Rows of style texels without overrides and base colours (alpha -1) and without dim (r 0). */
  private noStyles(rows: number): Float32Array {
    const data = new Float32Array(rows * STYLE_ROW_TEXELS * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = -1;
    return data;
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
    return new WebGLSceneBackend(canvas, gl, device, listeners, createdAt, events);
  } catch (error) {
    listeners.abort();
    device?.getDefaultCanvasContext().destroy();
    device?.destroy();
    if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    throw error;
  }
};
