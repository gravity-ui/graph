import type { TInstanceSpan } from "./InstanceRanges";
import { MIXED_PATH_SOURCE_STRIDE, isSplitPathSource } from "./mixedPathPlan";
import type { OverviewCurveGroups } from "./overviewCurves";
import { MAX_LOCAL_OVERVIEW_RANGES } from "./overviewCurves";

type TOverviewSource = Pick<OverviewCurveGroups, "starts" | "revision" | "pieces" | "lastChange">;
type TInterval = { first: number; end: number };

export type TPathDrawSpan = { first: number; count: number };
export type TPathDrawGroups = readonly (readonly TPathDrawSpan[])[];
type TAddressGroup = { values: Float32Array; offset: number; version: number };

/** Include precisely the addresses this replacement changes. A removed tail requires no upload. */
function includeChanged(dirty: TInterval, previous: Float32Array, at: number, next: Float32Array): void {
  let first = 0;
  let end = next.length;
  while (first < end && previous[at + first] === next[first]) first++;
  while (end > first && previous[at + end - 1] === next[end - 1]) end--;
  if (first < end) {
    dirty.first = Math.min(dirty.first, at + first);
    dirty.end = Math.max(dirty.end, at + end);
  }
}

function physicalAddresses(spans: readonly TPathDrawSpan[]): Float32Array {
  let count = 0;
  for (const span of spans) count += span.count;
  const values = new Float32Array(count);
  let at = 0;
  for (const span of spans) {
    for (let id = span.first, end = id + span.count; id < end; id++) values[at++] = id;
  }
  return values;
}

function localSpanWindow(
  before: readonly TPathDrawSpan[],
  spans: readonly TPathDrawSpan[],
  flags: readonly TInterval[]
) {
  const retained = (a: TPathDrawSpan, b: TPathDrawSpan): boolean => {
    if (a.first !== b.first || a.count !== b.count) return false;
    for (const range of flags) if (a.first < range.end && a.first + a.count > range.first) return false;
    return true;
  };
  const limit = Math.min(before.length, spans.length);
  let left = 0,
    right = 0,
    prefix = 0,
    suffix = 0;
  while (left < limit && retained(before[left], spans[left])) prefix += spans[left++].count;
  while (left + right < limit && retained(before[before.length - 1 - right], spans[spans.length - 1 - right])) {
    right++;
    suffix += spans[spans.length - right].count;
  }
  if (!left && !right) return undefined;
  let oldTail = prefix;
  for (let i = left; i < before.length - right; i++) oldTail += before[i].count;
  let newTail = prefix;
  for (let i = left; i < spans.length - right; i++) newTail += spans[i].count;
  // Use the regular encoder when the changed window is larger than what would be reused.
  if (Math.max(oldTail, newTail) - prefix > prefix + suffix) return undefined;

  return { left, right, prefix, suffix, oldTail, newTail };
}

/** Paths join across physical gaps; non-path draws remain barriers in the logical schedule. */
export function gatheredPathDrawCount(
  runs: readonly { source: number }[],
  gatheredSources: readonly boolean[]
): number {
  let previousSource = -1;
  let count = 0;
  for (const { source } of runs) {
    if (source !== previousSource || !gatheredSources[source]) count++;
    previousSource = source;
  }
  return count;
}

/** The ordered addresses of resident path records. Geometry edits do not change these addresses. */
export class PathDrawIds {
  private input?: readonly TPathDrawSpan[];
  private values = new Float32Array(0);
  private count = 0;
  private spanSnapshot = new Uint32Array(0);
  private spanCount = 0;
  private sources: (TOverviewSource | undefined)[] = [];
  private revisions: (number | undefined)[] = [];
  private offsets = new Uint32Array(0);
  private remapped = false;
  private packed = false;
  private changedPart?: PathDrawIds;
  private splitSources = 0;
  private grouped?: TPathDrawGroups;
  private groupVersion = 0;
  private readonly addressGroups = new WeakMap<readonly TPathDrawSpan[], TAddressGroup>();

  /** Native draws and mixed program barriers always start and end at span boundaries. */
  public offset(canonical: number): number {
    return this.remapped ? this.offsets[canonical] : canonical;
  }

  public get data(): Float32Array {
    return this.values.subarray(0, this.count);
  }

  /** The stock planner supplies immutable, validated Float32 spans in painter order. */
  public updateGroups(groups: TPathDrawGroups): TInstanceSpan | undefined {
    if (groups === this.grouped) return undefined;
    this.changedPart = undefined;
    const version = ++this.groupVersion;
    let offset = 0;
    let from = Infinity;
    let to = 0;
    for (const spans of groups) {
      if (!spans.length) continue;
      let group = this.addressGroups.get(spans);
      if (!group) {
        group = { values: physicalAddresses(spans), offset: -1, version: -1 };
        this.addressGroups.set(spans, group);
      }
      const values = group.values;
      const end = offset + values.length;
      if (group.version !== version - 1 || group.offset !== offset) {
        this.reserve(end);
        // A split, join or move can leave identical addresses at this offset. Keep the GPU interval exact.
        let last = end;
        if (last <= this.count) {
          while (last > offset && this.values[last - 1] === values[last - 1 - offset]) last--;
        }
        if (last > offset) {
          if (from === Infinity) {
            let first = offset;
            while (first < this.count && first < last && this.values[first] === values[first - offset]) first++;
            from = first;
          }
          to = last;
          this.values.set(values, offset);
        }
      }
      group.version = version;
      group.offset = offset;
      offset = end;
    }
    this.grouped = groups;
    this.input = undefined;
    this.spanCount = -1;
    this.remapped = false;
    this.count = offset;
    return from < to ? { byteOffset: from * 4, data: this.values.subarray(from, to) } : undefined;
  }

  private reserve(count: number): void {
    if (count <= this.values.length) return;
    const values = new Float32Array(Math.max(count, this.values.length * 2));
    values.set(this.values);
    this.values = values;
  }

  /** Planner-owned arrays never mutate; retain their identity only for the packed plan entry point. */
  public updatePlan(
    spans: readonly TPathDrawSpan[],
    sources?: readonly (TOverviewSource | undefined)[],
    splitSources = 0
  ): TInstanceSpan | undefined {
    if (!sources?.some(Boolean)) sources = undefined;
    if (
      this.splitSources === splitSources &&
      this.input === spans &&
      this.packed &&
      (sources?.length ?? 0) === this.sources.length &&
      (!sources || sources.every((source, i) => source === this.sources[i] && source?.revision === this.revisions[i]))
    )
      return undefined;
    const patch = this.reuseSpanEnds(spans, sources, splitSources);
    const changed = patch === false ? this.update(spans, sources, true, splitSources) : patch;
    this.input = spans;
    return changed;
  }

  private changedOverviewRanges(sources?: readonly (TOverviewSource | undefined)[]): TInterval[] | undefined {
    if (this.sources.length !== (sources?.length ?? 0)) return undefined;
    const flags: TInterval[] = [];
    for (let i = 0; i < this.sources.length; i++) {
      const source = sources?.[i];
      if (source !== this.sources[i]) return undefined;
      if (!source || source.revision === this.revisions[i]) continue;
      const change = source.lastChange;
      if (
        !change ||
        change.previousRevision !== this.revisions[i] ||
        flags.length + change.ranges.length > MAX_LOCAL_OVERVIEW_RANGES
      )
        return undefined;
      const base = i * MIXED_PATH_SOURCE_STRIDE;
      for (const range of change.ranges) flags.push({ first: base + range.first, end: base + range.end });
    }
    return flags;
  }

  /** A local edit can shift the entire packed suffix while leaving every address in that suffix intact. */
  private reuseSpanEnds(
    spans: readonly TPathDrawSpan[],
    sources: readonly (TOverviewSource | undefined)[] | undefined,
    splitSources: number
  ): TInstanceSpan | undefined | false {
    const before = this.input;
    if (!before || !this.packed || this.splitSources !== splitSources) return false;

    const flags = this.changedOverviewRanges(sources);
    const window = flags && localSpanWindow(before, spans, flags);
    if (!window) return false;
    const { left, right, prefix, suffix, oldTail, newTail } = window;
    const middle = spans.slice(left, spans.length - right);
    const part = (this.changedPart ??= new PathDrawIds());
    part.update(middle, sources, true, splitSources);
    const data = part.data;
    const start = this.offset(prefix);
    const oldEnd = this.offset(oldTail);
    const newEnd = start + data.length;
    const delta = newEnd - oldEnd;
    const dirty = { first: Infinity, end: 0 };
    const previous = this.data;
    includeChanged(dirty, previous, start, data);
    if (delta) includeChanged(dirty, previous, newEnd, previous.subarray(oldEnd));
    this.reserve(this.count + delta);
    if (delta) this.values.copyWithin(newEnd, oldEnd, this.count);
    this.values.set(data, start);
    this.count += delta;
    if (this.remapped) {
      const size = newTail + suffix + 1;
      if (size > this.offsets.length) {
        const grown = new Uint32Array(Math.max(size, this.offsets.length * 2));
        grown.set(this.offsets);
        this.offsets = grown;
      }
      if (oldTail !== newTail) this.offsets.copyWithin(newTail, oldTail, oldTail + suffix + 1);
      if (delta) {
        let pos = newTail;
        for (let i = spans.length - right; i < spans.length; i++) {
          if (!spans[i].count) continue;
          this.offsets[pos] += delta;
          pos += spans[i].count;
        }
        this.offsets[pos] += delta;
      }
      let pos = prefix;
      for (const span of middle) {
        this.offsets[pos] = start + part.offset(pos - prefix);
        pos += span.count;
      }
      this.offsets[pos] = newEnd;
    }
    this.spanCount = -1; // A later full update must take a new snapshot.
    this.revisions = sources?.map((source) => source?.revision) ?? [];
    return dirty.first < dirty.end
      ? { byteOffset: dirty.first * 4, data: this.values.subarray(dirty.first, dirty.end) }
      : undefined;
  }

  /** Returns the changed address interval; removing an unchanged tail needs no buffer write. */
  public update(
    spans: readonly TPathDrawSpan[],
    sources?: readonly (TOverviewSource | undefined)[],
    packed = false,
    splitSources = 0
  ): TInstanceSpan | undefined {
    this.changedPart = undefined;
    if (this.grouped) {
      this.grouped = undefined;
      this.groupVersion++;
    }
    this.input = undefined;
    if (!sources?.some(Boolean)) sources = undefined;
    const sameSources =
      this.splitSources === splitSources &&
      packed === this.packed &&
      (sources?.length ?? 0) === this.sources.length &&
      (!sources || sources.every((source, i) => source === this.sources[i] && source?.revision === this.revisions[i]));
    let firstSpan = 0;
    let canonical = 0;
    if (sameSources) {
      const limit = Math.min(spans.length, this.spanCount);
      while (firstSpan < limit) {
        const { first, count } = spans[firstSpan];
        if (first !== this.spanSnapshot[firstSpan * 2] || count !== this.spanSnapshot[firstSpan * 2 + 1]) break;
        canonical += count;
        firstSpan++;
      }
      if (firstSpan === spans.length && firstSpan === this.spanCount) return undefined;
    }
    let offset = firstSpan ? this.offset(canonical) : 0;
    let count = canonical;
    for (let i = firstSpan; i < spans.length; i++) {
      const { first, count: size } = spans[i];
      // The instanced address is float32, so every record index must be an exactly representable integer.
      if (!Number.isInteger(first) || !Number.isInteger(size) || first < 0 || size < 0 || first + size > 2 ** 24) {
        throw new Error("Path record addresses must be exact float32 integers");
      }
      count += size;
    }
    this.reserve(splitSources ? count * 2 : count);
    const snapshotSize = spans.length * 2;
    if (snapshotSize > this.spanSnapshot.length) {
      const snapshot = new Uint32Array(Math.max(snapshotSize, this.spanSnapshot.length * 2));
      snapshot.set(this.spanSnapshot.subarray(0, firstSpan * 2));
      this.spanSnapshot = snapshot;
    }
    this.remapped = Boolean(sources || splitSources);
    this.splitSources = splitSources;
    this.packed = packed;
    if (!sameSources) {
      this.sources = sources?.slice() ?? [];
      this.revisions = sources?.map((source) => source?.revision) ?? [];
    }
    if (this.remapped && this.offsets.length <= count) {
      const offsets = new Uint32Array(Math.max(count + 1, this.offsets.length * 2));
      offsets.set(this.offsets.subarray(0, canonical + 1));
      this.offsets = offsets;
    }
    let from = Infinity;
    let to = 0;
    for (let span = firstSpan; span < spans.length; span++) {
      const { first, count: size } = spans[span];
      this.spanSnapshot[span * 2] = first;
      this.spanSnapshot[span * 2 + 1] = size;
      const end = first + size;
      if (!this.remapped) {
        // Entirely canonical plans use the original linear gather with no descriptor or offset lookups.
        for (let address = first; address < end; address++, offset++) {
          if (offset >= this.count || this.values[offset] !== address) {
            from = Math.min(from, offset);
            to = offset + 1;
            this.values[offset] = address;
          }
        }
        continue;
      }
      this.offsets[canonical] = offset;
      canonical += size;
      let address = first;
      while (address < end) {
        // A packed span may join the end of one source and the beginning of the next.
        const source = packed ? Math.floor(address / MIXED_PATH_SOURCE_STRIDE) : 0;
        const base = packed ? source * MIXED_PATH_SOURCE_STRIDE : 0;
        const stop = packed ? Math.min(end, base + MIXED_PATH_SOURCE_STRIDE) : end;
        const groups = sources?.[source];
        const starts = groups?.starts;
        const pieces = groups?.pieces ?? 1;
        const split = isSplitPathSource(splitSources, source);
        while (address < stop) {
          const slot = address - base;
          // Each half of a sixteen-chord strip uses eight chords. Its low address bit picks the half.
          let id = split ? base + slot * 2 : address;
          if (starts && starts[address - base] && address + pieces <= stop) {
            id = -1 - id;
            address += pieces;
          } else {
            address++;
          }
          // An overview group keeps its negative tag on both halves.
          for (let half = 0; half < (split ? 2 : 1); half++, offset++) {
            const value = id < 0 ? id - half : id + half;
            if (offset >= this.count || this.values[offset] !== value) {
              from = Math.min(from, offset);
              to = offset + 1;
              this.values[offset] = value;
            }
          }
        }
      }
    }
    this.count = offset;
    if (this.remapped) this.offsets[canonical] = offset;
    this.spanCount = spans.length;
    return from < to ? { byteOffset: from * 4, data: this.values.subarray(from, to) } : undefined;
  }
}
