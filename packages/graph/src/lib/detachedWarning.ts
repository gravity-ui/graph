/** Hooks the frame never calls for retained components. */
const FRAME_HOOKS = ["render", "willRender", "didRender", "willNotRender", "didIterate", "iterate", "viewportChanged"];

const checked = new WeakSet<object>();

/**
 * Development check, once per class: warns when a retained class, or a class between it and the class that declared
 * it retained, defines hooks the frame never calls for retained components. Bases above the declaring class are
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
    if (Object.prototype.hasOwnProperty.call(current, "mode")) break;
    current = Object.getPrototypeOf(current);
  }
  if (!hooks.size) return;
  console.warn(
    `${klass.name || "A component"} is retained: the frame never calls its ${[...hooks].join(", ")}. ` +
      'Declare `static override readonly mode = "immediate";` on it to keep it in the frame walk, or move this work ' +
      "to updates (propsChanged, stateChanged, willIterate) or to batch hooks such as afterRender."
  );
}
