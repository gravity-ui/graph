import { writeCubicPiece } from "../../../components/canvas/connections/geometry/cubic";
import { measurePath, parameterAtDistance } from "../../../components/canvas/connections/geometry/pathMetrics";
import { SEGMENT_FLOATS } from "../../../components/canvas/connections/geometry/segments";
import type { TPathGap } from "../types";

type CutPath = {
  segments: Float32Array;
  length: number;
  runs: { offset: number; distance: number }[];
};

const cuts = new WeakMap<Float32Array, { gaps: readonly TPathGap[]; path: CutPath }>();

function mergeGaps(gaps: readonly TPathGap[], length: number): TPathGap[] {
  const valid = gaps
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && from < to && from < length && to > 0)
    .sort(([a], [b]) => a - b);
  const merged: TPathGap[] = [];
  for (const [from, to] of valid) {
    const last = merged[merged.length - 1];
    const end = Math.min(to, length);
    if (last && from <= last[1]) merged[merged.length - 1] = [last[0], Math.max(last[1], end)];
    else merged.push([Math.max(0, from), end]);
  }
  return merged;
}

/** Returns the visible cubics and where each run starts on the original, uncut route. */
export function cutPathGaps(segments: Float32Array, gaps: readonly TPathGap[]): CutPath | undefined {
  const cached = cuts.get(segments);
  if (cached?.gaps === gaps) return cached.path;
  if (!gaps.length || !segments.length) return undefined;

  const distances = measurePath(segments);
  const length = distances[distances.length - 1];
  if (!(length > 0) || !Number.isFinite(length)) return undefined;
  const omitted = mergeGaps(gaps, length);
  if (!omitted.length) return undefined;

  const result = new Float32Array(segments.length + omitted.length * SEGMENT_FLOATS);
  const runs: CutPath["runs"] = [];
  let written = 0;
  let i = 0;
  for (let g = 0; g <= omitted.length; g++) {
    const from = g === 0 ? 0 : omitted[g - 1][1];
    const to = omitted[g]?.[0] ?? length;
    if (from >= to) continue;
    const offset = written;
    while (distances[i + 1] <= from) i++;
    for (; distances[i] < to; i++) {
      const start = distances[i];
      const end = distances[i + 1];
      if (start === end) continue;
      const sourceOffset = i * SEGMENT_FLOATS;
      if (start >= from && end <= to) {
        result.set(segments.subarray(sourceOffset, sourceOffset + SEGMENT_FLOATS), written);
      } else {
        const t0 = parameterAtDistance(segments, sourceOffset, from - start, end - start);
        const t1 = parameterAtDistance(segments, sourceOffset, to - start, end - start);
        writeCubicPiece(segments, sourceOffset, t0, t1, result, written);
      }
      written += SEGMENT_FLOATS;
      if (end > to) break;
    }
    if (written > offset) runs.push({ offset, distance: from });
  }
  const path = { segments: result.subarray(0, written), length, runs };
  cuts.set(segments, { gaps, path });
  return path;
}
