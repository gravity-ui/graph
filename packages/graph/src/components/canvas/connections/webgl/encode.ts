import { isDevelopmentBuild } from "../../../../lib/detachedWarning";
import { parseColor } from "../../../../utils/functions/color";
import type { TLineStroke, TWebGLShape } from "../lines/types";

import { CURVE_SEGMENTS } from "./shaders";

/**
 * Floats per instance (one cubic piece):
 * 0-3 p0, c1 | 4-7 c2, p3 | 8-11 straight rgba 0..1 |
 * 12-15 width, connection length, distance at the piece start, piece length | 16-19 dash: on, off, on, off |
 * 20-27 effect params.
 * Lengths and distances in world units.
 */
export const INSTANCE_FLOATS = 28;

/** Instance attributes of the line program: location, components, float offset (see `INSTANCE_FLOATS`). */
export const INSTANCE_ATTRIBUTES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 4, 0],
  [2, 4, 4],
  [3, 4, 8],
  [4, 4, 12],
  [5, 4, 16],
  [6, 4, 20],
  [7, 4, 24],
];

/** Numbers of a dash pattern the instance holds: two on/off pairs. */
export const DASH_FLOATS = 4;

/** Numbers an effect reads per connection, `f.params0` and `f.params1` in the shader. */
export const EFFECT_PARAMS = 8;

const DASH_OFFSET = 16;

const PARAMS_OFFSET = 20;

const NO_DASH: readonly number[] = [0, 0, 0, 0];

/** World units: the chords that draw a piece stay this close to its cubic. */
const MAX_CHORD_DEVIATION = 0.25;

const MAX_PIECES = 64;

const BLACK = { r: 0, g: 0, b: 0, a: 1 };

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

/** Instances `encodeShapes` writes for the shapes. */
export function countPieces(shapes: readonly TWebGLShape[]): number {
  let count = 0;
  for (const { segments } of shapes) {
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

/** Straight rgba in 0..1 of a CSS color; black when the color does not parse. */
export function colorFloats(css: string): [number, number, number, number] {
  // parseColor gives r, g, b in 0..255 and a in 0..1.
  const color = parseColor(css) ?? BLACK;
  return [color.r / 255, color.g / 255, color.b / 255, color.a];
}

/** Pattern texts already reported as too long, so each is reported once. */
const reportedPatterns = new Set<string>();

function reportLongPattern(pattern: readonly number[], normalized: readonly number[]): void {
  const text = pattern.join(", ");
  if (!isDevelopmentBuild() || reportedPatterns.has(text)) return;
  reportedPatterns.add(text);
  console.warn(
    `[@gravity-ui/graph] WebGL connections draw dash patterns of up to ${DASH_FLOATS} numbers. ` +
      `[${text}] has ${normalized.length}${pattern.length % 2 ? " once repeated to an even length" : ""}, ` +
      `so WebGL draws [${normalized.slice(0, DASH_FLOATS).join(", ")}] while Path2D draws all of it.`
  );
}

/**
 * The dash of an instance, like canvas `setLineDash`: an odd-length pattern is repeated to an even length, then its
 * first two on/off pairs are kept (a longer pattern reports one development warning); a 2-number pattern leaves the
 * second pair at zero. No dash, an empty pattern, or one with a negative or non-finite number is solid: all zeros.
 */
function dashFloats(dash: TLineStroke["dash"]): readonly number[] {
  const pattern = dash?.pattern;
  if (!pattern?.length) return NO_DASH;
  for (const value of pattern) if (!Number.isFinite(value) || value < 0) return NO_DASH;
  const normalized = pattern.length % 2 ? [...pattern, ...pattern] : pattern;
  if (normalized.length > DASH_FLOATS) reportLongPattern(pattern, normalized);
  return [normalized[0], normalized[1], normalized[2] ?? 0, normalized[3] ?? 0];
}

/**
 * Writes every cubic of the shapes into `out`, split into pieces where it bends (see `pieceCount`); returns the
 * number of instances written, which `countPieces` gives in advance. The distance runs on across the pieces and
 * segments of one shape, and every instance of a shape carries the shape's whole length.
 */
export function encodeShapes(shapes: readonly TWebGLShape[], out: Float32Array): number {
  let index = 0;
  for (const { segments, stroke } of shapes) {
    const color = colorFloats(stroke.color);
    const dash = dashFloats(stroke.dash);
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
        out.set(color, base + 8);
        const length = cubicLength(out, base);
        out[base + 12] = stroke.width;
        out[base + 14] = distance;
        out[base + 15] = length;
        out.set(dash, base + DASH_OFFSET);
        out.fill(0, base + PARAMS_OFFSET, base + PARAMS_OFFSET + EFFECT_PARAMS);
        distance += length;
        index++;
      }
    }
    // The whole length is known once every piece of the shape is written.
    for (let i = first; i < index; i++) out[i * INSTANCE_FLOATS + 13] = distance;
  }
  return index;
}
