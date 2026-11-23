import { cubicPieceLength, cubicPointAndAngle } from "./cubic";
import { SEGMENT_FLOATS, isLineSegment } from "./segments";

/** Cumulative world distances at the segment boundaries, starting at zero. */
export function measurePath(segments: Float32Array): Float64Array {
  const distances = new Float64Array(Math.floor(segments.length / SEGMENT_FLOATS) + 1);
  for (let i = 0; i + 1 < distances.length; i++) {
    const o = i * SEGMENT_FLOATS;
    const length = isLineSegment(segments, o)
      ? Math.hypot(segments[o + 6] - segments[o], segments[o + 7] - segments[o + 1])
      : cubicPieceLength(segments, o, 0, 1);
    distances[i + 1] = distances[i] + length;
  }
  return distances;
}

export function parameterAtDistance(segments: Float32Array, offset: number, distance: number, length: number): number {
  if (distance <= 0) return 0;
  if (distance >= length) return 1;
  if (isLineSegment(segments, offset)) return distance / length;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (cubicPieceLength(segments, offset, 0, mid) < distance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function pointAtDistance(segments: Float32Array, distances: Float64Array, distance: number) {
  let first = 0;
  let last = distances.length - 1;
  while (last - first > 1) {
    const mid = Math.floor((first + last) / 2);
    if (distances[mid] <= distance) first = mid;
    else last = mid;
  }
  const offset = first * SEGMENT_FLOATS;
  const t = parameterAtDistance(segments, offset, distance - distances[first], distances[last] - distances[first]);
  return cubicPointAndAngle(segments, offset, t);
}
