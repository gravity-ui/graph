import type { TInstanceSpan } from "./InstanceRanges";
import { MIXED_PATH_SOURCE_STRIDE } from "./mixedPathPlan";
import type { OverviewCurveGroups } from "./overviewCurves";

type TOverviewSource = Pick<OverviewCurveGroups, "starts" | "revision" | "pieces">;

export type TPathDrawSpan = { first: number; count: number };

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
  private values = new Float32Array(0);
  private count = 0;
  private spanSnapshot = new Uint32Array(0);
  private spanCount = 0;
  private sources: (TOverviewSource | undefined)[] = [];
  private revisions: (number | undefined)[] = [];
  private offsets = new Uint32Array(0);
  private compact = false;
  private packed = false;

  /** Native draws and mixed program barriers always start and end at span boundaries. */
  public offset(canonical: number): number {
    return this.compact ? this.offsets[canonical] : canonical;
  }

  public get data(): Float32Array {
    return this.values.subarray(0, this.count);
  }

  /** Returns the changed address interval; removing an unchanged tail needs no buffer write. */
  public update(
    spans: readonly TPathDrawSpan[],
    sources?: readonly (TOverviewSource | undefined)[],
    packed = false
  ): TInstanceSpan | undefined {
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
    if (count > this.values.length) {
      const values = new Float32Array(Math.max(count, this.values.length * 2));
      values.set(this.values);
      this.values = values;
    }
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
