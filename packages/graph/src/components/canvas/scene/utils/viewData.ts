import type { TScenePrimitive } from "../../../../lib/scene/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/** The own enumerable string keys of a plain object (what `Object.keys` returns), counted without an array. */
function countKeys(target: Record<string, unknown>): number {
  let count = 0;
  for (const key in target) if (hasOwn(target, key)) count++;
  return count;
}

/**
 * Equal by identity, or for plain objects and arrays by their entries, down to `depth` levels. Allocates nothing
 * (key arrays and callbacks per compare were ~8 MB of every bulk status change of 10,000 blocks).
 */
function sameData(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) if (!sameData(a[index], b[index], depth - 1)) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    let keys = 0;
    for (const key in a) {
      if (!hasOwn(a, key)) continue;
      keys++;
      if (!hasOwn(b, key) || !sameData(a[key], b[key], depth - 1)) return false;
    }
    return keys === countKeys(b);
  }
  return false;
}

/**
 * Whether two view data objects are equal: the same keys, each value equal by identity or, for plain objects and
 * arrays (`meta`, anchors), one level deep. A consumer that rebuilds `meta` on every update then causes no re-run.
 */
export function sameView(a: object, b: object): boolean {
  return sameData(a, b, 2);
}

/**
 * Whether two primitive lists draw the same: each primitive equal by value through three levels (a border's
 * camera-aware width, a radius list), typed arrays and `Path2D` by identity. Equal output keeps the written array, so
 * nothing is re-encoded.
 */
export function samePrimitives(a: readonly TScenePrimitive[], b: readonly TScenePrimitive[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (!samePrimitive(a[index], b[index])) return false;
  return true;
}

/** Whether two primitives draw the same, by `samePrimitives`' rule. */
export function samePrimitive(a: TScenePrimitive, b: TScenePrimitive): boolean {
  return sameData(a, b, 3);
}
