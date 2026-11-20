import type { Framebuffer } from "@luma.gl/core";
import { DynamicBuffer } from "@luma.gl/engine";

import { toPathEffect } from "../../effects/PathEffect";
import { dashFlow, pulse } from "../../effects/library";
import { InstanceRanges } from "../instances/InstanceRanges";
import { SUB_FLOAT } from "../order/translucentSteps";
import { MIXED_PATH_SOURCE_STRIDE, comparePathOrder } from "../paths/mixedPathPlan";
import type { TLowerPathCommand, TMixedPathRange, TNativePathRange, TSubpixelPathWidth } from "../paths/mixedPathPlan";
import { PathDrawIds } from "../paths/pathDrawIds";
import type { TPathDrawGroups, TPathDrawSpan } from "../paths/pathDrawIds";
import type { TMixedResize, TPathPlanInput } from "../paths/pathPlanInputs";
import { PATH_ELEMENT_FLOATS } from "../paths/pathRecords";

import type {
  TBatch,
  TDraw,
  TEffect,
  TInstancePointerTarget,
  TPathGroup,
  TPathRecords,
  TUniforms,
  TUploadKind,
} from "./batchTypes";

/** Only when an active effect sets fragment depth: retain native union draws so a later piece can reclaim its samples. */
export type TCustomDepth = { opaque: readonly TDraw[]; unions: TDraw[]; withUnions: boolean };

export const MIXED_EFFECT_PROGRAMS = new Set([toPathEffect(dashFlow).programKey, toPathEffect(pulse).programKey]);

export const PULSE_PROGRAM = toPathEffect(pulse).programKey;

// The extra pass pays off on the measured large fit views. At around 600k vertices the shared pass wins.
export const MIN_MIXED_CONNECTION_VERTICES = 1_500_000;

export type TMixedSource = { records: TPathRecords; chords: number; group: TPathGroup; tie: number };

export function mixedAddressOrder(sources: readonly TMixedSource[], table: Float32Array) {
  const elements = sources.map((source) => source.records.companion.ranges.data);
  const position = (address: number) => {
    const source = Math.floor(address / MIXED_PATH_SOURCE_STRIDE);
    const first = address % MIXED_PATH_SOURCE_STRIDE;
    const slot = first * PATH_ELEMENT_FLOATS;
    const data = elements[source];
    return { key: table[data[slot] * 4 + 2], sub: data[slot + SUB_FLOAT], tie: sources[source].tie, first };
  };
  return (left: number, right: number) => {
    const a = position(left);
    const b = position(right);
    return a.key >= 0 && b.key >= 0 ? comparePathOrder(a, b) : NaN;
  };
}

function enteredRetainedBatch(ranges: InstanceRanges, revision: number, id: string): boolean {
  const changes = ranges.retainedChangesSince(revision);
  return changes?.length === 1 && changes[0].id === id && changes[0].previous.length === 0;
}

export function matchesLayout(
  edit: TMixedResize<TBatch>,
  previous: readonly number[],
  current: readonly number[],
  at: number
): boolean {
  if (edit.layoutAfter !== current[at] || edit.companionAfter !== current[at + 1]) return false;
  if (edit.layoutBefore !== undefined)
    return edit.layoutBefore === previous[at] && edit.companionBefore === previous[at + 1];
  // A new run has no input record in the old batch. Its retained history must certify the missing side.
  const companion = edit.batch.companion;
  return Boolean(
    edit.membership &&
      companion &&
      enteredRetainedBatch(edit.batch.ranges, previous[at], edit.membership.id) &&
      enteredRetainedBatch(companion.ranges, previous[at + 1], edit.membership.id)
  );
}

export type TMixedPathWork = {
  stock?: TPathGroup;
  sources: TMixedSource[];
  ranges: (TMixedPathRange | TNativePathRange<TBatch>)[];
  widths: TSubpixelPathWidth;
  customEffect?: TEffect;
  customKey?: number;
};

export type TMixedPage = {
  first: number;
  end: number;
  source: number;
  tie: number;
  depth: number;
  ranges: TMixedPathWork["ranges"];
  widths: TSubpixelPathWidth;
};

export type TMixedPlan = {
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

/** A surviving piece of the same stroke must keep its width represented on the side without the edited run. */
export function hasVisibleStroke(plan: TMixedPlan, draws: readonly TDraw[], stroke: TPathPlanInput<TBatch>): boolean {
  return (
    plan.sources.some(({ records }) => records === stroke.batch.pathRecords) &&
    draws.some(
      ({ batch, first, count }) =>
        batch === stroke.batch && first < stroke.first + stroke.count && first + count > stroke.first
    )
  );
}

export type TMixedDraw = TInstancePointerTarget & {
  programKey: string;
  uniforms: TUniforms;
  buffer: DynamicBuffer;
  ids: PathDrawIds;
  splitSources?: number;
};

export type TPreparedMixed = { plan: TMixedPlan; draw: TMixedDraw; target: Framebuffer; upload: TUploadKind };

export type TStockPlan = Pick<TMixedPlan, "sources" | "spans" | "commands"> & {
  spanGroups?: TPathDrawGroups;
  lineRange?: TPathDrawSpan;
};

export type TPreparedStock = { plan: TStockPlan; draw: TMixedDraw; upload: TUploadKind; lineRange?: TPathDrawSpan };

export function stockGroup(group: TPathGroup | undefined): boolean {
  return Boolean(
    group &&
      !group.strokeUnion &&
      !group.fallback &&
      (!group.effect || (group.effect.extraWidth === 0 && MIXED_EFFECT_PROGRAMS.has(group.effect.programKey)))
  );
}

/** In the shared pass an inactive custom effect already draws as a plain stroke. */
export function nativeStockGroup(group: TPathGroup | undefined): boolean {
  return stockGroup(group) || Boolean(group?.effect && !group.fallback && !group.effectActive);
}

export function hasEffectDepthWrites(effect?: TEffect): boolean {
  return /\bgl_FragDepth\b/.test(effect?.fragment ?? "");
}

export function sameDraws(left: readonly TDraw[], right: readonly TDraw[]): boolean {
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
