import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import type { TInstanceUpload } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { CURVE_PROJECTION_ALLOWANCE, canCoarsenCurves } from "./curveTessellation";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";

const MIN_SCALE = 1 / 128;
const MAX_SCALE = 1 / 16;
const FLOAT_EPSILON = 2 ** -23;
const SEAM_ALLOWANCE = 1 / 256;
/** Bound the retained history and the physical range checks per painter span on local edits. */
export const MAX_LOCAL_OVERVIEW_RANGES = 8;

/** Re-enter inside the certified band so small zoom reversals do not repeatedly rewrite the address stream. */
export function overviewCamera(frame: TSceneFrame, active = false): boolean {
  const scale = Math.fround(frame.scale) * Math.fround(frame.dpr);
  const w = Math.fround(frame.width) * Math.fround(frame.dpr);
  const h = Math.fround(frame.height) * Math.fround(frame.dpr);
  const drawingWidth = Math.max(1, Math.round(frame.width * frame.dpr));
  const drawingHeight = Math.max(1, Math.round(frame.height * frame.dpr));
  return (
    scale >= (active ? MIN_SCALE : MIN_SCALE * 1.1) &&
    scale <= (active ? MAX_SCALE : MAX_SCALE * 0.9) &&
    canCoarsenCurves(frame, true) &&
    w > 0 &&
    h > 0 &&
    Math.max(drawingWidth / w, drawingHeight / h) <= 1.01
  );
}

/**
 * Certify the four-chord strip against the sixteen-chord strip on these very same float32 controls.
 * Positive projection bounds speed below by 3m; 6δ bounds acceleration, and 2δ/m bounds normal rotation.
 * Triangle interpolation at matching t and side displaces the centre by M(h²+1/256)/8 and the normal
 * by L(h+1/16)/2. Reject folds even at the lowest scale and reserve the seam/projection error separately.
 */
function canGroupPiece(paths: Float32Array, p: number, extent: number, original: number): boolean {
  const ax = paths[p + 2] - paths[p],
    ay = paths[p + 3] - paths[p + 1];
  const bx = paths[p + 4] - paths[p + 2],
    by = paths[p + 5] - paths[p + 3];
  const cx = paths[p + 6] - paths[p + 4],
    cy = paths[p + 7] - paths[p + 5];
  const dx = paths[p + 6] - paths[p],
    dy = paths[p + 7] - paths[p + 1];
  const m = Math.min(ax * dx + ay * dy, bx * dx + by * dy, cx * dx + cy * dy) / Math.sqrt(dx * dx + dy * dy);
  const round = 32 * FLOAT_EPSILON * Math.sqrt(Math.max(ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy));
  if (!(m > Math.max(round, 1e-6))) return false;
  const abx = bx - ax,
    aby = by - ay,
    bcx = cx - bx,
    bcy = cy - by;
  const delta = Math.sqrt(Math.max(abx * abx + aby * aby, bcx * bcx + bcy * bcy));
  // |D x D'|/|D|² also bounds rotation, often more tightly for longitudinal acceleration.
  const cross = Math.max(Math.abs(ax * by - ay * bx), Math.abs(ax * cy - ay * cx) / 2, Math.abs(bx * cy - by * cx));
  const normal = Math.min(delta / m, cross / (m * m));
  if (!(extent * 2 * normal < 3 * (m - round) * MIN_SCALE)) return false;
  let coord = 0;
  for (let k = 0; k < 8; k++) coord = Math.max(coord, Math.abs(paths[p + k]));
  const rounding = MAX_SCALE * 32 * FLOAT_EPSILON * coord + extent * ((4 * round) / (m - round) + 16 * FLOAT_EPSILON);
  const h = 1 / 4;
  const error =
    MAX_SCALE * ((6 * delta) / 8) * (h * h + original * original) + extent * normal * (h + original) + rounding;
  return (error + SEAM_ALLOWANCE + CURVE_PROJECTION_ALLOWANCE) * 1.01 <= 1 / 8;
}

/** Both strips share the join position; one endpoint normal replaces two separately rounded evaluations. */
function smoothSeam(paths: Float32Array, p: number, extent: number): boolean {
  const q = p - INSTANCE_FLOATS;
  if (paths[q + 6] !== paths[p] || paths[q + 7] !== paths[p + 1]) return false;
  const ax = paths[q + 6] - paths[q + 4],
    ay = paths[q + 7] - paths[q + 5];
  const bx = paths[p + 2] - paths[p],
    by = paths[p + 3] - paths[p + 1];
  const a = Math.sqrt(ax * ax + ay * ay),
    b = Math.sqrt(bx * bx + by * by);
  const dx = ax / a - bx / b,
    dy = ay / a - by / b;
  return extent * Math.sqrt(dx * dx + dy * dy) <= SEAM_ALLOWANCE;
}

/** Mode zero ignores the maximum-width field. Keep a private group and ordinal there across resident range moves. */
export function markOverviewCurves(
  paths: Float32Array,
  elements: Float32Array,
  first: number,
  end: number,
  width: number,
  originalChords: 8 | 16
): boolean {
  if (end - first < 2 || !(width > 0)) return false;
  const extent = (Math.max(0.5, (width * MAX_SCALE) / 2) + 1) * (1 + 16 * FLOAT_EPSILON);
  let previous = false;
  let marked = false;
  let tag = 0;
  for (let i = first; i < end; i++) {
    const p = i * INSTANCE_FLOATS;
    if (!canGroupPiece(paths, p, extent, 1 / originalChords)) {
      previous = false;
      continue;
    }
    if (!previous || !smoothSeam(paths, p, extent)) tag--;
    else marked = true;
    // Gaps break unsafe seams; native bin shuffles keep the tags with the piece they describe.
    elements[i * PATH_ELEMENT_FLOATS + 7] = --tag;
    previous = true;
  }
  return marked;
}

export class OverviewCurveGroups {
  public starts = new Uint8Array(0);
  public revision = 0;
  public count = 0;
  /** Retained for every consumer that last saw the preceding revision. */
  public lastChange?: { previousRevision: number; ranges: { first: number; end: number }[] };
  private size = 0;

  constructor(public readonly pieces: 2 | 4 = 4) {}

  /** Refresh just dirty companion records and the three preceding potential starts. */
  public update(elements: Float32Array, upload: TInstanceUpload): void {
    const size = elements.length / PATH_ELEMENT_FLOATS;
    const previousSize = this.size;
    if (upload.kind === "none" && size === previousSize) return;
    this.size = size;
    if (size > this.starts.length) {
      const next = new Uint8Array(Math.max(size, this.starts.length * 2));
      next.set(this.starts);
      this.starts = next;
    }
    const previousRevision = this.revision;
    let changes: OverviewCurveGroups["lastChange"];
    const trackRanges =
      upload.kind !== "full" &&
      (upload.kind === "none" || upload.spans.length + Number(size < previousSize) <= MAX_LOCAL_OVERVIEW_RANGES);
    const refresh = (from: number, to: number): void => {
      let first = Infinity;
      let end = 0;
      for (let i = Math.max(0, from - 3); i < to; i++) {
        const e = i * PATH_ELEMENT_FLOATS;
        const tag = elements[e + 7];
        let valid = i + this.pieces <= size && tag < 0 && elements[e + 6] < 8;
        for (let j = 1; valid && j < this.pieces; j++) {
          const at = e + j * PATH_ELEMENT_FLOATS;
          valid = elements[at] === elements[e] && elements[at + 1] === elements[e + 1] && elements[at + 7] === tag - j;
        }
        const flag = Number(valid);
        if (flag === this.starts[i]) continue;
        this.count += flag - this.starts[i];
        this.starts[i] = flag;
        this.revision++;
        first = Math.min(first, i);
        end = i + 1;
      }
      if (end > first && trackRanges) {
        changes ??= { previousRevision, ranges: [] };
        changes.ranges.push({ first, end });
      }
    };
    if (size < previousSize) refresh(size, previousSize);
    if (upload.kind === "full") refresh(0, size);
    if (upload.kind === "range")
      for (const span of upload.spans) {
        const from = span.byteOffset / 4 / PATH_ELEMENT_FLOATS;
        refresh(from, from + span.data.length / PATH_ELEMENT_FLOATS);
      }
    if (this.revision !== previousRevision) this.lastChange = changes;
  }
}
