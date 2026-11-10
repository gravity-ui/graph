type TRange = { offset: number; count: number };

export type TInstanceUpload =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "range"; byteOffset: number; data: Float32Array };

const INITIAL_INSTANCES = 64;

/** Packs per-element instance data into one array and tells what to upload to the GPU. */
export class InstanceRanges {
  public readonly floats: number;

  private ranges = new Map<string, TRange>();
  private buffer: Float32Array;
  private used = 0;
  private full = false;
  private dirtyStart = Infinity;
  private dirtyEnd = -1;

  constructor(floatsPerInstance: number) {
    this.floats = floatsPerInstance;
    this.buffer = new Float32Array(INITIAL_INSTANCES * floatsPerInstance);
  }

  public get count(): number {
    return this.used;
  }

  public get data(): Float32Array {
    return this.buffer.subarray(0, this.used * this.floats);
  }

  public set(id: string, instances: Float32Array): void {
    const count = instances.length / this.floats;
    const range = this.ranges.get(id);
    if (range && range.count === count) {
      this.buffer.set(instances, range.offset * this.floats);
      this.dirtyStart = Math.min(this.dirtyStart, range.offset);
      this.dirtyEnd = Math.max(this.dirtyEnd, range.offset + count);
      return;
    }
    if (range) this.remove(id, range);
    this.reserve(this.used + count);
    this.buffer.set(instances, this.used * this.floats);
    this.ranges.set(id, { offset: this.used, count });
    this.used += count;
    this.full = true;
  }

  public delete(id: string): void {
    const range = this.ranges.get(id);
    if (!range) return;
    this.remove(id, range);
    this.full = true;
  }

  public takeUpload(): TInstanceUpload {
    if (this.full) {
      this.clear();
      return { kind: "full" };
    }
    if (this.dirtyEnd < 0) return { kind: "none" };
    const upload: TInstanceUpload = {
      kind: "range",
      byteOffset: this.dirtyStart * this.floats * 4,
      data: this.buffer.subarray(this.dirtyStart * this.floats, this.dirtyEnd * this.floats),
    };
    this.clear();
    return upload;
  }

  private clear(): void {
    this.full = false;
    this.dirtyStart = Infinity;
    this.dirtyEnd = -1;
  }

  private remove(id: string, range: TRange): void {
    const from = (range.offset + range.count) * this.floats;
    this.buffer.copyWithin(range.offset * this.floats, from, this.used * this.floats);
    for (const other of this.ranges.values()) {
      if (other.offset > range.offset) other.offset -= range.count;
    }
    this.used -= range.count;
    this.ranges.delete(id);
  }

  private reserve(instances: number): void {
    const needed = instances * this.floats;
    if (needed <= this.buffer.length) return;
    let capacity = Math.max(this.buffer.length, this.floats);
    while (capacity < needed) capacity *= 2;
    const grown = new Float32Array(capacity);
    grown.set(this.buffer);
    this.buffer = grown;
  }
}
