/** Hooks the frame never calls for detached components. */
const FRAME_HOOKS = ["render", "willRender", "didRender", "willNotRender", "didIterate", "iterate", "viewportChanged"];

/**
 * Whether this is a development build. Keeps the literal `process.env.NODE_ENV !== "production"` expression so
 * bundlers can replace it; without `process` (bundler-less ESM) the access throws and the answer is "production".
 */
export function isDevelopmentBuild(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

const checked = new WeakSet<object>();

/**
 * Development check, once per class: warns when a detached class, or a class between it and the class that declared
 * it detached, defines hooks the frame never calls for detached components. Bases above the declaring class are
 * attached components whose hooks are not the subclass author's.
 */
export function warnDetachedFrameHooks(klass: unknown): void {
  if (typeof klass !== "function" || checked.has(klass)) return;
  checked.add(klass);
  const hooks = new Set<string>();
  let current: unknown = klass;
  while (typeof current === "function") {
    const prototype: unknown = current.prototype;
    if (typeof prototype === "object" && prototype !== null) {
      for (const hook of FRAME_HOOKS) {
        if (Object.prototype.hasOwnProperty.call(prototype, hook)) hooks.add(hook);
      }
    }
    if (Object.prototype.hasOwnProperty.call(current, "detached")) break;
    current = Object.getPrototypeOf(current);
  }
  if (!hooks.size) return;
  console.warn(
    `${klass.name || "A component"} is detached: the frame never calls its ${[...hooks].join(", ")}. ` +
      'Declare "static detached = false" on it to keep it in the frame walk, or move this work to updates ' +
      "(propsChanged, stateChanged, willIterate) or to batch hooks such as afterRender."
  );
}
