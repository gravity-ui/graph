import { isDevelopmentBuild } from "../detachedWarning";

import type { SceneStore } from "./SceneStore";
import type { TSceneElement, TSceneStyle } from "./types";
import { DEPTH_INDICES, SCENE_DEPTH, subBitsFor } from "./webgl/depth";
import { PART_SLOTS } from "./webgl/tables";

const MAX_PARTS = PART_SLOTS - 1;
const MAX_BANDS = 2 ** SCENE_DEPTH.BAND_BITS;

/**
 * Development errors for the scene limits (spec §5.4), once per limit and store, so a limit is named before the WebGL
 * renderer falls back: distinct parts in the scene (named by primitives or by style rows), zIndex bands with raised
 * buckets, and the shared depth indices: every owner element (root) takes a depth key with
 * 2^subBits sub-orders, where the width fits the root with the most primitives, its child elements' included
 * (`subBitsFor`), and keys x 2^subBits must stay within 2^23.
 * Production builds watch nothing.
 */
export function watchSceneLimits(store: SceneStore): () => void {
  if (!isDevelopmentBuild()) return (): void => undefined;
  const reported = new Set<string>();
  const parts = new Set<string>();
  const bandOf = new Map<string, number>();
  const owners = new Map<number, number>();
  /** Primitives per root, its children's included, and roots per needed sub-order width. */
  const totals = new Map<string, number>();
  const widths: number[] = [];
  const report = (limit: string, message: string): void => {
    if (reported.has(limit)) return;
    reported.add(limit);
    console.error(`${message} (the WebGL renderer falls back to Canvas2D)`);
  };
  const moveBand = (id: string, band: number | undefined): void => {
    const previous = bandOf.get(id);
    if (previous === band) return;
    if (previous !== undefined) {
      const left = (owners.get(previous) ?? 1) - 1;
      if (left > 0) owners.set(previous, left);
      else owners.delete(previous);
    }
    if (band === undefined) {
      bandOf.delete(id);
      return;
    }
    bandOf.set(id, band);
    const count = (owners.get(band) ?? 0) + 1;
    owners.set(band, count);
    if (owners.size > MAX_BANDS) {
      report("bands", `The scene has ${owners.size} zIndex bands, raised buckets included; the limit is ${MAX_BANDS}`);
    }
  };
  const setTotal = (rootId: string, total: number | undefined): void => {
    const before = totals.get(rootId);
    if (before === total) return;
    if (before !== undefined) widths[subBitsFor(before)]--;
    if (total === undefined) {
      totals.delete(rootId);
      return;
    }
    totals.set(rootId, total);
    const bits = subBitsFor(total);
    widths[bits] = (widths[bits] ?? 0) + 1;
  };
  const widest = (): [string, number] => {
    let id = "";
    let most = 0;
    for (const [root, total] of totals) {
      if (total > most) {
        id = root;
        most = total;
      }
    }
    return [id, most];
  };
  const checkDepth = (): void => {
    if (reported.has("depth")) return;
    let bits = widths.length - 1;
    while (bits > SCENE_DEPTH.MIN_SUB_BITS && !widths[bits]) bits--;
    bits = Math.max(bits, SCENE_DEPTH.MIN_SUB_BITS);
    const keys = totals.size;
    if (keys * 2 ** bits <= DEPTH_INDICES) return;
    const [id, most] = widest();
    report(
      "depth",
      `Scene element ${id} has ${most} primitives with its child elements: ${keys} owner elements x ${2 ** bits} ` +
        `sub-orders exceed the ${DEPTH_INDICES} depth indices`
    );
  };
  const checkRoot = (root: TSceneElement): void => {
    let total = root.primitives.length;
    for (const child of store.childrenOf(root.id)) total += child.primitives.length;
    setTotal(root.id, total);
  };
  const reportParts = (): void => {
    if (parts.size > MAX_PARTS) {
      report("parts", `The scene has ${parts.size} distinct parts; the limit is ${MAX_PARTS}`);
    }
  };
  const checkParts = (element: TSceneElement): void => {
    for (const primitive of element.primitives) {
      if (primitive.part !== undefined && primitive.part !== "none") parts.add(primitive.part);
    }
    reportParts();
  };
  // The WebGL style table also gives a slot to every part a style row names (`StyleTable.setStyles`), drawn or not.
  const seenStyles = new WeakSet<TSceneStyle>();
  let lastStyles: readonly TSceneStyle[] | undefined;
  const checkStyles = (): void => {
    const styles = store.getStyles();
    if (styles === lastStyles || reported.has("parts")) return;
    lastStyles = styles;
    for (const style of styles) {
      if (seenStyles.has(style)) continue;
      seenStyles.add(style);
      for (const rules of [style.parts, style.base]) {
        for (const part of Object.keys(rules ?? {})) if (part !== "none") parts.add(part);
      }
    }
    reportParts();
  };
  checkStyles();
  const stopStyles = store.subscribeStyles(checkStyles);
  const stopElements = store.subscribe((change) => {
    const { element } = change;
    if (change.type === "delete") {
      if (element.parent === undefined) {
        moveBand(element.id, undefined);
        setTotal(element.id, undefined);
      } else {
        // Its children are deleted before an owner, so the owner is still there for a child's delete.
        const root = store.get(element.parent);
        if (root) checkRoot(root);
      }
      return;
    }
    const every = change.type === "add" || change.fields === undefined;
    if (every || change.fields?.has("primitives")) {
      checkParts(element);
      checkRoot(store.rootOf(element));
      // An added owner takes a key, a grown root may need a wider sub-order.
      checkDepth();
    }
    if (element.parent === undefined && (every || change.fields?.has("zIndex"))) {
      moveBand(element.id, store.zIndexOf(element));
    }
  });
  return (): void => {
    stopElements();
    stopStyles();
  };
}
