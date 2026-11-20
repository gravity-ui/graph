import type { SceneStore } from "../store/SceneStore";
import { ignoresCameraAware } from "../styles/style";
import type { TSceneElement, TSceneStyle } from "../types";

/** A development error for a child order that is not an integer of at least 0; such an order still sorts. */
export function checkChildOrder(id: string, childOrder: number | undefined): void {
  if (childOrder === undefined || (Number.isInteger(childOrder) && childOrder >= 0)) return;
  console.error(`Scene element ${id}: childOrder ${childOrder} is not an integer of at least 0`);
}

/** Element types and parts already warned about by `warnIgnoredCameraAware`. */
const ignoredCameraAware = new Set<string>();

export function warnIgnoredCameraAware(element: TSceneElement, style: TSceneStyle | undefined): void {
  if (!style) return;
  for (const primitive of element.primitives) {
    if (!ignoresCameraAware(primitive, style)) continue;
    const type = element.id.split("\u0000")[0];
    const key = `${type}\u0000${primitive.part}`;
    if (ignoredCameraAware.has(key)) continue;
    ignoredCameraAware.add(key);
    console.warn(
      `Scene element type "${type}", part "${primitive.part}": a style's cameraAware: true is not applied to a text ` +
        "without a height (its element's bounds would not cover it); give the text a height, or declare cameraAware " +
        "on the primitive"
    );
  }
}

/** Whether a row sets `cameraAware: true` on some part, in its base or its state values. */
export function turnsCameraAwareOn(style: TSceneStyle): boolean {
  for (const values of [style.base, style.parts]) {
    if (!values) continue;
    for (const part in values) {
      if (values[part]?.cameraAware === true) return true;
    }
  }
  return false;
}

const widthWarnings = {
  px: "A style rule sets a { px } width without maxWorld: the culling bounds of elements drawn with it take that width at the minimum camera scale (px / 0.01 world units). Give the width a maxWorld.",
  minPx:
    "A style rule sets a { world } width with a minPx: the culling bounds of elements drawn with it take that width at the minimum camera scale (minPx / 0.01 world units). Use a smaller minPx, or a width without one.",
};

type WidthForm = keyof typeof widthWarnings;
const reportedWidths = new WeakMap<SceneStore, Set<WidthForm>>();

/** Report each unbounded width form once per store, even if the style is shared by many elements. */
export function warnUnboundedWidth(store: SceneStore, style: TSceneStyle): void {
  let reported = reportedWidths.get(store);
  if (reported?.size === 2) return;
  for (const parts of [style.base, style.parts]) {
    for (const part in parts) {
      const width = parts[part]?.width;
      if (typeof width !== "object") continue;
      let form: WidthForm;
      if ("px" in width && width.maxWorld === undefined) form = "px";
      else if ("world" in width && (width.minPx ?? 0) > 0) form = "minPx";
      else continue;
      if (reported?.has(form)) continue;
      if (!reported) {
        reported = new Set();
        reportedWidths.set(store, reported);
      }
      reported.add(form);
      console.warn(widthWarnings[form]);
    }
  }
}
