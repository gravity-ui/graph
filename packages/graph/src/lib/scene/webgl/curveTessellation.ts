import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import type { TSceneFrame } from "./backendTypes";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";

/** Device pixels per world unit; all resident coarse bins revert to sixteen chords above this. */
export const CURVE_DEVICE_SCALE = 0.125;

/** Part of the 1/8-device-pixel displacement budget reserved for camera/projection arithmetic. */
export const CURVE_PROJECTION_ALLOWANCE = 1 / 32;

/** Unused effect parameter in plain opaque batches; the fragment shader never reads it. */
export const CURVE_DETAIL_OFFSET = 20;

const BIN_CHORDS = [8, 16] as const;
const FLOAT_EPSILON = 2 ** -23;
const GEOMETRY_ALLOWANCE = 0.125 - CURVE_PROJECTION_ALLOWANCE;

type TCurveBin = { paths: Float32Array; elements: Float32Array; count: number };
export type TCurveBins = [TCurveBin, TCurveBin];

/**
 * Certifies the entire stroke strip, including its AA contours, against the resident sixteen-chord strip.
 * For raw derivative controls A, B, C, positive projection m onto the chord bounds |B'| below by 3m.
 * Thus M = 6 max(|B-A|, |C-B|) bounds |B''|, and L = M/(3m) bounds the unit normal's derivative.
 * A triangle's barycentric weights share t and side with the fine strip. Their expected distance from t is at most
 * half the interval, so the normal displacement is <= L(h + 1/16)/2 throughout both triangles, not just their edges.
 * The centre displacement is <= M(h² + 1/256)/8. Multiply these by device scale and full stroke/AA extent.
 * Float allowances include both evaluations of centres and unit normals. Nonzero element origins use sixteen
 * chords at draw time: adding a large origin before subtracting controls can change the tangent through rounding.
 */
export function curveChords(paths: Float32Array, offset: number): 8 | 16 {
  const ax = paths[offset + 2] - paths[offset];
  const ay = paths[offset + 3] - paths[offset + 1];
  const bx = paths[offset + 4] - paths[offset + 2];
  const by = paths[offset + 5] - paths[offset + 3];
  const cx = paths[offset + 6] - paths[offset + 4];
  const cy = paths[offset + 7] - paths[offset + 5];
  const dx = paths[offset + 6] - paths[offset];
  const dy = paths[offset + 7] - paths[offset + 1];
  const chord = Math.sqrt(dx * dx + dy * dy);
  const minimum = Math.min(ax * dx + ay * dy, bx * dx + by * dy, cx * dx + cy * dy) / chord;
  const abx = bx - ax;
  const aby = by - ay;
  const bcx = cx - bx;
  const bcy = cy - by;
  const delta = Math.sqrt(Math.max(abx * abx + aby * aby, bcx * bcx + bcy * bcy));
  const derivativeRound =
    32 * FLOAT_EPSILON * Math.sqrt(Math.max(ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy));
  // Also exclude the shader's zero-tangent fallback and unstable normalisation.
  if (!(minimum > Math.max(derivativeRound, 1e-6))) return 16;
  let coordinate = 0;
  for (let i = 0; i < 8; i++) coordinate = Math.max(coordinate, Math.abs(paths[offset + i]));
  const centerRound = 32 * FLOAT_EPSILON * coordinate;
  const normalRound = (4 * derivativeRound) / (minimum - derivativeRound) + 16 * FLOAT_EPSILON;
  const width = paths[offset + 12];
  const extent = (Math.max((width * CURVE_DEVICE_SCALE) / 2, 0.5) + 1) * (1 + 16 * FLOAT_EPSILON);
  if (!(width >= 0) || !Number.isFinite(coordinate + delta + extent + normalRound)) return 16;
  const center = (CURVE_DEVICE_SCALE * 6 * delta) / 8;
  const normal = (extent * delta) / minimum;
  const rounding = CURVE_DEVICE_SCALE * centerRound + extent * normalRound;
  return center * (5 / 256) + normal * (3 / 16) + rounding <= GEOMETRY_ALLOWANCE ? 8 : 16;
}

/** Reused during opaque path encoding: the lists copy these views before the next path overwrites them. */
export function createCurveBins(): TCurveBins {
  const bin = (): TCurveBin => ({ paths: new Float32Array(0), elements: new Float32Array(0), count: 0 });
  return [bin(), bin()];
}

function appendCurves(bin: TCurveBin, paths: Float32Array, elements: Float32Array, first: number, end: number): void {
  const count = end - first;
  if (count === 0) return;
  const needed = bin.count + count;
  if (needed * INSTANCE_FLOATS > bin.paths.length) {
    const capacity = Math.max(16, needed, (bin.paths.length / INSTANCE_FLOATS) * 2);
    const nextPaths = new Float32Array(capacity * INSTANCE_FLOATS);
    const nextElements = new Float32Array(capacity * PATH_ELEMENT_FLOATS);
    nextPaths.set(bin.paths);
    nextElements.set(bin.elements);
    bin.paths = nextPaths;
    bin.elements = nextElements;
  }
  bin.paths.set(paths.subarray(first * INSTANCE_FLOATS, end * INSTANCE_FLOATS), bin.count * INSTANCE_FLOATS);
  bin.elements.set(
    elements.subarray(first * PATH_ELEMENT_FLOATS, end * PATH_ELEMENT_FLOATS),
    bin.count * PATH_ELEMENT_FLOATS
  );
  bin.count = needed;
}

/** Stock solid world-width pieces only; other width modes and dashes retain their complete strip. */
export function partitionCurves(
  bins: TCurveBins,
  paths: Float32Array,
  elements: Float32Array,
  residentCounts?: readonly number[]
): void {
  for (const bin of bins) bin.count = 0;
  const count = paths.length / INSTANCE_FLOATS;
  let bin = bins[1];
  let first = 0;
  for (let i = 0; i < count; i++) {
    const p = i * INSTANCE_FLOATS;
    const e = i * PATH_ELEMENT_FLOATS;
    const solid = paths[p + 16] === 0 && paths[p + 17] === 0 && paths[p + 18] === 0 && paths[p + 19] === 0;
    const chords = elements[e + 6] < 8 && solid ? curveChords(paths, p) : 16;
    const next = bins[chords === 8 ? 0 : 1];
    if (next !== bin) {
      appendCurves(bin, paths, elements, first, i);
      first = i;
      bin = next;
    }
  }
  appendCurves(bin, paths, elements, first, count);
  for (let i = 0; i < bins.length; i++) {
    const target = bins[i];
    for (let j = 0; j < target.count; j++) target.paths[j * INSTANCE_FLOATS + CURVE_DETAIL_OFFSET] = BIN_CHORDS[i];
  }
  if (!residentCounts || residentCounts[0] + residentCounts[1] !== count) return;
  // Keep resident slots on equal-size edits. Overflow pieces request their own detail only in their touched chunk.
  for (let target = 0; target < bins.length; target++) {
    const to = bins[target];
    for (let source = 0; source < bins.length && to.count < residentCounts[target]; source++) {
      const from = bins[source];
      const move = Math.min(residentCounts[target] - to.count, from.count - residentCounts[source]);
      if (move <= 0) continue;
      appendCurves(to, from.paths, from.elements, from.count - move, from.count);
      from.count -= move;
    }
  }
}

/** Includes float uniforms and a camera/projection allowance; invalid or extreme cameras retain full detail. */
export function canCoarsenCurves(frame: TSceneFrame, untranslated: boolean): boolean {
  const scale = Math.fround(frame.scale);
  const dpr = Math.fround(frame.dpr);
  const deviceScale = scale * dpr;
  const projection = (Math.max(Math.abs(frame.x), Math.abs(frame.y), frame.width, frame.height) + 1) * dpr * 2 ** -18;
  return (
    untranslated &&
    scale > 0 &&
    dpr > 0 &&
    deviceScale * (1 + 16 * FLOAT_EPSILON) <= CURVE_DEVICE_SCALE &&
    projection <= CURVE_PROJECTION_ALLOWANCE
  );
}
