import type { TTileRect } from "../../lib/culling/TileIndex";
import type { SceneStore } from "../../lib/scene/SceneStore";
import type { TSceneElement, TSceneStyle } from "../../lib/scene/types";

import { outlinePaths } from "./BlockOutlines";
import { blockOutlineShape } from "./blockOutlineShape";
import type { TSceneLevel } from "./types";

/** Draw order for an export. The outline follows its owner's last visible child at the export's LOD and scale. */
export function exportBlockOutlines(
  store: SceneStore,
  rect: TTileRect,
  level: TSceneLevel,
  scale: number,
  styles: readonly TSceneStyle[],
  childRows: ReadonlyMap<string, number>,
  isLiveOutline: (element: TSceneElement) => boolean
): readonly TSceneElement[] {
  // The export may enable an outline that has no live element in the index. A Canvas miter reaches up to five stroke widths.
  const pad =
    styles.reduce(
      (width, style) => Math.max(width, (style.outline?.width ?? 0) + 2 * (style.outline?.halo?.width ?? 0)),
      0
    ) * 5;
  const crop =
    pad > 0 ? { minX: rect.minX - pad, minY: rect.minY - pad, maxX: rect.maxX + pad, maxY: rect.maxY + pad } : rect;
  const found = store.query(crop, level, styles);
  if (!pad && !childRows.size && !found.some(isLiveOutline)) return found;

  const result: TSceneElement[] = [];
  const styleOf = (el: TSceneElement) => styles[childRows.get(el.id) ?? el.styleId];
  function appendOutline(owner: TSceneElement | undefined) {
    if (owner?.entityType !== "block") return;
    const stroke = styleOf(owner)?.outline;
    if (!stroke || !(stroke.width > 0)) return;
    const anchors = store.childrenOf(owner.id).filter((el) => el.entityType === "anchor" && !store.isDrawnHidden(el));
    const shape = blockOutlineShape(owner, anchors, level, scale, styleOf);
    if (shape) result.push({ ...owner, primitives: outlinePaths(shape, stroke) });
  }

  let owner: TSceneElement | undefined;
  for (const element of found) {
    const root = store.rootOf(element);
    if (owner !== root) {
      appendOutline(owner);
      owner = root;
    }
    if (isLiveOutline(element)) continue;
    const styleId = childRows.get(element.id);
    result.push(styleId === undefined ? element : { ...element, styleId });
  }
  appendOutline(owner);
  return result;
}
