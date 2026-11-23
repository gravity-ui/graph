import type { ReadonlySignal } from "@preact/signals-core";

/**
 * Reads a signal so that the computed or effect running this call depends on it, when the value itself is not needed
 * (`@typescript-eslint/no-unused-expressions` rejects a bare `signal.value;`).
 */
export function track(source: ReadonlySignal<unknown>): unknown {
  return source.value;
}
