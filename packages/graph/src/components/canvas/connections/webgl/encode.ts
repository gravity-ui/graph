import { isDevelopmentBuild } from "../../../../lib/detachedWarning";
import { parseColor } from "../../../../utils/functions/color";
import { isLineSegment } from "../geometry/segments";
import type { TLineInteraction, TLineStroke, TWebGLShape } from "../lines/types";

/**
 * Floats per instance (one cubic piece):
 * 0-3 p0, c1 | 4-7 c2, p3 | 8-11 straight rgba 0..1 |
 * 12-15 width, connection length, distance at the piece start, piece length | 16-19 dash: on, off, on, off |
 * 20-27 effect params (the shape's `params`, zeros after them) |
 * 28-31 interaction: the selection color's straight rgb 0..1, then hovered + 2 selected + 4 round(selection alpha *
 * 255) + 1024 when the effect shows the selection (`effectShowsSelection`), an exact integer (zeros without an
 * interaction).
 * Lengths and distances in world units.
 */
export const INSTANCE_FLOATS = 32;

/** Instance attributes of the line program: location, components, float offset (see `INSTANCE_FLOATS`). */
export const INSTANCE_ATTRIBUTES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 4, 0],
  [2, 4, 4],
  [3, 4, 8],
  [4, 4, 12],
  [5, 4, 16],
  [6, 4, 20],
  [7, 4, 24],
  [8, 4, 28],
];

/** Numbers of a dash pattern the instance holds: two on/off pairs. */
export const DASH_FLOATS = 4;

/** Numbers an effect reads per connection, `f.params0` and `f.params1` in the shader. */
export const EFFECT_PARAMS = 8;

const DASH_OFFSET = 16;

const PARAMS_OFFSET = 20;

const INTERACTION_OFFSET = 28;

const NO_INTERACTION: readonly number[] = [0, 0, 0, 0];

const NO_DASH: readonly number[] = [0, 0, 0, 0];

/** CSS pixels: chords stay this close to their cubic at the bucket's largest scale. */
export const TESSELLATION_TOLERANCE = 0.25;

/** Uniform chords of the curve template: each curve piece is drawn as this many. */
export const CURVE_CHORDS = 16;

const MIN_BUCKET = -12;

const MAX_BUCKET = 4;

const MAX_PIECES = 64;

const BLACK = { r: 0, g: 0, b: 0, a: 1 };

/** 5-point Gauss–Legendre nodes on [-1, 1] and their weights. */
const GAUSS_NODES = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const GAUSS_WEIGHTS = [
  0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908,
];

/** Instances of one vertex template, `INSTANCE_FLOATS` apart; `data` grows as `encodeShapes` writes them. */
export type TInstances = { data: Float32Array; count: number };

/** Encoded strokes by vertex template: straight segments drawn as one quad each, curve pieces as `CURVE_CHORDS`. */
export type TEncodedChunk = { lines: TInstances; curves: TInstances };

/** Empty instances for both templates, to encode a chunk into. */
export function createEncodedChunk(): TEncodedChunk {
  return { lines: { data: new Float32Array(0), count: 0 }, curves: { data: new Float32Array(0), count: 0 } };
}

/** Power-of-two bucket of a camera scale: the encoding of a bucket holds for every scale up to 2^bucket. */
export function scaleBucket(scale: number): number {
  const bucket = Math.ceil(Math.log2(scale));
  // log2 of a negative number or NaN.
  if (Number.isNaN(bucket)) return MIN_BUCKET;
  // `|| 0` turns the -0 of scales in (0.5, 1) into 0.
  return Math.min(MAX_BUCKET, Math.max(MIN_BUCKET, bucket)) || 0;
}

/**
 * Pieces a cubic is drawn in at a scale bucket. A straight segment (see `isLineSegment`) is one piece, drawn with the
 * line template. A curve is split so that `CURVE_CHORDS` uniform chords per piece stay within
 * `TESSELLATION_TOLERANCE` CSS pixels at scale 2^bucket: n uniform chords deviate at most max|B''| / (8 n²) world
 * units, where max|B''| = 6 max(|p0 - 2 c1 + c2|, |c1 - 2 c2 + p3|). At most `MAX_PIECES`.
 */
export function piecesAt(segments: ArrayLike<number>, offset: number, bucket: number): number {
  return isLineSegment(segments, offset) ? 1 : curvePieces(segments, offset, bucket);
}

/** `piecesAt` of a cubic that is not a straight segment. */
function curvePieces(s: ArrayLike<number>, o: number, bucket: number): number {
  const a = Math.hypot(s[o] - 2 * s[o + 2] + s[o + 4], s[o + 1] - 2 * s[o + 3] + s[o + 5]);
  const b = Math.hypot(s[o + 2] - 2 * s[o + 4] + s[o + 6], s[o + 3] - 2 * s[o + 5] + s[o + 7]);
  const chords = Math.sqrt((6 * Math.max(a, b) * 2 ** bucket) / (8 * TESSELLATION_TOLERANCE));
  if (!Number.isFinite(chords)) return 1;
  return Math.min(MAX_PIECES, Math.max(1, Math.ceil(chords / CURVE_CHORDS)));
}

/**
 * Whether a curve of the shapes is drawn in another number of pieces at bucket `to` than at bucket `from`: otherwise
 * `encodeShapes` writes the same instances at both.
 */
export function piecesDiffer(shapes: readonly TWebGLShape[], from: number, to: number): boolean {
  for (const { segments } of shapes) {
    for (let o = 0; o + 8 <= segments.length; o += 8) {
      if (isLineSegment(segments, o)) continue;
      if (curvePieces(segments, o, from) !== curvePieces(segments, o, to)) return true;
    }
  }
  return false;
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

/** Arc length of the cubic over [t0, t1]: 5-point Gauss–Legendre quadrature of |B'(t)|. */
function pieceLength(s: ArrayLike<number>, o: number, t0: number, t1: number): number {
  const half = (t1 - t0) / 2;
  const middle = (t0 + t1) / 2;
  let sum = 0;
  for (let i = 0; i < GAUSS_NODES.length; i++) {
    const t = middle + half * GAUSS_NODES[i];
    const dx = bezierSlope(s[o], s[o + 2], s[o + 4], s[o + 6], t);
    const dy = bezierSlope(s[o + 1], s[o + 3], s[o + 5], s[o + 7], t);
    sum += GAUSS_WEIGHTS[i] * Math.hypot(dx, dy);
  }
  return half * sum;
}

/** Makes room for `extra` more instances, keeping the ones written. */
function reserve(instances: TInstances, extra: number): void {
  const needed = (instances.count + extra) * INSTANCE_FLOATS;
  if (needed <= instances.data.length) return;
  const data = new Float32Array(Math.max(needed, instances.data.length * 2));
  data.set(instances.data.subarray(0, instances.count * INSTANCE_FLOATS));
  instances.data = data;
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

/** Writes the effect params of an instance: missing ones as zero, at most `EFFECT_PARAMS`. */
function writeParams(params: readonly number[] | undefined, out: Float32Array, offset: number): void {
  let i = 0;
  if (params) for (; i < params.length && i < EFFECT_PARAMS; i++) out[offset + i] = params[i];
  out.fill(0, offset + i, offset + EFFECT_PARAMS);
}

/** The selection color turned into floats last: shapes mostly share one, the theme's. */
let lastSelectionColor: string | undefined;

let lastSelectionFloats: [number, number, number, number] = [0, 0, 0, 0];

/**
 * The interaction floats of an instance: the selection color's straight rgb, then hovered + 2 selected + 4 round(alpha
 * * 255) + 1024 when the effect shows the selection, an integer below 2048 that a float holds exactly. Zeros without
 * an interaction.
 */
function interactionFloats(
  interaction: TLineInteraction | undefined,
  effectShowsSelection: boolean
): readonly number[] {
  if (!interaction) return NO_INTERACTION;
  const { hovered, selected, selectionColor } = interaction;
  if (selectionColor !== lastSelectionColor) {
    lastSelectionFloats = colorFloats(selectionColor);
    lastSelectionColor = selectionColor;
  }
  const [r, g, b, a] = lastSelectionFloats;
  const alpha = Math.round(Math.min(1, Math.max(0, a)) * 255) || 0;
  return [r, g, b, (hovered ? 1 : 0) + (selected ? 2 : 0) + 4 * alpha + (effectShowsSelection ? 1024 : 0)];
}

/**
 * The stroke floats of one instance: color, width, distance at the piece start and piece length, dash, params,
 * interaction.
 */
type TInstanceStroke = {
  color: readonly number[];
  width: number;
  dash: readonly number[];
  params: readonly number[] | undefined;
  interaction: readonly number[];
};

function writeStroke(out: Float32Array, base: number, stroke: TInstanceStroke, start: number, length: number): void {
  out.set(stroke.color, base + 8);
  out[base + 12] = stroke.width;
  out[base + 14] = start;
  out[base + 15] = length;
  out.set(stroke.dash, base + DASH_OFFSET);
  writeParams(stroke.params, out, base + PARAMS_OFFSET);
  out.set(stroke.interaction, base + INTERACTION_OFFSET);
}

/** Writes the connection length into the instances from `first` on. */
function writeTotal(instances: TInstances, first: number, total: number): void {
  for (let i = first; i < instances.count; i++) instances.data[i * INSTANCE_FLOATS + 13] = total;
}

/**
 * Appends every cubic of the shapes to `out`, tessellated for the scale bucket (see `piecesAt`): straight segments to
 * the line instances with their exact chord length, curve pieces to the curve instances with their arc length by
 * quadrature. The distance runs on across the pieces and segments of one shape, whatever their template, and every
 * instance of a shape carries the shape's whole length. Counts are not reset: a new chunk starts from
 * `createEncodedChunk()` or zero counts.
 */
export function encodeShapes(shapes: readonly TWebGLShape[], bucket: number, out: TEncodedChunk): void {
  const { lines, curves } = out;
  for (const { segments, stroke, params, interaction, effectShowsSelection = false } of shapes) {
    const instanceStroke: TInstanceStroke = {
      color: colorFloats(stroke.color),
      width: stroke.width,
      dash: dashFloats(stroke.dash),
      params,
      interaction: interactionFloats(interaction, effectShowsSelection),
    };
    const firstLine = lines.count;
    const firstCurve = curves.count;
    let distance = 0;
    for (let o = 0; o + 8 <= segments.length; o += 8) {
      if (isLineSegment(segments, o)) {
        reserve(lines, 1);
        const base = lines.count * INSTANCE_FLOATS;
        for (let i = 0; i < 8; i++) lines.data[base + i] = segments[o + i];
        const length = Math.hypot(segments[o + 6] - segments[o], segments[o + 7] - segments[o + 1]);
        writeStroke(lines.data, base, instanceStroke, distance, length);
        distance += length;
        lines.count++;
        continue;
      }
      const pieces = curvePieces(segments, o, bucket);
      reserve(curves, pieces);
      for (let k = 0; k < pieces; k++) {
        const base = curves.count * INSTANCE_FLOATS;
        const t0 = k / pieces;
        const t1 = (k + 1) / pieces;
        if (pieces === 1) {
          for (let i = 0; i < 8; i++) curves.data[base + i] = segments[o + i];
        } else {
          writePiece(segments, o, t0, t1, curves.data, base);
        }
        const length = pieceLength(segments, o, t0, t1);
        writeStroke(curves.data, base, instanceStroke, distance, length);
        distance += length;
        curves.count++;
      }
    }
    // The whole length is known once every piece of the shape is written.
    writeTotal(lines, firstLine, distance);
    writeTotal(curves, firstCurve, distance);
  }
}
