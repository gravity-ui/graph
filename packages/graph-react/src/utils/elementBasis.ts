/** Maps the axes of an HTML box into an ancestor's coordinate system. Siblings share the cached parent transforms. */
export function elementBasisWithin(boundary: HTMLElement | null) {
  const bases = new Map<HTMLElement, DOMMatrixReadOnly | undefined>();
  const basisOf = (parent: HTMLElement): DOMMatrixReadOnly | undefined => {
    if (parent === boundary || typeof DOMMatrixReadOnly === "undefined") return undefined;
    if (bases.has(parent)) return bases.get(parent);
    const outer = !parent.parentElement ? undefined : basisOf(parent.parentElement);
    const { transform, rotate, scale } = getComputedStyle(parent);
    // Individual CSS transforms are applied before the transform list, in rotate, scale order.
    const parts: string[] = [];
    if (rotate && rotate !== "none") {
      const angle = rotate.replace(/^z /, "");
      if (!angle.includes(" ")) parts.push(`rotate(${angle})`);
    }
    if (scale && scale !== "none") {
      const [x, y = x] = scale.split(" ");
      parts.push(`scale(${x}, ${y})`);
    }
    if (transform && transform !== "none") parts.push(transform);
    let basis = outer;
    if (parts.length) {
      try {
        const local = new DOMMatrixReadOnly(parts.join(" "));
        basis = outer ? outer.multiply(local) : local;
      } catch {
        // A transform that the browser cannot convert (e.g. unresolved units) keeps ordinary compensation.
      }
    }
    bases.set(parent, basis);
    return basis;
  };
  return basisOf;
}
