const LEGACY_MEMBERS = [
  "renderBody",
  "renderSchematicView",
  "renderMinimalisticBlock",
  "renderDetailedView",
  "renderStroke",
  "renderText",
  "render",
];
/** The anchor hook `getAnchorClass` replaced: a subclass that still defines it gets a development warning. */
const REMOVED_ANCHOR_MEMBER = "renderAnchor";

const checkedClasses = new WeakSet<object>();

/**
 * Development check, once per class (decision 1, review I10): a `Block` subclass that defines an imperative render
 * member draws nothing with it, unless it extends `LegacyCanvasBlock` (`static legacyCanvas`). A subclass that still
 * defines `renderAnchor`, legacy or not, is told that blocks never call it: `getAnchorClass` replaces it.
 */
export function warnLegacyMembers(klass: unknown, base: unknown): void {
  if (typeof klass !== "function" || checkedClasses.has(klass)) return;
  checkedClasses.add(klass);
  const legacyCanvas = Boolean((klass as { legacyCanvas?: boolean }).legacyCanvas);
  const found = new Set<string>();
  let rendersAnchors = false;
  let current: unknown = klass;
  while (typeof current === "function" && current !== base) {
    const prototype: unknown = current.prototype;
    if (typeof prototype === "object" && prototype !== null) {
      const owns = (member: string): boolean => Object.prototype.hasOwnProperty.call(prototype, member);
      if (owns(REMOVED_ANCHOR_MEMBER)) rendersAnchors = true;
      for (const member of legacyCanvas ? [] : LEGACY_MEMBERS) {
        if (owns(member)) found.add(member);
      }
    }
    current = Object.getPrototypeOf(current);
  }
  if (rendersAnchors) {
    console.warn(
      `${klass.name}: blocks no longer call ${REMOVED_ANCHOR_MEMBER}(), so it never creates their anchors. Override ` +
        "getAnchorClass(anchor) to return Anchor or a subclass instead, and declare the size and line width it " +
        "passed as the class's static SIZE and LINE_WIDTH (the block keys each anchor by its id)."
    );
  }
  if (found.size === 0) return;
  console.warn(
    `${klass.name}: blocks no longer draw imperatively, so ${[...found].join(", ")} never draw. Extend ` +
      "LegacyCanvasBlock (deprecated: drawn on the GraphLayer canvas under scene blocks) to keep them for one " +
      "release, or describe the look with the level methods minimalistic, schematic and detailed."
  );
}
