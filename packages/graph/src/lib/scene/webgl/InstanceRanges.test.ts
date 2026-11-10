// packages/graph/src/lib/scene/webgl/InstanceRanges.test.ts
import { InstanceRanges } from "./InstanceRanges";

const inst = (...values: number[]): Float32Array => new Float32Array(values);

describe("InstanceRanges", () => {
  it("packs elements and uploads fully after an add", () => {
    const ranges = new InstanceRanges(2);
    ranges.set("a", inst(1, 1, 2, 2));
    ranges.set("b", inst(3, 3));
    expect(ranges.count).toBe(3);
    expect([...ranges.data]).toEqual([1, 1, 2, 2, 3, 3]);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    expect(ranges.takeUpload()).toEqual({ kind: "none" });
  });

  it("rewrites in place when the count is unchanged", () => {
    const ranges = new InstanceRanges(2);
    ranges.set("a", inst(1, 1));
    ranges.set("b", inst(2, 2, 3, 3));
    ranges.takeUpload();
    ranges.set("b", inst(4, 4, 5, 5));
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 8 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([4, 4, 5, 5]);
  });

  it("compacts after delete and after a count change", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.set("b", inst(2));
    ranges.set("c", inst(3));
    ranges.delete("b");
    ranges.set("a", inst(7, 8));
    expect([...ranges.data].sort((x, y) => x - y)).toEqual([3, 7, 8]);
    expect(ranges.count).toBe(3);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
  });

  it("merges several in-place writes into one covering range", () => {
    const ranges = new InstanceRanges(2);
    ranges.set("a", inst(1, 1));
    ranges.set("b", inst(2, 2));
    ranges.set("c", inst(3, 3));
    ranges.takeUpload();
    ranges.set("c", inst(9, 9));
    ranges.set("a", inst(7, 7));
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 0 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([7, 7, 2, 2, 9, 9]);
  });

  it("keeps shifted offsets correct after a delete", () => {
    const ranges = new InstanceRanges(2);
    ranges.set("a", inst(1, 1));
    ranges.set("b", inst(2, 2, 2, 2));
    ranges.set("c", inst(3, 3));
    ranges.delete("b");
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    ranges.set("c", inst(8, 8));
    expect([...ranges.data]).toEqual([1, 1, 8, 8]);
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 8 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([8, 8]);
  });
});
