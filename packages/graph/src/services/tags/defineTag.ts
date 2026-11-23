import type { TTag } from "./types";

let nextTagId = 1;

/**
 * Defines a tag. A tag with a value type carries a value per entity, read by rules through a function. Keep the
 * number of distinct values small (a colleague's colour, a status from an enum): each value is part of the style
 * signature.
 */
export function defineTag<V = true>(name: string): TTag<V> {
  return Object.freeze({ id: nextTagId++, name });
}
