import { LEVEL_BIT } from "../levels";

import type { InstanceRanges, TInstanceUpload } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { STYLE_ROW_TEXELS } from "./tables";

type TKind = "path" | "rect" | "triangle" | "glyph";
export const VISIBILITY_CHUNK_SIZE = 128;
export type TVisibilitySpan = { first: number; end: number };
const NO_CHANGES: readonly TVisibilitySpan[] = [];
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
type TChunk = {
  cohorts: TCohort[];
  next: Uint8Array;
  from: number;
  to: number;
  count: number;
  reread: boolean;
};

/** Shader visibility predicates, cached in fixed chunks so local uploads do not reread the resident list. */
export class InstanceVisibility {
  private source?: InstanceRanges;
  private revision = -1;
  private invalidatedRevision = -1;
  private stateRevision?: number;
  private level: TSceneFrame["level"];
  public visibilityRevision = 0;
  private publishedChanges?: readonly TVisibilitySpan[];
  private readonly activityChanges: TVisibilitySpan[] = [];
  private count = 0;
  private full = true;
  private readonly dirty = new Set<number>();
  private readonly dirtyState = new Set<number>();
  private chunks: TChunk[] = [];
  private prefix = new Uint32Array(1);
  public from = -Infinity;
  public to = Infinity;

  constructor(private readonly kind: TKind) {}

  public get coverage(): "none" | "partial" | "all" {
    const active = this.prefix[this.prefix.length - 1];
    if (active === 0) return "none";
    return active === this.count ? "all" : "partial";
  }

  /**
   * Exact half-open physical spans of slots whose activity changed, sorted and disjoint.
   * A missed revision or replacement of the source requires a fresh filter.
   */
  public changesSince(revision: number): readonly TVisibilitySpan[] | undefined {
    if (revision === this.visibilityRevision) return NO_CHANGES;
    if (revision === this.visibilityRevision - 1) return this.publishedChanges;
    return undefined;
  }

  /** Forward every consumed upload, including tail trims. An unmatched latest revision triggers a full read. */
  public invalidate(upload: TInstanceUpload, ranges: InstanceRanges): void {
    this.invalidatedRevision = ranges.revision;
    if (upload.kind === "full" || this.source !== ranges) this.full = true;
    if (this.full || upload.kind !== "range") return;
    const bytes = ranges.floats * 4 * VISIBILITY_CHUNK_SIZE;
    for (const span of upload.spans) {
      const first = Math.floor(span.byteOffset / bytes);
      const end = Math.ceil((span.byteOffset + span.data.byteLength) / bytes);
      for (let chunk = first; chunk < end; chunk++) this.dirty.add(chunk);
    }
  }

  /** An owner changed its table predicates without changing its resident instance data. */
  public invalidateOwner(ranges: InstanceRanges, id: string): void {
    for (const { offset, count } of ranges.ownerRanges(id)) {
      const end = Math.ceil((offset + count) / VISIBILITY_CHUNK_SIZE);
      for (let chunk = Math.floor(offset / VISIBILITY_CHUNK_SIZE); chunk < end; chunk++) this.dirtyState.add(chunk);
    }
  }

  public update(
    ranges: InstanceRanges,
    table: Float32Array,
    styles: Float32Array,
    frame: TSceneFrame,
    stateRevision?: number
  ): void {
    const sourceChanged = this.source !== ranges;
    const changed = sourceChanged || this.revision !== ranges.revision;
    const predicatesChanged = changed && this.read(ranges, sourceChanged);
    const trimmedSpans = this.activityChanges.length;
    const scale = Math.fround(frame.scale);
    const all = !this.sameVisibilityState(scale, frame.level, stateRevision);
    if (!all && !sourceChanged && !predicatesChanged && this.dirtyState.size === 0) return;
    this.stateRevision = stateRevision;
    this.level = frame.level;
    const level = frame.level === undefined ? 0 : LEVEL_BIT[frame.level];
    this.from = -Infinity;
    this.to = Infinity;
    for (let chunk = 0; chunk < this.chunks.length; chunk++) {
      if (all || this.dirtyState.has(chunk)) this.updateChunk(chunk, scale, level, table, styles, !sourceChanged);
      const { from, to, count } = this.chunks[chunk];
      this.from = Math.max(this.from, from);
      this.to = Math.min(this.to, to);
      this.prefix[chunk + 1] = this.prefix[chunk] + count;
    }
    this.dirtyState.clear();
    if (sourceChanged || this.activityChanges.length > 0) {
      this.visibilityRevision++;
      // The removed tail was recorded before rechecking earlier slots.
      if (trimmedSpans > 0 && trimmedSpans < this.activityChanges.length) {
        for (const { first, end } of this.activityChanges.splice(0, trimmedSpans)) this.recordSpan(first, end);
      }
      this.publishedChanges = sourceChanged ? undefined : this.activityChanges.slice();
      this.activityChanges.length = 0;
    }
  }

  public any(first: number, count: number): boolean {
    const end = Math.min(this.count, first + count);
    first = Math.max(0, first);
    if (first >= end) return false;
    const start = Math.floor(first / VISIBILITY_CHUNK_SIZE);
    const next = this.chunks[start].next[first % VISIBILITY_CHUNK_SIZE];
    if (next < VISIBILITY_CHUNK_SIZE) return start * VISIBILITY_CHUNK_SIZE + next < end;
    const last = Math.floor((end - 1) / VISIBILITY_CHUNK_SIZE);
    if (last === start) return false;
    // Whole middle chunks use the prefix; the last partial chunk needs only its first active offset.
    return this.prefix[last] > this.prefix[start + 1] || this.chunks[last].next[0] < end - last * VISIBILITY_CHUNK_SIZE;
  }

  private isShown(cohort: TCohort, scale: number, level: number, table: Float32Array, styles: Float32Array): boolean {
    const row = table[cohort.owner * 4 + 3] * STYLE_ROW_TEXELS * 4;
    return (
      table[cohort.owner * 4 + 2] >= 0 &&
      scale >= cohort.from &&
      scale < cohort.to &&
      (level === 0 || Math.floor(cohort.mask / level) % 2 === 1) &&
      !(styles[row + cohort.slot * 4 + 3] < -1.5) &&
      !(styles[row + cohort.other * 4 + 3] < -1.5)
    );
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

  private read(ranges: InstanceRanges, sourceChanged: boolean): boolean {
    const data = ranges.data;
    const stride = ranges.floats;
    const count = data.length / stride;
    const length = Math.ceil(count / VISIBILITY_CHUNK_SIZE);
    let changed = count !== this.count;
    if (sourceChanged) this.chunks = [];
    for (let chunk = length; chunk < this.chunks.length; chunk++) {
      const { count: active, next } = this.chunks[chunk];
      const base = chunk * VISIBILITY_CHUNK_SIZE;
      if (active === VISIBILITY_CHUNK_SIZE) this.recordSpan(base, base + VISIBILITY_CHUNK_SIZE);
      else if (active > 0) this.recordSlotChanges(next, base, 0, VISIBILITY_CHUNK_SIZE, false);
    }
    this.chunks.length = Math.min(this.chunks.length, length);
    if (this.full || sourceChanged || this.invalidatedRevision !== ranges.revision) {
      this.dirty.clear();
      for (let chunk = 0; chunk < length; chunk++) this.dirty.add(chunk);
    } else if (count !== this.count) {
      // The old partial tail needs rereading on growth; the new partial tail needs clipping on shrink.
      for (let chunk = Math.floor(Math.min(count, this.count) / VISIBILITY_CHUNK_SIZE); chunk < length; chunk++)
        this.dirty.add(chunk);
    }
    for (const chunk of this.dirty) {
      if (chunk < length) {
        const next = this.readChunk(data, stride, chunk, count);
        if (next !== this.chunks[chunk]) {
          changed = true;
          this.dirtyState.add(chunk);
        }
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
    const end = Math.min(count, (chunk + 1) * VISIBILITY_CHUNK_SIZE) * stride;
    for (let at = chunk * VISIBILITY_CHUNK_SIZE * stride; at < end; at += stride) {
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
    // Keep the previous slot answers even when cohort boundaries or predicates changed.
    return {
      cohorts,
      next: previous?.next ?? new Uint8Array(VISIBILITY_CHUNK_SIZE).fill(VISIBILITY_CHUNK_SIZE),
      from: -Infinity,
      to: Infinity,
      count: previous?.count ?? 0,
      reread: previous !== undefined,
    };
  }

  private recordSpan(first: number, end: number): void {
    const last = this.activityChanges.at(-1);
    if (last?.end === first) last.end = end;
    else this.activityChanges.push({ first, end });
  }

  private recordSlotChanges(next: Uint8Array, base: number, first: number, end: number, active: boolean): boolean {
    let changed = false;
    let start = first;
    for (let slot = first; slot < end; slot++) {
      if ((next[slot] === slot) !== active) continue;
      if (start < slot) {
        this.recordSpan(base + start, base + slot);
        changed = true;
      }
      start = slot + 1;
    }
    if (start < end) {
      this.recordSpan(base + start, base + end);
      changed = true;
    }
    return changed;
  }

  private updateChunk(
    index: number,
    scale: number,
    level: number,
    table: Float32Array,
    styles: Float32Array,
    record: boolean
  ): void {
    const chunk = this.chunks[index];
    const base = index * VISIBILITY_CHUNK_SIZE;
    const previousCount = chunk.count;
    let changed = false;
    chunk.from = -Infinity;
    chunk.to = Infinity;
    chunk.count = 0;
    for (const cohort of chunk.cohorts) {
      if (scale < cohort.from) chunk.to = Math.min(chunk.to, cohort.from);
      else chunk.from = Math.max(chunk.from, cohort.from);
      if (scale < cohort.to) chunk.to = Math.min(chunk.to, cohort.to);
      else chunk.from = Math.max(chunk.from, cohort.to);
      const active = this.isShown(cohort, scale, level, table, styles);
      if (chunk.reread && previousCount > 0) {
        // Reread cohorts can repartition the same active slots, so compare with the previous physical answers.
        const slotsChanged = this.recordSlotChanges(chunk.next, base, cohort.first - base, cohort.end - base, active);
        changed ||= slotsChanged;
      } else if (active !== cohort.active) {
        if (record) this.recordSpan(cohort.first, cohort.end);
        changed = true;
      }
      cohort.active = active;
      if (active) chunk.count += cohort.end - cohort.first;
    }
    if (chunk.reread && previousCount > 0) {
      const tail = chunk.cohorts[chunk.cohorts.length - 1].end - base;
      const tailChanged = this.recordSlotChanges(chunk.next, base, tail, VISIBILITY_CHUNK_SIZE, false);
      changed ||= tailChanged;
    }
    chunk.reread = false;
    if (changed) this.writeNext(index);
  }

  /** One byte per resident slot makes each range query constant-time, independent of cohort fragmentation. */
  private writeNext(index: number): void {
    const { cohorts, next } = this.chunks[index];
    const base = index * VISIBILITY_CHUNK_SIZE;
    let nearest = VISIBILITY_CHUNK_SIZE;
    next.fill(nearest, cohorts[cohorts.length - 1].end - base);
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
