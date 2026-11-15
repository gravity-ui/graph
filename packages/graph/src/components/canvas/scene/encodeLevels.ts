import { ALL_LEVELS_MASK, LEVEL_BIT, SCENE_LEVELS } from "../../../lib/scene/levels";
import type { TScenePrimitive } from "../../../lib/scene/types";
import type { TSceneLevel } from "../../../services/scene/types";

import { samePrimitive } from "./viewData";

export type TLevelMethods<TView> = Partial<Record<TSceneLevel, (view: TView) => readonly TScenePrimitive[]>>;

type TEntry = { primitive: TScenePrimitive; mask: number };

/** The first entry at or after `from` that this list has not taken yet and that holds `primitive`, by `match`. */
function findEntry(
  entries: readonly TEntry[],
  taken: readonly boolean[],
  from: number,
  match: (entry: TScenePrimitive) => boolean
): number {
  for (let i = from; i < entries.length; i++) {
    if (!taken[i] && match(entries[i].primitive)) return i;
  }
  return -1;
}

/**
 * Adds one list of primitives to the merged entries so that the list and every list merged before stay in order: an
 * entry of the same primitive object at or after the cursor that this list has not taken yet gets the list's bits,
 * else such an entry of a primitive equal to it by value (a level method that calls another one returns fresh copies,
 * as a `Block` subclass's `detailed` that calls its uncached `schematic` does); any other primitive is inserted at the
 * cursor.
 */
function mergeList(entries: readonly TEntry[], list: readonly TScenePrimitive[], mask: number): TEntry[] {
  const result = [...entries];
  const taken = result.map(() => false);
  let cursor = 0;
  for (const primitive of list) {
    let found = findEntry(result, taken, cursor, (entry) => entry === primitive);
    if (found < 0) found = findEntry(result, taken, cursor, (entry) => samePrimitive(entry, primitive));
    if (found >= 0) {
      result[found] = { primitive: result[found].primitive, mask: result[found].mask + mask };
      taken[found] = true;
      cursor = found + 1;
    } else {
      result.splice(cursor, 0, { primitive, mask });
      taken.splice(cursor, 0, true);
      cursor++;
    }
  }
  return result;
}

/**
 * Runs the level methods once each and merges their primitives into one list for one scene element (spec §6): every
 * level stays encoded, and a primitive carries the mask of the levels that returned it. A level without its own method
 * takes another level's list (schematic, minimalistic, then detailed); one list returned by several levels is merged
 * once. A primitive shown on every level keeps its object and gets no mask; the others are copies with `levelMask`. A
 * `levelMask` a method set itself is reported through `report` and replaced (review M3).
 */
export function encodeLevels<TView>(
  methods: TLevelMethods<TView>,
  view: TView,
  report?: (level: TSceneLevel) => void
): TScenePrimitive[] {
  const minimalistic = runLevel(methods, "minimalistic", view, report);
  const schematic = runLevel(methods, "schematic", view, report);
  const detailed = runLevel(methods, "detailed", view, report);
  // A level without its own method takes the schematic list, else the minimalistic one, else the detailed one.
  const fallback = schematic ?? minimalistic ?? detailed;
  if (!fallback) return [];
  const lists = [minimalistic ?? fallback, schematic ?? fallback, detailed ?? fallback];
  if (lists[0] === lists[1] && lists[1] === lists[2]) {
    // One list on every level (a look the levels share): nothing to merge, and no entry objects (Task 17f: the merge
    // and its maps allocated ~15 MB per status change of 10,000 such blocks).
    return lists[0].map(unmasked);
  }
  let entries: TEntry[] = [];
  // Each distinct list once, with the bits of every level that takes it, in the order the levels first take them.
  for (let index = 0; index < lists.length; index++) {
    const list = lists[index];
    if (lists.indexOf(list) !== index) continue;
    let mask = 0;
    for (let level = index; level < lists.length; level++) {
      if (lists[level] === list) mask += LEVEL_BIT[SCENE_LEVELS[level]];
    }
    // Merged into nothing, a list takes every entry in its own order (what mergeList would insert one by one).
    entries = entries.length === 0 ? list.map((primitive) => ({ primitive, mask })) : mergeList(entries, list, mask);
  }
  return entries.map(({ primitive, mask }) =>
    mask === ALL_LEVELS_MASK ? unmasked(primitive) : { ...primitive, levelMask: mask }
  );
}

/** A primitive on every level: its own object, or a copy without the `levelMask` a level method set. */
function unmasked(primitive: TScenePrimitive): TScenePrimitive {
  return primitive.levelMask === undefined ? primitive : { ...primitive, levelMask: undefined };
}

/** One level method's list (undefined without the method); a `levelMask` in it is reported. */
function runLevel<TView>(
  methods: TLevelMethods<TView>,
  level: TSceneLevel,
  view: TView,
  report: ((level: TSceneLevel) => void) | undefined
): readonly TScenePrimitive[] | undefined {
  const method = methods[level];
  if (!method) return undefined;
  const list = method(view);
  if (report && list.some((primitive) => primitive.levelMask !== undefined)) report(level);
  return list;
}
