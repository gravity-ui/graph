import { isLineSegment } from "../../../../components/canvas/connections/geometry/segments";
import { INSTANCE_FLOATS, piecesAt } from "../../../../components/canvas/connections/webgl/encode";
import type { TEncodedChunk } from "../../../../components/canvas/connections/webgl/encode";

/** The Canvas default and the reach limit of a closed WebGL stroke, in half widths. */
export const MITER_LIMIT = 10;

/**
 * Join two encoded pieces at their shared point. In the normal/tangent basis the miter is (1, ±tan(turn/2)).
 * Each strip then ends at the same cross-section, including its antialias fringe. A solid stroke has no use
 * for longitudinal distances, so the join takes their place without an extra vertex or texture read.
 */
function joinPieces(incoming: Float32Array, end: number, outgoing: Float32Array, start: number): void {
  let ax = incoming[end + 6] - incoming[end + 4];
  let ay = incoming[end + 7] - incoming[end + 5];
  let bx = outgoing[start + 2] - outgoing[start];
  let by = outgoing[start + 3] - outgoing[start + 1];
  // Use the same chord fallback as the vertex shader for a zero endpoint derivative.
  if (9 * (ax * ax + ay * ay) < 1e-12) {
    ax = incoming[end + 6] - incoming[end];
    ay = incoming[end + 7] - incoming[end + 1];
  }
  if (9 * (bx * bx + by * by) < 1e-12) {
    bx = outgoing[start + 6] - outgoing[start];
    by = outgoing[start + 7] - outgoing[start + 1];
  }
  const divisor = Math.hypot(ax, ay) * Math.hypot(bx, by) + ax * bx + ay * by;
  if (divisor <= 0) return;
  const k = (ax * by - ay * bx) / divisor;
  if (k === 0 || !Number.isFinite(k)) return;
  incoming[end + 13] = outgoing[start + 13] = -1;
  incoming[end + 15] = -k;
  outgoing[start + 14] = k;
}

export function closeStroke(
  segments: Float32Array,
  bucket: number,
  chunk: TEncodedChunk,
  line: number,
  curve: number
): void {
  let firstBuffer: Float32Array | undefined;
  let first = 0;
  let previousBuffer: Float32Array | undefined;
  let previous = 0;
  for (let offset = 0; offset + 8 <= segments.length; offset += 8) {
    // Only source corners are joins. The pieces within one subdivided Bézier already share a tangent.
    const straight = isLineSegment(segments, offset);
    const buffer = straight ? chunk.lines.data : chunk.curves.data;
    const at = (straight ? line : curve) * INSTANCE_FLOATS;
    if (previousBuffer) joinPieces(previousBuffer, previous, buffer, at);
    else {
      firstBuffer = buffer;
      first = at;
    }
    if (straight) line++;
    else curve += piecesAt(segments, offset, bucket);
    previousBuffer = buffer;
    previous = ((straight ? line : curve) - 1) * INSTANCE_FLOATS;
  }
  if (firstBuffer && previousBuffer) joinPieces(previousBuffer, previous, firstBuffer, first);
}
