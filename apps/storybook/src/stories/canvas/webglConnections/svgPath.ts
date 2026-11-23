import { SEGMENT_FLOATS } from "@gravity-ui/graph";

/** Lets the demos sample the same rounded route that the graph paints. */
export function createSvgPath(segments: Float32Array): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = `M ${segments[0]} ${segments[1]}`;
  for (let i = 0; i < segments.length; i += SEGMENT_FLOATS) {
    d += ` C ${segments.subarray(i + 2, i + SEGMENT_FLOATS).join(" ")}`;
  }
  path.setAttribute("d", d);
  return path;
}

export function sampleSvgPath(path: SVGPathElement, distance: number, length: number) {
  const point = path.getPointAtLength(distance);
  const before = path.getPointAtLength(Math.max(0, distance - 0.5));
  const after = path.getPointAtLength(Math.min(length, distance + 0.5));
  return { point, dx: after.x - before.x, dy: after.y - before.y };
}
