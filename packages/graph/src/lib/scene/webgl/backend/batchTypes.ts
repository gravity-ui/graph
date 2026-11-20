import { Texture } from "@luma.gl/core";
import type { BufferLayout } from "@luma.gl/core";
import { DynamicBuffer, Model } from "@luma.gl/engine";

import type { PathEffect } from "../../effects/PathEffect";
import type { TSceneEffectScaleRange, TUniformTypes } from "../../effects/types";
import type { TSceneBackendStats } from "../../renderer/backendTypes";
import { InstanceRanges } from "../instances/InstanceRanges";
import { OverviewCurveGroups } from "../paths/overviewCurves";
import { PathCulling } from "../paths/pathCulling";
import { PathDrawIds } from "../paths/pathDrawIds";
import { OpaqueVisibility } from "../visibility/instanceVisibility";

export type TPass = "opaque" | "translucent";

export type TUploadKind = TSceneBackendStats["lastUploadKind"];

export type TUniforms = Record<string, number | readonly number[]>;

/** The tables a program samples. */
export type TTextureName = "scene_elements" | "scene_styles" | "scene_atlas";

export type TEffect = PathEffect<TUniformTypes, never>;

/** An instance attribute's pointer: shader location, float components, byte offset in the instance and stride. */
export type TPointer = { location: number; components: number; byteOffset: number; stride: number };

/** A per-instance buffer of a model: its name in the buffer layout and the buffer. */
export type TInstanceBuffer = { name: string; buffer: DynamicBuffer };

/**
 * A second per-instance list of a batch, kept in step with its instances (the same elements, steps, counts and order,
 * so each range lies at the same instance offset in both lists):
 * - `"elements"` (paths): each instance's element data, `PATH_ELEMENT_FLOATS` (element index, sub, part slot, scale
 *   bounds, level mask), uploaded together with the path payload to the record texture;
 * - `"subs"` (glyphs): each instance's sub, one float (`TEncodedGlyphs.subs`), so that a re-sub of unchanged texts
 *   writes and uploads this buffer only.
 */
export type TCompanion = { kind: "elements" | "subs"; ranges: InstanceRanges; buffer?: DynamicBuffer };

/** Paths keep one GPU copy of their payload and companion; the instance buffer holds only ordered addresses. */
export type TPathRecords = {
  texture: Texture;
  companion: TCompanion;
  ids: PathDrawIds;
  overview?: OverviewCurveGroups;
};

/** Per-element instances of one program and pass, their GPU buffer and the model that draws them. */
export type TBatch = {
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
export type TDraw = { batch: TBatch; first: number; count: number; curveDetail?: number };

export type TInstancePointerTarget = Pick<TBatch, "model" | "layout" | "instanceBuffers" | "pointers" | "pointedAt">;

/**
 * An element's translucent instances of one program, before they are cut into steps, and their companion data when the
 * batch keeps a companion list. Arrays of their own, never an encode's view (`TInstanceView`): `translucentWrites`
 * keeps them past later encodes.
 */
export type TTranslucentWrite = { batch: TBatch; instances: Float32Array; companion?: Float32Array };

/** The paths of one pass and one effect instance: a batch per vertex template. */
export type TPathGroup = TSceneEffectScaleRange & {
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
