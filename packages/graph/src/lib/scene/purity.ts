import { isDevelopmentBuild } from "../detachedWarning";

/** The class whose level methods run now; undefined outside level methods. */
let owner: string | undefined;

const warned = new Set<string>();

/** Runs the level methods of a component class; reads of impure inputs inside warn in development builds. */
export function runLevelMethods<T>(name: string, run: () => T): T {
  const previous = owner;
  owner = name;
  try {
    return run();
  } finally {
    owner = previous;
  }
}

/** Called by inputs that level methods must not read (the camera); warns once per class and input. */
export function warnIfInLevelMethod(input: string): void {
  if (owner === undefined || !isDevelopmentBuild()) return;
  const key = `${owner}\u0000${input}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `${owner}: a level method read ${input}. Level methods are pure functions of their view data: read inputs in ` +
      "getViewData(), and use camera-aware sizes and minScale / maxScale for zoom."
  );
}
