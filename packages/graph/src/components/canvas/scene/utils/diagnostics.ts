import { runLevelMethods } from "../../../../lib/scene/purity";
import type { TScenePrimitive, TSceneSize } from "../../../../lib/scene/types";
import type { TSceneLevel } from "../../../../services/scene/types";

import { declaredHitMask, encodeLevels } from "./encodeLevels";
import type { TLevelMethods } from "./encodeLevels";

const reported = new Set<string>();

/** Report a problem at most once per component class name and kind. */
function reportOnce(owner: string, kind: string, message: string, level: "warn" | "error"): void {
  const key = `${owner}\u0000${kind}`;
  if (reported.has(key)) return;
  reported.add(key);
  if (level === "error") console.error(message);
  else console.warn(message);
}

/** A missing parent prevents the element from being written in every build. */
export function reportMissingParent(owner: string, parent: string): void {
  reportOnce(owner, "parent", `${owner}: its parent element ${parent} is not in the scene`, "error");
}

export function reportMissingSuper(owner: string): void {
  reportOnce(
    owner,
    "willMount",
    `${owner}.willMount() did not call super.willMount(): its scene element is never written`,
    "error"
  );
}

export function reportElementIdConflict(owner: string, id: string, holder: object | undefined): void {
  const name = holder?.constructor.name ?? "another writer";
  reportOnce(
    owner,
    `id\u0000${name}`,
    `${owner}: scene element ${JSON.stringify(id)} already belongs to ${name}; ${owner} does not write it. ` +
      "Give each component its own element id (override createSceneElementId() when entity ids repeat).",
    "error"
  );
}

export function checkLookLessHitBox(
  klass: { readonly name: string; readonly hitLevels?: readonly TSceneLevel[] },
  written: { readonly parent?: string; readonly primitives: readonly TScenePrimitive[] } | undefined,
  hasHitBox: boolean | undefined
): void {
  if (
    !hasHitBox ||
    written?.parent === undefined ||
    written.primitives.length > 0 ||
    declaredHitMask(klass) !== undefined
  ) {
    return;
  }
  reportOnce(
    klass.name,
    "hitLevels",
    `${klass.name}: a look-less child with a hit box is hit only on the levels it declares; declare them ` +
      '(`public static override hitLevels = ["schematic"];`) where the look it stands for is shown',
    "warn"
  );
}

export function encodeLevelsWithDiagnostics(owner: string, methods: TLevelMethods): TScenePrimitive[] {
  return runLevelMethods(owner, () =>
    encodeLevels(methods, (level) =>
      reportOnce(
        owner,
        "levelMask",
        `${owner}.${level}() returned a primitive with levelMask; the scene sets it from the level method`,
        "error"
      )
    )
  );
}

function isUnboundedPx(size: TSceneSize | undefined): boolean {
  return typeof size === "object" && "px" in size && size.maxWorld === undefined;
}

/** The camera-aware stroke width of a primitive. */
function strokeWidthOf(primitive: TScenePrimitive): TSceneSize | undefined {
  switch (primitive.kind) {
    case "rect":
    case "circle":
      return primitive.border?.width;
    case "path":
      return primitive.stroke.width;
    case "polygon":
      return primitive.stroke?.width;
    default:
      return undefined;
  }
}

/**
 * Whether a primitive's bounds take its size at the minimum camera scale: a `{ px }` stroke width without `maxWorld`,
 * or a heightless camera-aware text without `maxWorld` (a text with a height is clipped to its box, which bounds it).
 */
function hasUnboundedSize(primitive: TScenePrimitive): boolean {
  if (primitive.kind === "text") {
    const mode = primitive.cameraAware;
    const unbounded = mode === true || (typeof mode === "object" && mode.maxWorld === undefined);
    return unbounded && primitive.height === undefined;
  }
  return isUnboundedPx(strokeWidthOf(primitive));
}

/**
 * Development checks of an element's primitives. The primitive count has no limit of its own:
 * the depth's sub-order width follows the widest element (`watchSceneLimits` names the scene that outgrows the depth).
 */
export function checkScenePrimitives(owner: string, primitives: readonly TScenePrimitive[] | undefined): void {
  if (!primitives) return;
  if (primitives.some((primitive) => primitive.part === "none")) {
    reportOnce(owner, "none", `${owner}: the part name "none" is reserved for primitives without a part`, "error");
  }
  if (primitives.some(hasUnboundedSize)) {
    reportOnce(
      owner,
      "px",
      `${owner}: a stroke width { px } without maxWorld, or a camera-aware text without a height and without ` +
        "maxWorld; its bounds take its size at the minimum camera scale",
      "warn"
    );
  }
}
