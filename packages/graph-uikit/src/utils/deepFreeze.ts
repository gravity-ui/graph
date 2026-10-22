/** Read-only view of plain data (objects of objects and primitives). */
export type TDeepReadonly<T> = T extends object ? { readonly [K in keyof T]: TDeepReadonly<T[K]> } : T;

/** Freezes plain data recursively, so shared defaults cannot be changed through one consumer. */
export function deepFreeze<T extends object>(value: T): TDeepReadonly<T> {
  for (const child of Object.values(value) as unknown[]) {
    if (typeof child === "object" && child !== null && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  // Every nested object is frozen now, which is what the read-only type describes.
  return Object.freeze(value) as unknown as TDeepReadonly<T>;
}
