import { isDevelopmentBuild } from "../../../lib/detachedWarning";

const GEOMETRY_AND_PATHS =
  "createPath(geometry) / createArrowPath(geometry) of a Path2DLine subclass (static line), or a custom static geometry";
const STYLES = "style() / styleArrow() of a Path2DLine subclass";
const GROUP = "getGroup() of a Path2DLine subclass";
const STROKES = "getStroke(state) / getArrowStroke(state) of the line class";
const BOUNDS = "bounds come from static geometry; getBounds() of a Path2DLine subclass for custom shapes";

/** Methods `BlockConnection` no longer calls, with the place their work moves to. */
const REMOVED_METHODS: Readonly<Record<string, string>> = {
  createPath: GEOMETRY_AND_PATHS,
  createArrowPath: GEOMETRY_AND_PATHS,
  getPath: GEOMETRY_AND_PATHS,
  getArrowPath: GEOMETRY_AND_PATHS,
  generatePath: GEOMETRY_AND_PATHS,
  getArrowPoints: GEOMETRY_AND_PATHS,
  style: STYLES,
  styleArrow: STYLES,
  setRenderStyles: STYLES,
  getClassName: GROUP,
  getStrokeColor: STROKES,
  getStroke: STROKES,
  getAppearance: STROKES,
  getArrowAppearance: STROKES,
  isAnimated: STROKES,
  collectBBoxPoints: BOUNDS,
};

const checked = new WeakSet<object>();

/**
 * Development check, once per class: warns when a class below `base` overrides a method that `base` no longer calls.
 */
export function warnRemovedConnectionMethods(klass: unknown, base: abstract new (...args: never[]) => unknown): void {
  if (typeof klass !== "function" || checked.has(klass) || !isDevelopmentBuild()) return;
  checked.add(klass);
  const found: string[] = [];
  let current: unknown = klass;
  while (typeof current === "function" && current !== base) {
    const prototype: unknown = current.prototype;
    if (typeof prototype === "object" && prototype !== null) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (Object.prototype.hasOwnProperty.call(REMOVED_METHODS, name) && !found.includes(name)) found.push(name);
      }
    }
    current = Object.getPrototypeOf(current);
  }
  if (!found.length) return;
  const moves = found.map((name) => `${name} → ${REMOVED_METHODS[name]}`).join("; ");
  console.warn(
    `[@gravity-ui/graph] ${klass.name || "A connection class"} overrides ${found.join(", ")}, ` +
      `which BlockConnection no longer calls. Move them: ${moves}. ` +
      'See the v2 migration guide, "Connection lines and geometry".'
  );
}
