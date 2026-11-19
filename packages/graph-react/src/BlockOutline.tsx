import React, { useId, useLayoutEffect, useRef } from "react";

import { blockOutlineSegments, blockOutlineStrokes } from "@gravity-ui/graph";
import type { TSceneOutline } from "@gravity-ui/graph";

import { elementBasisWithin } from "./utils/elementBasis";

function roundAnchor(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  const half = element.offsetWidth / 2;
  return [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomLeftRadius,
    style.borderBottomRightRadius,
  ].every((corner) => {
    const lengths = (corner || style.borderRadius).split(" ");
    return lengths.every((value) => {
      const radius = parseFloat(value);
      return value.endsWith("%") ? radius >= 50 : radius > 0 && radius >= half;
    });
  });
}

/** A rotated square has a larger screen bounding box, but its inscribed circle keeps its radius. */
function diameterOf(
  anchor: HTMLElement,
  style: CSSStyleDeclaration,
  basis: DOMMatrixReadOnly | undefined,
  width: number,
  height: number
) {
  if (basis && style.boxSizing === "border-box") {
    const x = Math.hypot(basis.a, basis.b);
    const y = Math.hypot(basis.c, basis.d);
    // Shear turns a round port into an ellipse.
    if (Math.abs(basis.a * basis.c + basis.b * basis.d) > 1e-6 * x * y) return 0;
    width = parseFloat(style.width) * x;
    height = parseFloat(style.height) * y;
  }
  return width > 0 && Math.abs(width - height) <= 0.01 && roundAnchor(anchor, style) ? width : 0;
}

/** Scene corners are circular; the two CSS axes coincide for circular radii. */
function cornerRadii(body: HTMLElement, width: number, height: number): number[] {
  const css = getComputedStyle(body);
  const unitX = body.offsetWidth ? width / body.offsetWidth : 1;
  const unitY = body.offsetHeight ? height / body.offsetHeight : 1;
  return [
    css.borderTopLeftRadius,
    css.borderTopRightRadius,
    css.borderBottomRightRadius,
    css.borderBottomLeftRadius,
  ].map((corner) => {
    const [rx, ry = rx] = (corner || css.borderRadius || "0").split(" ");
    const x = parseFloat(rx) * (rx.endsWith("%") ? width / 100 : unitX);
    const y = parseFloat(ry) * (ry.endsWith("%") ? height / 100 : unitY);
    return Math.min(x, y) || 0;
  });
}

function pathData(contours: Float32Array[]): string {
  return contours
    .map((segments) => {
      let path = `M${segments[0]} ${segments[1]}`;
      for (let i = 0; i < segments.length; i += 8) {
        path += `C${segments[i + 2]} ${segments[i + 3]} ${segments[i + 4]} ${segments[i + 5]} ${segments[i + 6]} ${segments[i + 7]}`;
      }
      return path + "Z";
    })
    .join("");
}

/** The outline is a sibling of the HTML face, so consumer clipping, pointer handlers and anchor layout stay intact. */
export function BlockOutline({ outline }: { outline: TSceneOutline }) {
  const pathRef = useRef<SVGPathElement>(null);
  const pathId = useId();
  useLayoutEffect(() => {
    const path = pathRef.current;
    const svg = path?.ownerSVGElement;
    const body = svg?.previousElementSibling;
    const container = svg?.parentElement;
    if (!path || !svg || !(body instanceof HTMLElement) || !container) return undefined;

    let previous: number[] = [];
    let anchors: HTMLElement[] = [];
    let motionX = "";
    let motionY = "";
    const draw = () => {
      const matrix = svg.getScreenCTM?.();
      if (!matrix) return;
      const sx = Math.hypot(matrix.a, matrix.b);
      const sy = Math.hypot(matrix.c, matrix.d);
      if (!sx || !sy) return;
      const box = body.getBoundingClientRect();
      const width = box.width / sx;
      const height = box.height / sy;
      const x = (box.left - matrix.e) / sx;
      const y = (box.top - matrix.f) / sy;
      const radii = cornerRadii(body, width, height);
      const geometry = [x, y, width, height, ...radii];
      const circles = [];
      const basisOf = elementBasisWithin(container);
      for (const anchor of anchors) {
        if (anchor.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const rect = anchor.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = getComputedStyle(anchor);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
        const diameter = diameterOf(anchor, style, basisOf(anchor), rect.width / sx, rect.height / sy);
        if (!diameter) continue;
        const circle = {
          x: (rect.left + rect.width / 2 - box.left) / sx,
          y: (rect.top + rect.height / 2 - box.top) / sy,
          r: diameter / 2,
        };
        geometry.push(circle.x, circle.y, circle.r);
        circles.push(circle);
      }
      // A change of paint, or a new screen position of the same world geometry, leaves the stored path alone.
      if (geometry.length === previous.length && geometry.every((value, i) => Math.abs(value - previous[i]) < 0.001))
        return;
      previous = geometry;
      path.setAttribute("transform", `translate(${x} ${y})`);
      path.setAttribute(
        "d",
        width > 0 && height > 0 ? pathData(blockOutlineSegments(width, height, circles, radii)) : ""
      );
    };

    const resize = new ResizeObserver(draw);
    const collect = () => {
      resize.disconnect();
      resize.observe(body);
      anchors = Array.from(body.querySelectorAll<HTMLElement>(".graph-block-anchor")).filter(
        (anchor) => anchor.closest(".graph-block-container") === container
      );
      for (const anchor of anchors) resize.observe(anchor);
    };
    collect();
    draw();
    const changes = new MutationObserver((mutations) => {
      if (mutations.some((change) => change.type === "childList")) collect();
      // Geometry moves and zIndex writes affect the container. Only body motion changes its position relative to ports.
      const x = container.style.getPropertyValue("--graph-block-motion-x");
      const y = container.style.getPropertyValue("--graph-block-motion-y");
      if (x !== motionX || y !== motionY || mutations.some((change) => change.target !== container)) draw();
      motionX = x;
      motionY = y;
    });
    changes.observe(body, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
      childList: true,
      subtree: true,
    });
    changes.observe(container, { attributes: true, attributeFilter: ["style"] });
    const hover = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".graph-block-anchor")) draw();
    };
    body.addEventListener("pointerover", hover);
    body.addEventListener("pointerout", hover);
    return () => {
      resize.disconnect();
      changes.disconnect();
      body.removeEventListener("pointerover", hover);
      body.removeEventListener("pointerout", hover);
    };
  }, []);
  return (
    <svg className="graph-block-outline" aria-hidden="true" focusable="false">
      <defs>
        <path ref={pathRef} id={pathId} />
      </defs>
      {blockOutlineStrokes(outline).map((stroke, i) => (
        <use key={i} href={`#${pathId}`} fill="none" stroke={stroke.color} strokeWidth={stroke.width} />
      ))}
    </svg>
  );
}
