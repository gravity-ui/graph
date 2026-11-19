import { elementBasisWithin } from "./elementBasis";

/**
 * The body moves in the block's axes. A port inside a rotated or scaled HTML layout
 * needs the inverse change of basis to cancel that motion in its parent's axes.
 */
export function prepareAnchorMotion(container: HTMLElement): (() => void) | undefined {
  if (typeof DOMMatrixReadOnly === "undefined") return undefined;
  const basisOf = elementBasisWithin(container.parentElement);

  const adjusted: HTMLElement[] = [];
  for (const anchor of container.querySelectorAll<HTMLElement>(".graph-block-anchor")) {
    const basis = anchor.parentElement && basisOf(anchor.parentElement);
    if (!basis || (basis.a === 1 && basis.b === 0 && basis.c === 0 && basis.d === 1)) continue;
    if (basis.m14 || basis.m24 || basis.m34 || basis.m44 !== 1) continue;
    // A translate3d ancestor can serialize as matrix3d even when its displacement in the view is planar.
    const inverse = new DOMMatrixReadOnly([basis.a, basis.b, basis.c, basis.d, 0, 0]).inverse();
    if (!Number.isFinite(inverse.a)) continue;
    const offset = (x: number, y: number) =>
      `calc(var(--graph-block-motion-x) * ${-x} + var(--graph-block-motion-y) * ${-y})`;
    anchor.style.setProperty("--graph-anchor-motion-x", offset(inverse.a, inverse.c));
    anchor.style.setProperty("--graph-anchor-motion-y", offset(inverse.b, inverse.d));
    adjusted.push(anchor);
  }
  return () => {
    for (const anchor of adjusted) {
      anchor.style.removeProperty("--graph-anchor-motion-x");
      anchor.style.removeProperty("--graph-anchor-motion-y");
    }
  };
}
