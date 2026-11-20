import type { TStepInstances } from "../instances/InstanceRanges";

import { SCENE_DEPTH } from "./depth";

/**
 * The element keys of the translucent order: the root's depth key times the sub-order width, plus the sub base of a
 * child element (`WebGLSceneBackend.orderKeyOf`). They lie below the depth indices at every width.
 */
export const ELEMENT_KEYS = 2 ** SCENE_DEPTH.INDEX_BITS;

/**
 * The steps an element can have at a sub-order width: one per change of program in primitive order, so at most one
 * per primitive, or two for a path (its line pieces, then its curve pieces); an element has at most 2^subBits
 * primitives.
 */
export function maxStepsOf(subBits: number): number {
  return 2 * 2 ** subBits;
}

/**
 * The float of a rect instance, and of a path instance's element data, that holds the primitive's `sub`. A glyph's sub
 * is the only float of its instance in the glyph sub list (`TEncodedGlyphs.subs`).
 */
export const SUB_FLOAT = 1;

/**
 * One program's translucent instances of one element: `subs` holds each instance's `sub` at float `subFloat` (default
 * `SUB_FLOAT`) of its `floats` floats.
 */
export type TElementSubs = { subs: Float32Array; floats: number; subFloat?: number };

/** Consecutive instances of one element and one program that share a step. */
export type TStepChunk = { step: number; first: number; count: number };

/**
 * The local steps of one element's translucent instances. The instances of all its programs are merged in primitive
 * order (`sub`; on a tie, which only the line and curve pieces of one path share, the lower source first), and a new
 * step starts at each change of program. Within a step the primitive order is kept. Returns each source's chunks, in
 * the order of its instances. Example: body rects (step 0), title glyphs (step 1), anchor rects (step 2).
 */
export function elementSteps(sources: readonly TElementSubs[]): TStepChunk[][] {
  const chunks = sources.map((): TStepChunk[] => []);
  const next = sources.map(() => 0);
  const subAt = (source: number, index: number): number => {
    const { subs, floats, subFloat = SUB_FLOAT } = sources[source];
    return subs[index * floats + subFloat];
  };
  const countOf = (source: number): number => sources[source].subs.length / sources[source].floats;
  let step = -1;
  let previous = -1;
  for (;;) {
    let best = -1;
    let bestSub = Infinity;
    for (let source = 0; source < sources.length; source++) {
      if (next[source] < countOf(source) && subAt(source, next[source]) < bestSub) {
        best = source;
        bestSub = subAt(source, next[source]);
      }
    }
    if (best < 0) return chunks;
    const first = next[best];
    while (next[best] < countOf(best) && subAt(best, next[best]) === bestSub) next[best]++;
    const count = next[best] - first;
    if (best === previous) {
      chunks[best][chunks[best].length - 1].count += count;
    } else {
      step++;
      previous = best;
      chunks[best].push({ step, first, count });
    }
  }
}

/** The instances of `data` (`floats` per instance) cut into the chunks of `elementSteps`. */
export function splitSteps(data: Float32Array, floats: number, chunks: readonly TStepChunk[]): TStepInstances[] {
  return chunks.map(({ step, first, count }) => ({
    step,
    instances: data.subarray(first * floats, (first + count) * floats),
  }));
}
