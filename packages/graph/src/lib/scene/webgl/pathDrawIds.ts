import type { TInstanceSpan } from "./InstanceRanges";

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
  private spans: TPathDrawSpan[] = [];

  public get data(): Float32Array {
    return this.values.subarray(0, this.count);
  }

  /** Returns the changed address interval; removing an unchanged tail needs no buffer write. */
  public update(spans: readonly TPathDrawSpan[]): TInstanceSpan | undefined {
    if (
      spans.length === this.spans.length &&
      spans.every((span, i) => span.first === this.spans[i].first && span.count === this.spans[i].count)
    ) {
      return undefined;
    }
    let count = 0;
    for (const { first, count: size } of spans) {
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
    let from = count;
    let to = 0;
    let offset = 0;
    for (const { first, count: size } of spans) {
      for (let i = 0; i < size; i++, offset++) {
        const address = first + i;
        if (offset >= this.count || this.values[offset] !== address) {
          from = Math.min(from, offset);
          to = offset + 1;
          this.values[offset] = address;
        }
      }
    }
    this.count = count;
    this.spans = spans.map(({ first, count: size }) => ({ first, count: size }));
    return from < to ? { byteOffset: from * 4, data: this.values.subarray(from, to) } : undefined;
  }
}
