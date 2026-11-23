import { SCENE_LEVELS, isOnLevel, levelMaskOf, levelMaskOfPrimitives } from "../../../../lib/scene/levels";
import type { Anchor } from "../index";

const warnedLevelFields = new WeakSet<object>();
const warnedExtents = new WeakSet<object>();
const warnedCreationLevels = new WeakSet<object>();

const checkedAnchors = new WeakSet<Anchor>();

/** An anchor's first update writes the element and its bounds. */
export function checkAnchorLook(anchor: Anchor): void {
  if (checkedAnchors.has(anchor)) return;
  const element = anchor.getSceneElementView();
  const bounds = element?.bounds;
  if (!element || !bounds) return;
  checkedAnchors.add(anchor);
  const klass = anchor.constructor as typeof Anchor;
  const name = klass.name || "An anchor class";
  const drawn = levelMaskOfPrimitives(element.primitives);
  const created = levelMaskOf(klass.CREATION_LEVELS);
  const missing = SCENE_LEVELS.filter((level) => isOnLevel(drawn, level) && !isOnLevel(created, level));
  if (drawn > 0 && missing.length > 0 && !warnedCreationLevels.has(klass)) {
    warnedCreationLevels.add(klass);
    console.warn(
      `${name}: its anchors draw on the ${missing.join(" and ")} level, but ${name}.CREATION_LEVELS omits it: ` +
        "blocks do not create them there, so the look shows there only after the camera visited another level. " +
        `Declare \`public static override CREATION_LEVELS = [${SCENE_LEVELS.map((l) => `"${l}"`).join(", ")}];\`.`
    );
  }
  for (const level of SCENE_LEVELS) {
    if (!Object.prototype.hasOwnProperty.call(anchor, level) || warnedLevelFields.has(klass)) continue;
    warnedLevelFields.add(klass);
    console.warn(
      `${name}: ${level} is an instance property, not a prototype method. Anchor level methods should be methods: ` +
        "a subclass cannot call super.<level>() from a property, and graph.scene.toImage() treats every subclass " +
        "as drawing on every level (Anchor.drawsOnLevel), so exports create temporary anchors for it."
    );
  }
  const reach = Math.max(-bounds.minX, -bounds.minY, bounds.maxX, bounds.maxY);
  if (reach <= klass.LOOK_EXTENT || warnedExtents.has(klass)) return;
  warnedExtents.add(klass);
  console.warn(
    `${name}: its anchors' look reaches ${reach} world units from their point, past ${name}.LOOK_EXTENT ` +
      `(${klass.LOOK_EXTENT}). graph.scene.toImage() searches that far around its rect for blocks without anchor ` +
      "components, so it can leave these anchors out. Declare the reach on the class: " +
      `\`public static override LOOK_EXTENT = ${Math.ceil(reach)};\`.`
  );
}
