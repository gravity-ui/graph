import cloneDeep from "lodash/cloneDeep";

/** Copy a shallow patch, preserving current fields when a value is undefined. */
export function mergeDefined<T extends object>(current: T, patch?: Partial<T>): T {
  const result = cloneDeep(current);
  if (patch) {
    const changes = cloneDeep(patch);
    for (const key in changes) {
      const value = changes[key];
      if (value !== undefined) result[key] = value;
    }
  }
  return result;
}
