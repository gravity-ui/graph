import { parseColor } from "../../../../utils/functions/color";
import type { TConnectionAppearance } from "../appearance";

import { CONNECTION_EFFECT_PARAMS } from "./effects";
import { CURVE_SEGMENTS } from "./shaders";

/**
 * Floats per instance (one cubic piece):
 * 0-3 p0, c1 | 4-7 c2, p3 | 8-11 rgba 0..1 | 12-15 width, dash on, dash off, dash speed |
 * 16-19 distance at the piece start, piece length, dash fade (0 or 1), connection length |
 * 20-23 pulse period (seconds, 0 without a pulse), pulse wavelength (world units, 0: in place), unused, unused |
 * 24-31 effect params.
 */
export const INSTANCE_FLOATS = 32;

/** World units: the chords that draw a piece stay this close to its cubic. */
const MAX_CHORD_DEVIATION = 0.25;

const MAX_PIECES = 64;

/**
 * Pieces a cubic is drawn in, so that `CURVE_SEGMENTS` uniform chords per piece stay within `MAX_CHORD_DEVIATION`:
 * n uniform chords deviate at most max|B''| / (8 n²), where max|B''| = 6 max(|p0 - 2 c1 + c2|, |c1 - 2 c2 + p3|).
 * Straight cubics are one piece; long bends, where the tangent turns faster than one chord follows, are split.
 */
function pieceCount(s: ArrayLike<number>, o: number): number {
  const a = Math.hypot(s[o] - 2 * s[o + 2] + s[o + 4], s[o + 1] - 2 * s[o + 3] + s[o + 5]);
  const b = Math.hypot(s[o + 2] - 2 * s[o + 4] + s[o + 6], s[o + 3] - 2 * s[o + 5] + s[o + 7]);
  const chords = Math.sqrt((6 * Math.max(a, b)) / (8 * MAX_CHORD_DEVIATION));
  if (!Number.isFinite(chords)) return 1;
  return Math.min(MAX_PIECES, Math.max(1, Math.ceil(chords / CURVE_SEGMENTS)));
}

export function countSegments(appearances: readonly TConnectionAppearance[]): number {
  let count = 0;
  for (const { segments } of appearances) {
    for (let o = 0; o + 8 <= segments.length; o += 8) count += pieceCount(segments, o);
  }
  return count;
}

function bezier(p0: number, c1: number, c2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p3;
}

function bezierSlope(p0: number, c1: number, c2: number, p3: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * (c1 - p0) + 6 * u * t * (c2 - c1) + 3 * t * t * (p3 - c2);
}

/** Writes the cubic over [t0, t1] as a cubic of its own: the end points and the end tangents scaled to the range. */
function writePiece(s: ArrayLike<number>, o: number, t0: number, t1: number, out: Float32Array, base: number): void {
  const h = (t1 - t0) / 3;
  for (let axis = 0; axis < 2; axis++) {
    const p0 = s[o + axis];
    const c1 = s[o + 2 + axis];
    const c2 = s[o + 4 + axis];
    const p3 = s[o + 6 + axis];
    const start = bezier(p0, c1, c2, p3, t0);
    const end = bezier(p0, c1, c2, p3, t1);
    out[base + axis] = start;
    out[base + 2 + axis] = start + h * bezierSlope(p0, c1, c2, p3, t0);
    out[base + 4 + axis] = end - h * bezierSlope(p0, c1, c2, p3, t1);
    out[base + 6 + axis] = end;
  }
}

/** Approximate cubic length: the mean of the chord and the control polygon. */
function cubicLength(s: ArrayLike<number>, o: number): number {
  const chord = Math.hypot(s[o + 6] - s[o], s[o + 7] - s[o + 1]);
  const polygon =
    Math.hypot(s[o + 2] - s[o], s[o + 3] - s[o + 1]) +
    Math.hypot(s[o + 4] - s[o + 2], s[o + 5] - s[o + 3]) +
    Math.hypot(s[o + 6] - s[o + 4], s[o + 7] - s[o + 5]);
  return (chord + polygon) / 2;
}

/** Floats of an appearance that every instance repeats, in instance order from float 8 on (see `INSTANCE_FLOATS`). */
type TStrokeFloats = {
  /** Floats 8-15: rgba, width, dash on, dash off, dash speed. */
  look: number[];
  /** Floats 18, 20-23: dash fade; pulse period, pulse wavelength, unused, unused. */
  fade: number;
  pulse: number[];
  /** Floats 24-31. */
  params: number[];
};

function strokeFloats({ color: css, width, dash, pulse, effect }: TConnectionAppearance["stroke"]): TStrokeFloats {
  // parseColor gives r, g, b in 0..255 and a in 0..1.
  const color = parseColor(css) ?? { r: 0, g: 0, b: 0, a: 1 };
  const on = dash?.pattern[0] ?? 0;
  const off = dash?.pattern[1] ?? on;
  const params: number[] = [];
  for (let p = 0; p < CONNECTION_EFFECT_PARAMS; p++) params.push(effect?.params?.[p] ?? 0);
  return {
    look: [color.r / 255, color.g / 255, color.b / 255, color.a, width, on, off, dash?.speed ?? 0],
    fade: dash?.fade ? 1 : 0,
    pulse: [pulse?.period ?? 0, pulse?.wavelength ?? 0, 0, 0],
    params,
  };
}

/**
 * Writes every cubic of the appearances into `out`, split into pieces where it bends (see `pieceCount`); returns the
 * number of instances written, which `countSegments` gives in advance.
 */
export function encodeAppearances(appearances: readonly TConnectionAppearance[], out: Float32Array): number {
  let index = 0;
  for (const { segments, stroke } of appearances) {
    const floats = strokeFloats(stroke);
    const first = index;
    let distance = 0;
    for (let o = 0; o + 8 <= segments.length; o += 8) {
      const pieces = pieceCount(segments, o);
      for (let k = 0; k < pieces; k++) {
        const base = index * INSTANCE_FLOATS;
        if (pieces === 1) {
          for (let i = 0; i < 8; i++) out[base + i] = segments[o + i];
        } else {
          writePiece(segments, o, k / pieces, (k + 1) / pieces, out, base);
        }
        out.set(floats.look, base + 8);
        // The dash continues across the pieces and segments of one appearance.
        const length = cubicLength(out, base);
        out[base + 16] = distance;
        out[base + 17] = length;
        out[base + 18] = floats.fade;
        out.set(floats.pulse, base + 20);
        out.set(floats.params, base + 24);
        distance += length;
        index++;
      }
    }
    // Effects read the whole connection's length, known once every piece is written.
    for (let i = first; i < index; i++) out[i * INSTANCE_FLOATS + 19] = distance;
  }
  return index;
}

/** Appearances of one effect; `effect` is undefined for the stroke without an effect. */
export type TEffectGroup = { effect: string | undefined; appearances: TConnectionAppearance[] };

/**
 * Splits appearances by effect, since every effect is a program of its own: appearances without an effect first, then
 * one group per effect name in order of first use.
 */
export function groupByEffect(appearances: readonly TConnectionAppearance[]): TEffectGroup[] {
  const plain: TEffectGroup = { effect: undefined, appearances: [] };
  const groups = new Map<string, TEffectGroup>();
  for (const appearance of appearances) {
    const name = appearance.stroke.effect?.name;
    if (name === undefined) {
      plain.appearances.push(appearance);
      continue;
    }
    let group = groups.get(name);
    if (!group) {
      group = { effect: name, appearances: [] };
      groups.set(name, group);
    }
    group.appearances.push(appearance);
  }
  return [plain, ...groups.values()].filter((group) => group.appearances.length > 0);
}
