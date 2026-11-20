import type { TTextLayout } from "../../text/textLayout";
import type { TTextLayouts } from "../text/textEncodes";

/** Whether two layouts hold the same lines. */
function sameLines(a: TTextLayout | undefined, b: TTextLayout | undefined): boolean {
  if (!a || !b) return a === b;
  return a.lines.length === b.lines.length && a.lines.every((line, index) => line === b.lines[index]);
}

/**
 * The camera-aware texts a re-layout changed: their lines, or the policy they are laid out under (their glyphs' size
 * mode follows it).
 */
export function changedTexts(before: TTextLayouts, after: TTextLayouts | undefined): number {
  if (!after) return 0;
  let changed = 0;
  before.texts.forEach((text, index) => {
    if (!text.cameraAware) return;
    const policy = before.policy.cameraAware !== after.policy.cameraAware;
    if (policy || !sameLines(before.layouts[index], after.layouts[index])) changed++;
  });
  return changed;
}
