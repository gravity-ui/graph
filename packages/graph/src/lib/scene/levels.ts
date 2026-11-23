import type { TSceneLevel } from "../../services/scene/types";

import type { TScenePrimitive } from "./types";

/** The scene levels, least detailed first. */
export const SCENE_LEVELS: readonly TSceneLevel[] = Object.freeze(["minimalistic", "schematic", "detailed"] as const);

/** The bit of each level in a primitive's `levelMask`. */
export const LEVEL_BIT: Readonly<Record<TSceneLevel, number>> = Object.freeze({
  minimalistic: 1,
  schematic: 2,
  detailed: 4,
});

/** Every level: how a primitive without a `levelMask` is shown. */
export const ALL_LEVELS_MASK = 7;

/** The mask of a set of levels. */
export function levelMaskOf(levels: Iterable<TSceneLevel>): number {
  let mask = 0;
  for (const level of new Set(levels)) mask += LEVEL_BIT[level];
  return mask;
}

/** Whether a mask includes a level; no mask or no level means every level. Arithmetic only (no-bitwise). */
export function isOnLevel(mask: number | undefined, level: TSceneLevel | undefined): boolean {
  if (mask === undefined || level === undefined) return true;
  return Math.floor(mask / LEVEL_BIT[level]) % 2 === 1;
}

/** Whether every encountered primitive mask has the same visibility on the two levels. */
export function sameLevelVisibility(
  masks: ReadonlySet<number>,
  before: TSceneLevel | undefined,
  after: TSceneLevel | undefined
): boolean {
  if (before === after) return true;
  for (const mask of masks) {
    if (isOnLevel(mask, before) !== isOnLevel(mask, after)) return false;
  }
  return true;
}

/** The levels at least one of the primitives shows on, as a level mask; 0 for no primitives. */
export function levelMaskOfPrimitives(primitives: readonly TScenePrimitive[]): number {
  let mask = 0;
  for (const level of SCENE_LEVELS) {
    if (primitives.some((primitive) => isOnLevel(primitive.levelMask, level))) mask += LEVEL_BIT[level];
  }
  return mask;
}

/** The levels of either mask, as one mask (arithmetic only: no-bitwise). */
export function unionLevelMasks(a: number, b: number): number {
  let mask = 0;
  for (const level of SCENE_LEVELS) {
    if (isOnLevel(a, level) || isOnLevel(b, level)) mask += LEVEL_BIT[level];
  }
  return mask;
}
