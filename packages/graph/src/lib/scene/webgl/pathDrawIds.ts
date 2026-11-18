import type { TInstanceSpan } from "./InstanceRanges";
import { MIXED_PATH_SOURCE_STRIDE } from "./mixedPathPlan";
import type { OverviewCurveGroups } from "./overviewCurves";

type TOverviewSource = Pick<OverviewCurveGroups, "starts" | "revision" | "pieces">;

export type TPathDrawSpan = { first: number; count: number };
export type TPathDrawGroups = readonly (readonly TPathDrawSpan[])[];
type TAddressGroup = { values: Float32Array; offset: number; version: number };

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
  private compact = false;
  private packed = false;
  private grouped?: TPathDrawGroups;
  private groupVersion = 0;
  private readonly addressGroups = new WeakMap<readonly TPathDrawSpan[], TAddressGroup>();

  /** Native draws and mixed program barriers always start and end at span boundaries. */
  public offset(canonical: number): number {
    return this.compact ? this.offsets[canonical] : canonical;
  }

  public get data(): Float32Array {
    return this.values.subarray(0, this.count);
  }

  /** The stock planner supplies immutable, validated Float32 spans in painter order. */
  public updateGroups(groups: TPathDrawGroups): TInstanceSpan | undefined {
    if (groups === this.grouped) return undefined;
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
    this.compact = false;
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
    sources?: readonly (TOverviewSource | undefined)[]
  ): TInstanceSpan | undefined {
    if (!sources?.some(Boolean)) sources = undefined;
    if (
      this.input === spans &&
      this.packed &&
      (sources?.length ?? 0) === this.sources.length &&
      (!sources || sources.every((source, i) => source === this.sources[i] && source?.revision === this.revisions[i]))
    )
      return undefined;
    const changed = this.update(spans, sources, true);
    this.input = spans;
    return changed;
  }

  /** Returns the changed address interval; removing an unchanged tail needs no buffer write. */
  public update(
    spans: readonly TPathDrawSpan[],
    sources?: readonly (TOverviewSource | undefined)[],
    packed = false
  ): TInstanceSpan | undefined {
    if (this.grouped) {
      this.grouped = undefined;
      this.groupVersion++;
    }
    this.input = undefined;
    if (!sources?.some(Boolean)) sources = undefined;
    const sameSources =
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
    this.reserve(count);
    const snapshotSize = spans.length * 2;
    if (snapshotSize > this.spanSnapshot.length) {
      const snapshot = new Uint32Array(Math.max(snapshotSize, this.spanSnapshot.length * 2));
      snapshot.set(this.spanSnapshot.subarray(0, firstSpan * 2));
      this.spanSnapshot = snapshot;
    }
    this.compact = Boolean(sources);
    this.packed = packed;
    if (!sameSources) {
      this.sources = sources?.slice() ?? [];
      this.revisions = sources?.map((source) => source?.revision) ?? [];
    }
    if (sources && this.offsets.length <= count) {
      const offsets = new Uint32Array(Math.max(count + 1, this.offsets.length * 2));
      offsets.set(this.offsets.subarray(0, canonical + 1));
      this.offsets = offsets;
    }
    let from = count;
    let to = 0;
    for (let span = firstSpan; span < spans.length; span++) {
      const { first, count: size } = spans[span];
      this.spanSnapshot[span * 2] = first;
      this.spanSnapshot[span * 2 + 1] = size;
      const end = first + size;
      if (!sources) {
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
        const groups = sources[source];
        const starts = groups?.starts;
        const pieces = groups?.pieces ?? 1;
        while (address < stop) {
          let id = address;
          if (starts && starts[address - base] && address + pieces <= stop) {
            id = -1 - address;
            address += pieces;
          } else {
            address++;
          }
          if (offset >= this.count || this.values[offset] !== id) {
            from = Math.min(from, offset);
            to = offset + 1;
            this.values[offset] = id;
          }
          offset++;
        }
      }
    }
    this.count = offset;
    if (sources) this.offsets[canonical] = offset;
    this.spanCount = spans.length;
    return from < to ? { byteOffset: from * 4, data: this.values.subarray(from, to) } : undefined;
  }
}
