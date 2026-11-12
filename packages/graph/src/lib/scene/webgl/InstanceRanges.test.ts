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

  it("lists ranges in buffer order, also after a delete and a count change", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.set("b", inst(2, 2));
    ranges.set("c", inst(3));
    ranges.delete("a");
    ranges.set("b", inst(4, 4, 4));
    const seen: [string, number, number, number][] = [];
    ranges.forEachRange((id, offset, count, step) => seen.push([id, offset, count, step]));
    expect(seen).toEqual([
      ["c", 0, 1, 0],
      ["b", 1, 3, 0],
    ]);
  });

  it("sorts ranges by a key, moving the instance data and uploading the span that moved", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1, 1));
    ranges.set("b", inst(2));
    ranges.set("c", inst(3, 3, 3));
    ranges.takeUpload();
    const keys: Record<string, number> = { a: 5, b: 9, c: 1 };
    const before = ranges.revision;
    expect(ranges.sortBy((id) => keys[id])).toBe(true);
    expect([...ranges.data]).toEqual([3, 3, 3, 1, 1, 2]);
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 0 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([3, 3, 3, 1, 1, 2]);
    expect(ranges.revision).not.toBe(before);
    const seen: string[] = [];
    ranges.forEachRange((id) => seen.push(id));
    expect(seen).toEqual(["c", "a", "b"]);
    // A later in-place write lands at the sorted offset.
    ranges.set("a", inst(7, 7));
    expect([...ranges.data]).toEqual([3, 3, 3, 7, 7, 2]);
  });

  it("leaves sorted ranges, their upload and their revision alone", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.set("b", inst(2));
    ranges.takeUpload();
    const before = ranges.revision;
    expect(ranges.sortBy((id) => (id === "a" ? 1 : 2))).toBe(false);
    expect(ranges.takeUpload()).toEqual({ kind: "none" });
    expect(ranges.revision).toBe(before);
  });

  it("changes its revision on every write and delete, and never repeats one of another list", () => {
    const first = new InstanceRanges(1);
    const second = new InstanceRanges(1);
    expect(first.revision).not.toBe(second.revision);
    const start = first.revision;
    first.set("a", inst(1));
    const added = first.revision;
    first.set("a", inst(2));
    const rewritten = first.revision;
    first.delete("missing");
    expect(first.revision).toBe(rewritten);
    first.delete("a");
    expect(new Set([start, added, rewritten, first.revision]).size).toBe(4);
  });

  it("keeps a range per step of an element and rewrites them in place when the steps and counts are the same", () => {
    const ranges = new InstanceRanges(1);
    ranges.setSteps("a", [
      { step: 0, instances: inst(1) },
      { step: 2, instances: inst(2, 2) },
    ]);
    ranges.set("b", inst(3));
    const seen: [string, number, number, number][] = [];
    ranges.forEachRange((id, offset, count, step) => seen.push([id, offset, count, step]));
    expect(seen).toEqual([
      ["a", 0, 1, 0],
      ["a", 1, 2, 2],
      ["b", 3, 1, 0],
    ]);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    ranges.setSteps("a", [
      { step: 0, instances: inst(5) },
      { step: 2, instances: inst(6, 6) },
    ]);
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 0 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([5, 6, 6]);
    // Other steps: the old ranges go, the new ones go to the end; an empty step is skipped.
    ranges.setSteps("a", [
      { step: 1, instances: inst(7) },
      { step: 3, instances: inst() },
    ]);
    expect([...ranges.data]).toEqual([3, 7]);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    expect(() =>
      ranges.setSteps("c", [
        { step: 1, instances: inst(1) },
        { step: 1, instances: inst(1) },
      ])
    ).toThrow(/ascend/);
  });

  it("deletes every step of an element and closes every gap", () => {
    const ranges = new InstanceRanges(1);
    ranges.setSteps("a", [{ step: 0, instances: inst(1, 1) }]);
    ranges.setSteps("b", [
      { step: 0, instances: inst(2) },
      { step: 1, instances: inst(3, 3) },
    ]);
    ranges.set("c", inst(4));
    // Put b's step 1 after c, so b's ranges lie apart.
    ranges.sortBy((id, step) => (id === "b" && step === 1 ? 10 : { a: 1, b: 2, c: 3 }[id] ?? 0));
    expect([...ranges.data]).toEqual([1, 1, 2, 4, 3, 3]);
    ranges.takeUpload();
    ranges.delete("b");
    expect([...ranges.data]).toEqual([1, 1, 4]);
    expect(ranges.count).toBe(3);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    ranges.set("c", inst(9));
    expect([...ranges.data]).toEqual([1, 1, 9]);
    ranges.setSteps("a", []);
    expect([...ranges.data]).toEqual([9]);
  });

  it("sorts the steps of one element apart and uploads only the span between the first and last range that moved", () => {
    const ranges = new InstanceRanges(1);
    // a, b, c, d with one instance each; then e with steps 0 and 1.
    for (const [index, id] of ["a", "b", "c", "d"].entries()) ranges.set(id, inst(index + 1));
    ranges.setSteps("e", [
      { step: 0, instances: inst(5) },
      { step: 1, instances: inst(6) },
    ]);
    ranges.takeUpload();
    // Order by (step, element): step 0 of everything first, then e's step 1.
    const keys: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    expect(ranges.sortBy((id, step) => step * 10 + keys[id])).toBe(false);
    // b moves to the end of step 0: c and d move up, a and e's step 1 stay.
    keys.b = 4.5;
    expect(ranges.sortBy((id, step) => step * 10 + keys[id])).toBe(true);
    expect([...ranges.data]).toEqual([1, 3, 4, 2, 5, 6]);
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", byteOffset: 4 });
    expect(upload.kind === "range" ? [...upload.data] : []).toEqual([3, 4, 2]);
  });

  it("changes its layout revision when ranges are added, removed or moved, not on an in-place rewrite", () => {
    const ranges = new InstanceRanges(1);
    const start = ranges.layoutRevision;
    ranges.set("a", inst(1));
    ranges.set("b", inst(2));
    const added = ranges.layoutRevision;
    expect(added).not.toBe(start);
    ranges.set("a", inst(3));
    expect(ranges.layoutRevision).toBe(added);
    ranges.sortBy((id) => (id === "a" ? 2 : 1));
    const sorted = ranges.layoutRevision;
    expect(sorted).not.toBe(added);
    ranges.sortBy((id) => (id === "a" ? 2 : 1));
    expect(ranges.layoutRevision).toBe(sorted);
    ranges.delete("a");
    expect(ranges.layoutRevision).not.toBe(sorted);
  });
});
