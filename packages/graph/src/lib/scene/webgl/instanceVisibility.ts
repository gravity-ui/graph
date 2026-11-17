import { LEVEL_BIT } from "../levels";

import type { InstanceRanges, TInstanceUpload } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { STYLE_ROW_TEXELS } from "./tables";

type TKind = "path" | "rect" | "triangle" | "glyph";
const CHUNK_SIZE = 128;
const LAYOUT = {
  path: { scales: 4, mask: 6 },
  rect: { scales: 25, mask: 27 },
  triangle: { scales: 10, mask: 3 },
  glyph: { scales: 24, mask: 26 },
};
type TCohort = {
  first: number;
  end: number;
  owner: number;
  slot: number;
  other: number;
  from: number;
  to: number;
  mask: number;
  active: boolean;
};
type TChunk = { cohorts: TCohort[]; next: Uint8Array };

/** Shader visibility predicates, cached in fixed chunks so local uploads do not reread the resident list. */
export class InstanceVisibility {
  private source?: InstanceRanges;
  private revision = -1;
  private invalidatedRevision = -1;
  private stateRevision?: number;
  private level: TSceneFrame["level"];
  public visibilityRevision = 0;
  private count = 0;
  private full = true;
  private readonly dirty = new Set<number>();
  private chunks: TChunk[] = [];
  private prefix = new Uint32Array(1);
  public from = -Infinity;
  public to = Infinity;

  constructor(private readonly kind: TKind) {}

  /** Forward every consumed upload, including tail trims. An unmatched latest revision triggers a full read. */
  public invalidate(upload: TInstanceUpload, ranges: InstanceRanges): void {
    this.invalidatedRevision = ranges.revision;
    if (upload.kind === "full" || this.source !== ranges) this.full = true;
    if (this.full || upload.kind !== "range") return;
    const bytes = ranges.floats * 4 * CHUNK_SIZE;
    for (const span of upload.spans) {
      const first = Math.floor(span.byteOffset / bytes);
      const end = Math.ceil((span.byteOffset + span.data.byteLength) / bytes);
      for (let chunk = first; chunk < end; chunk++) this.dirty.add(chunk);
    }
  }

  public update(
    ranges: InstanceRanges,
    table: Float32Array,
    styles: Float32Array,
    frame: TSceneFrame,
    stateRevision?: number
  ): void {
    const changed = this.source !== ranges || this.revision !== ranges.revision;
    const predicatesChanged = changed && this.read(ranges);
    if (predicatesChanged) this.visibilityRevision++;
    const scale = Math.fround(frame.scale);
    if (!predicatesChanged && this.sameVisibilityState(scale, frame.level, stateRevision)) return;
    this.stateRevision = stateRevision;
    this.level = frame.level;
    const level = frame.level === undefined ? 0 : LEVEL_BIT[frame.level];
    this.from = -Infinity;
    this.to = Infinity;
    for (let chunk = 0; chunk < this.chunks.length; chunk++) {
      const { cohorts } = this.chunks[chunk];
      let changed = false;
      let count = 0;
      for (let i = 0; i < cohorts.length; i++) {
        const cohort = cohorts[i];
        if (scale < cohort.from) this.to = Math.min(this.to, cohort.from);
        else this.from = Math.max(this.from, cohort.from);
        if (scale < cohort.to) this.to = Math.min(this.to, cohort.to);
        else this.from = Math.max(this.from, cohort.to);
        const row = table[cohort.owner * 4 + 3] * STYLE_ROW_TEXELS * 4;
        const active =
          table[cohort.owner * 4 + 2] >= 0 &&
          scale >= cohort.from &&
          scale < cohort.to &&
          (level === 0 || Math.floor(cohort.mask / level) % 2 === 1) &&
          !(styles[row + cohort.slot * 4 + 3] < -1.5) &&
          !(styles[row + cohort.other * 4 + 3] < -1.5);
        changed ||= active !== cohort.active;
        cohort.active = active;
        if (active) count += cohort.end - cohort.first;
      }
      if (changed) {
        this.writeNext(chunk);
        this.visibilityRevision++;
      }
      this.prefix[chunk + 1] = this.prefix[chunk] + count;
    }
  }

  public any(first: number, count: number): boolean {
    const end = Math.min(this.count, first + count);
    first = Math.max(0, first);
    if (first >= end) return false;
    const start = Math.floor(first / CHUNK_SIZE);
    const next = this.chunks[start].next[first % CHUNK_SIZE];
    if (next < CHUNK_SIZE) return start * CHUNK_SIZE + next < end;
    const last = Math.floor((end - 1) / CHUNK_SIZE);
    if (last === start) return false;
    // Whole middle chunks use the prefix; the last partial chunk needs only its first active offset.
    return this.prefix[last] > this.prefix[start + 1] || this.chunks[last].next[0] < end - last * CHUNK_SIZE;
  }

  private sameVisibilityState(scale: number, level: TSceneFrame["level"], stateRevision?: number): boolean {
    return (
      stateRevision !== undefined &&
      this.stateRevision === stateRevision &&
      this.level === level &&
      scale >= this.from &&
      scale < this.to
    );
  }

  private read(ranges: InstanceRanges): boolean {
    const data = ranges.data;
    const stride = ranges.floats;
    const count = data.length / stride;
    const length = Math.ceil(count / CHUNK_SIZE);
    let changed = count !== this.count;
    if (this.full || this.invalidatedRevision !== ranges.revision) {
      changed = true;
      this.chunks = [];
      this.dirty.clear();
      for (let chunk = 0; chunk < length; chunk++) this.dirty.add(chunk);
    } else if (count !== this.count) {
      this.chunks.length = Math.min(this.chunks.length, length);
      // The old partial tail needs rereading on growth; the new partial tail needs clipping on shrink.
      for (let chunk = Math.floor(Math.min(count, this.count) / CHUNK_SIZE); chunk < length; chunk++)
        this.dirty.add(chunk);
    }
    for (const chunk of this.dirty) {
      if (chunk < length) {
        const next = this.readChunk(data, stride, chunk, count);
        changed ||= next !== this.chunks[chunk];
        this.chunks[chunk] = next;
      }
    }
    this.dirty.clear();
    this.full = false;
    this.count = count;
    if (this.prefix.length !== length + 1) this.prefix = new Uint32Array(length + 1);
    this.source = ranges;
    this.invalidatedRevision = this.revision = ranges.revision;
    return changed;
  }

  private readChunk(data: Float32Array, stride: number, chunk: number, count: number): TChunk {
    const { scales, mask: maskAt } = LAYOUT[this.kind];
    const cohorts: TCohort[] = [];
    const end = Math.min(count, (chunk + 1) * CHUNK_SIZE) * stride;
    for (let at = chunk * CHUNK_SIZE * stride; at < end; at += stride) {
      const owner = data[at];
      const slot = data[at + 2];
      const other = this.kind === "rect" ? data[at + 3] : slot;
      const from = data[at + scales];
      const to = data[at + scales + 1];
      const mask = data[at + maskAt] % 8;
      const last = cohorts[cohorts.length - 1];
      if (
        last &&
        last.owner === owner &&
        last.slot === slot &&
        last.other === other &&
        last.from === from &&
        last.to === to &&
        last.mask === mask
      ) {
        last.end++;
      } else
        cohorts.push({
          first: at / stride,
          end: at / stride + 1,
          owner,
          slot,
          other,
          from,
          to,
          mask,
          active: false,
        });
    }
    const previous = this.chunks[chunk];
    // Subs, widths and paint can change without changing any shader visibility predicate.
    if (
      previous &&
      cohorts.length === previous.cohorts.length &&
      cohorts.every((cohort, index) => {
        const known = previous.cohorts[index];
        return (
          cohort.first === known.first &&
          cohort.end === known.end &&
          cohort.owner === known.owner &&
          cohort.slot === known.slot &&
          cohort.other === known.other &&
          cohort.from === known.from &&
          cohort.to === known.to &&
          cohort.mask === known.mask
        );
      })
    )
      return previous;
    return { cohorts, next: new Uint8Array(CHUNK_SIZE).fill(CHUNK_SIZE) };
  }

  /** One byte per resident slot makes each range query constant-time, independent of cohort fragmentation. */
  private writeNext(index: number): void {
    const { cohorts, next } = this.chunks[index];
    const base = index * CHUNK_SIZE;
    let nearest = CHUNK_SIZE;
    for (let i = cohorts.length - 1; i >= 0; i--) {
      const cohort = cohorts[i];
      const first = cohort.first - base;
      const end = cohort.end - base;
      if (cohort.active) {
        for (let at = first; at < end; at++) next[at] = at;
        nearest = first;
      } else {
        next.fill(nearest, first, end);
      }
    }
  }
}
