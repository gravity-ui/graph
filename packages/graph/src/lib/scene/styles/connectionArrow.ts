import { isLineSegment, writeLineSegment } from "../../../components/canvas/connections/geometry/segments";
import { turnedPolylineStrokes } from "../../../components/canvas/connections/geometry/utils/polylineStroke";
import type { TScenePrimitive, TSceneStyle } from "../types";

/** Stop the shaft at the base of a terminal head, keeping the original phase at the tip. */
export function trimConnectionShaft(
  shaft: TScenePrimitive,
  head: TScenePrimitive | undefined,
  style: TSceneStyle | undefined
): TScenePrimitive {
  if (
    shaft.kind !== "path" ||
    shaft.part !== "line" ||
    head?.kind !== "path" ||
    head.arrowPosition !== "end" ||
    !head.closed ||
    (style?.parts?.arrow?.visible ?? style?.base?.arrow?.visible) === false
  )
    return shaft;

  const { segments } = shaft;
  const o = segments.length - 8;
  const tipX = head.segments[0];
  const tipY = head.segments[1];
  const baseX = (head.segments[6] + head.segments[14]) / 2;
  const baseY = (head.segments[7] + head.segments[15]) / 2;
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const depth = Math.hypot(dx, dy);
  const distanceToBase = (i: number) => (segments[o + i] - baseX) * dx + (segments[o + i + 1] - baseY) * dy;
  if (o < 0 || depth <= 0 || distanceToBase(0) >= 0) return shaft;

  const clipped = segments.slice();
  if (turnedPolylineStrokes.has(segments)) turnedPolylineStrokes.add(clipped);
  if (isLineSegment(segments, o)) {
    writeLineSegment(clipped, o, { x: segments[o], y: segments[o + 1] }, { x: baseX, y: baseY });
  } else {
    const a = distanceToBase(0);
    const b = distanceToBase(2);
    const c = distanceToBase(4);
    const d = distanceToBase(6);
    let low = 0;
    let high = 1;
    // Intersect the final cubic with the base plane, then retain the first half of the split.
    for (let i = 0; i < 14; i++) {
      const t = (low + high) / 2;
      const u = 1 - t;
      if (u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d < 0) low = t;
      else high = t;
    }
    const t = (low + high) / 2;
    for (let axis = o; axis < o + 2; axis++) {
      const p = segments[axis];
      const q = segments[axis + 2];
      const r = segments[axis + 4];
      const s = segments[axis + 6];
      const pq = p + t * (q - p);
      const qr = q + t * (r - q);
      const rs = r + t * (s - r);
      const pqr = pq + t * (qr - pq);
      clipped[axis + 2] = pq;
      clipped[axis + 4] = pqr;
      clipped[axis + 6] = pqr + t * (qr + t * (rs - qr) - pqr);
    }
  }
  return { ...shaft, segments: clipped, arrowTrim: depth };
}
