// packages/graph/src/lib/scene/webgl/InstanceRanges.test.ts
import { InstanceRanges, instanceUploadPolicy } from "./InstanceRanges";
import type { TInstanceUpload, TStepInstances } from "./InstanceRanges";

const inst = (...values: number[]): Float32Array => new Float32Array(values);

/** The floats of a range upload of one span; fails for another upload. */
function spanFloats(upload: TInstanceUpload): number[] {
  if (upload.kind !== "range" || upload.spans.length !== 1) throw new Error(`not one span: ${JSON.stringify(upload)}`);
  return [...upload.spans[0].data];
}

/** The spans of a range upload as [first instance, floats], for `floats` floats per instance. */
function spansOf(upload: TInstanceUpload, floats: number): [number, number[]][] {
  if (upload.kind !== "range") throw new Error(`not a range upload: ${upload.kind}`);
  return upload.spans.map((span) => [span.byteOffset / (4 * floats), [...span.data]]);
}

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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 8 }] });
    expect(spanFloats(upload)).toEqual([4, 4, 5, 5]);
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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 0 }] });
    expect(spanFloats(upload)).toEqual([7, 7, 2, 2, 9, 9]);
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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 8 }] });
    expect(spanFloats(upload)).toEqual([8, 8]);
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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 0 }] });
    expect(spanFloats(upload)).toEqual([3, 3, 3, 1, 1, 2]);
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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 0 }] });
    expect(spanFloats(upload)).toEqual([5, 6, 6]);
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
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 4 }] });
    expect(spanFloats(upload)).toEqual([3, 4, 2]);
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

  it("edits an element's instances in place as a rewrite of the same shape does", () => {
    const build = (): InstanceRanges => {
      const ranges = new InstanceRanges(2);
      ranges.set("a", inst(1, 1));
      ranges.setSteps("b", [
        { step: 0, instances: inst(2, 2, 3, 3) },
        { step: 2, instances: inst(4, 4) },
      ]);
      ranges.set("c", inst(5, 5));
      ranges.takeUpload();
      return ranges;
    };
    const edited = build();
    const rewritten = build();
    const layout = edited.layoutRevision;
    const revision = edited.revision;
    const seen: [number, number[]][] = [];
    const found = edited.edit("b", (instances, step) => {
      seen.push([step, [...instances]]);
      for (let i = 1; i < instances.length; i += 2) instances[i] *= 10;
    });
    rewritten.setSteps("b", [
      { step: 0, instances: inst(2, 20, 3, 30) },
      { step: 2, instances: inst(4, 40) },
    ]);
    expect(found).toBe(true);
    expect(seen).toEqual([
      [0, [2, 2, 3, 3]],
      [2, [4, 4]],
    ]);
    expect([...edited.data]).toEqual([...rewritten.data]);
    expect([...edited.data]).toEqual([1, 1, 2, 20, 3, 30, 4, 40, 5, 5]);
    expect(edited.revision).not.toBe(revision);
    expect(edited.layoutRevision).toBe(layout);
    const upload = edited.takeUpload();
    expect(upload).toEqual(rewritten.takeUpload());
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 8 }] });
    expect(layoutOf(edited)).toEqual(layoutOf(rewritten));
  });

  it("sets one step as setSteps does: in place for the same count, moved for another, deleted for none", () => {
    const build = (): InstanceRanges => {
      const ranges = new InstanceRanges(2);
      ranges.set("a", inst(1, 1));
      ranges.set("b", inst(2, 2, 3, 3));
      ranges.setSteps("c", [
        { step: 0, instances: inst(4, 4) },
        { step: 1, instances: inst(5, 5) },
      ]);
      ranges.set("d", inst(6, 6));
      ranges.takeUpload();
      return ranges;
    };
    const steps: [string, Float32Array][] = [
      ["b", inst(7, 7, 8, 8)],
      ["d", inst(9, 9)],
      ["a", inst(1, 2, 3, 4)],
      ["c", inst(10, 10)],
      ["b", inst()],
    ];
    const viaSet = build();
    const viaSteps = build();
    for (const [id, instances] of steps) {
      const revision = viaSet.revision;
      const layouts = [viaSet.layoutRevision, viaSteps.layoutRevision];
      viaSet.set(id, instances);
      viaSteps.setSteps(id, [{ step: 0, instances }]);
      expect(viaSet.revision).not.toBe(revision);
      expect(viaSet.layoutRevision === layouts[0]).toBe(viaSteps.layoutRevision === layouts[1]);
      expect(viaSet.takeUpload()).toEqual(viaSteps.takeUpload());
      expect([...viaSet.data]).toEqual([...viaSteps.data]);
      expect(layoutOf(viaSet)).toEqual(layoutOf(viaSteps));
    }
  });

  it("edits nothing and keeps its revision for an element without instances", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.takeUpload();
    const revision = ranges.revision;
    const edit = jest.fn();
    expect(ranges.edit("b", edit)).toBe(false);
    expect(edit).not.toHaveBeenCalled();
    expect(ranges.revision).toBe(revision);
    expect(ranges.takeUpload()).toEqual({ kind: "none" });
  });

  it("keeps an edit made before the compaction at the element's new offset", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.set("b", inst(2));
    ranges.set("c", inst(3));
    ranges.takeUpload();
    ranges.delete("a");
    ranges.edit("c", (instances) => {
      instances[0] = 9;
    });
    expect([...ranges.data]).toEqual([2, 9]);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
  });
});

describe("InstanceRanges dirty spans", () => {
  const policy = { ...instanceUploadPolicy };
  afterEach(() => Object.assign(instanceUploadPolicy, policy));

  /** `count` elements e0, e1, ... of one instance each (2 floats: the index, then 0), uploaded. */
  const elements = (count: number): InstanceRanges => {
    const ranges = new InstanceRanges(2);
    for (let index = 0; index < count; index++) ranges.set(`e${index}`, inst(index, 0));
    ranges.takeUpload();
    return ranges;
  };
  const rewrite = (ranges: InstanceRanges, ...indexes: number[]): void => {
    for (const index of indexes) ranges.set(`e${index}`, inst(index, 1));
  };

  it("uploads far-apart writes apart and merges close ones, the smallest gap first, within the bytes written", () => {
    // Instances of 8 bytes: gaps under 40 bytes (5 instances) merge.
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 40, maxSpans: 64 });
    const ranges = elements(100);
    // e0 and e1 touch; e3 lies one instance after them; e50 far away.
    rewrite(ranges, 50, 0, 1, 3);
    const upload = ranges.takeUpload();
    expect(spansOf(upload, 2)).toEqual([
      [0, [0, 1, 1, 1, 2, 0, 3, 1]],
      [50, [50, 1]],
    ]);
    expect(upload).toMatchObject({ bytes: 5 * 8 });
    expect(ranges.takeUpload()).toEqual({ kind: "none" });
  });

  it("merges no more gap than the spans' own bytes, so it uploads at most twice what was written", () => {
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 40, maxSpans: 64 });
    const ranges = elements(20);
    // Four spans of 8 bytes with gaps of 16 bytes: the gaps of 48 bytes do not fit the 32 written, two of them do.
    rewrite(ranges, 0, 3, 6, 9);
    const upload = ranges.takeUpload();
    expect(spansOf(upload, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [0, 7],
      [9, 1],
    ]);
    expect(upload.kind === "range" && upload.bytes).toBe(8 * 8);
    expect(upload.kind === "range" && upload.bytes <= 2 * 4 * 8).toBe(true);
  });

  it("caps the spans of an upload, merging the smallest gaps past the threshold within the byte budget", () => {
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 0, maxSpans: 2 });
    const ranges = elements(40);
    // Spans of 4 instances (128 bytes in all) with gaps of 1, 2 and 15 (the enclosing span, 34 instances, passes the
    // budget): the 1, then the 2 merge to meet the cap.
    rewrite(ranges, 0, 1, 2, 3, 5, 6, 7, 8, 11, 12, 13, 14, 30, 31, 32, 33);
    const capped = ranges.takeUpload();
    expect(spansOf(capped, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [0, 15],
      [30, 4],
    ]);
    // Gaps of 9, 1 and 17 instances between single ones (32 bytes): the 1 merges; the 9 would pass the budget, so
    // three spans go up, one more than the cap.
    rewrite(ranges, 30, 12, 10, 0);
    const budgeted = ranges.takeUpload();
    expect(spansOf(budgeted, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [0, 1],
      [10, 3],
      [30, 1],
    ]);
    expect(budgeted.kind === "range" && budgeted.bytes).toBe(5 * 8);
  });

  it("by default sends a dense change as its enclosing span, and keeps the large gaps of a sparser one", () => {
    // Instances of 8 bytes: two dirty regions of 24,000 bytes, 24,000 bytes apart (past the 16 KB threshold): the
    // enclosing span, 72,000 bytes, is within twice the 48,000 written, so it goes up as one.
    const ranges = elements(40000);
    for (let index = 0; index < 3000; index++) rewrite(ranges, index, 6000 + index);
    const upload = ranges.takeUpload();
    expect(spansOf(upload, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([[0, 9000]]);
    expect(upload.kind === "range" && upload.bytes).toBe(9000 * 8);
    // The same regions 64,000 bytes apart: the enclosing span passes the budget, so two spans go up.
    for (let index = 0; index < 3000; index++) rewrite(ranges, index, 11000 + index);
    expect(spansOf(ranges.takeUpload(), 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [0, 3000],
      [11000, 3000],
    ]);
    // Three regions, 24,000 and 200,000 bytes apart: the enclosing span passes the budget, and the 24,000-byte gap,
    // which would fit it, is past the threshold with fewer than 64 spans: three spans, exactly the dirty bytes.
    for (let index = 0; index < 3000; index++) rewrite(ranges, index, 6000 + index, 34000 + index);
    const sparser = ranges.takeUpload();
    expect(spansOf(sparser, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [0, 3000],
      [6000, 3000],
      [34000, 3000],
    ]);
    expect(sparser.kind === "range" && sparser.bytes).toBe(9000 * 8);
  });

  it("never uploads more than twice the dirty bytes, whatever the span cap (Codex's case)", () => {
    // 6,501 texts of two glyphs (28 floats each), every hundredth one rewritten: 65 texts, 14,560 bytes.
    const ranges = new InstanceRanges(28);
    for (let index = 0; index < 6501; index++) ranges.set(`t${index}`, new Float32Array(2 * 28).fill(index));
    ranges.takeUpload();
    for (let index = 100; index < 6501; index += 100) ranges.set(`t${index}`, new Float32Array(2 * 28).fill(-index));
    const upload = ranges.takeUpload();
    const dirty = 65 * 2 * 28 * 4;
    expect(dirty).toBe(14560);
    if (upload.kind !== "range") throw new Error(upload.kind);
    expect(upload.bytes).toBeLessThanOrEqual(2 * dirty);
    // The gaps (99 texts, 22,176 bytes) are past the budget: one span per text.
    expect(upload.spans).toHaveLength(65);
    expect(upload.bytes).toBe(dirty);
    upload.spans.forEach((span, index) => {
      expect(span.byteOffset).toBe((index + 1) * 100 * 2 * 28 * 4);
      expect(span.data[0]).toBe(-(index + 1) * 100);
    });
  });

  it("sorts spans written out of buffer order and joins overlapping ones", () => {
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 0, maxSpans: 64 });
    const ranges = elements(30);
    rewrite(ranges, 20, 5, 6, 20, 4);
    expect(spansOf(ranges.takeUpload(), 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([
      [4, 3],
      [20, 1],
    ]);
  });

  it("keeps sparse spans past the spans it joins in place, within the byte budget", () => {
    // 4,999 scattered writes from the end, past the 4,096 spans at which they are joined in place.
    const scattered = (): InstanceRanges => {
      const ranges = elements(10000);
      for (let index = 9998; index >= 2; index -= 2) rewrite(ranges, index);
      return ranges;
    };
    const dirty = 4999 * 8;
    // No merging: every span apart, exactly the dirty bytes.
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 0, maxSpans: 1e6, enclose: false });
    const apart = scattered().takeUpload();
    if (apart.kind !== "range") throw new Error(apart.kind);
    expect(apart.spans).toHaveLength(4999);
    expect(apart.bytes).toBe(dirty);
    expect(spansOf(apart, 2).every(([first, floats]) => floats[0] === first && floats[1] === 1)).toBe(true);
    // The default policy: the enclosing span fits the budget, so it goes up as one, still at most twice the bytes.
    Object.assign(instanceUploadPolicy, policy);
    const merged = scattered().takeUpload();
    expect(spansOf(merged, 2).map(([first, floats]) => [first, floats.length / 2])).toEqual([[2, 9997]]);
    expect(merged.kind === "range" && merged.bytes <= 2 * dirty).toBe(true);
    // Every third of 20,000 in a shuffled order: the joins in place keep every span; the budget stops the merging.
    const ranges = elements(20000);
    const order = Array.from({ length: 6667 }, (_, index) => index * 3);
    const draw = random(17);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(draw() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    rewrite(ranges, ...order);
    const sparse = ranges.takeUpload();
    if (sparse.kind !== "range") throw new Error(sparse.kind);
    expect(sparse.bytes).toBeLessThanOrEqual(2 * 6667 * 8);
    const written = new Set(order);
    for (const [first, floats] of spansOf(sparse, 2)) {
      for (let i = 0; i < floats.length; i += 2) {
        expect(floats[i]).toBe(first + i / 2);
        expect(floats[i + 1]).toBe(written.has(first + i / 2) ? 1 : 0);
      }
    }
    expect(spansOf(sparse, 2).reduce((sum, [, floats]) => sum + floats.length / 2, 0)).toBeGreaterThanOrEqual(6667);
  });

  it("edits a span of an element's instances in place and uploads only that span", () => {
    Object.assign(instanceUploadPolicy, { mergeGapBytes: 0, maxSpans: 64, enclose: false });
    const build = (): InstanceRanges => {
      const ranges = new InstanceRanges(2);
      ranges.set("a", inst(1, 1));
      ranges.setSteps("b", [
        { step: 0, instances: inst(2, 2, 3, 3, 4, 4) },
        { step: 2, instances: inst(5, 5, 6, 6) },
      ]);
      ranges.set("c", inst(7, 7));
      ranges.takeUpload();
      return ranges;
    };
    const ranges = build();
    const layout = ranges.layoutRevision;
    const revision = ranges.revision;
    // b's instances 1 and 2 (step 0), then its instance 4 (the second of step 2).
    expect(
      ranges.editSpan("b", 1, 2, (data, at) => {
        data[at + 1] = 30;
        data[at + 3] = 40;
      })
    ).toBe(true);
    expect(
      ranges.editSpan("b", 4, 1, (data, at) => {
        data[at + 1] = 60;
      })
    ).toBe(true);
    expect([...ranges.data]).toEqual([1, 1, 2, 2, 3, 30, 4, 40, 5, 5, 6, 60, 7, 7]);
    expect(ranges.revision).not.toBe(revision);
    expect(ranges.layoutRevision).toBe(layout);
    expect(spansOf(ranges.takeUpload(), 2)).toEqual([
      [2, [3, 30, 4, 40]],
      [5, [6, 60]],
    ]);
    // The same data as a rewrite of the same shape.
    const rewritten = build();
    rewritten.setSteps("b", [
      { step: 0, instances: inst(2, 2, 3, 30, 4, 40) },
      { step: 2, instances: inst(5, 5, 6, 60) },
    ]);
    expect([...rewritten.data]).toEqual([...ranges.data]);
    expect(layoutOf(rewritten)).toEqual(layoutOf(ranges));
    // A span must lie in one range, inside the element; an element without instances edits nothing.
    const edit = jest.fn();
    expect(() => ranges.editSpan("b", 2, 2, edit)).toThrow(/crosses/);
    expect(() => ranges.editSpan("b", 5, 1, edit)).toThrow(/past/);
    expect(ranges.editSpan("missing", 0, 1, edit)).toBe(false);
    expect(edit).not.toHaveBeenCalled();
    expect(ranges.takeUpload()).toEqual({ kind: "none" });
  });
});

/** A seeded generator in [0, 1) (Park-Miller): the random tests are repeatable. */
function random(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

type TModelRange = { id: string; step: number; values: number[] };

/** Eager compaction, as the list worked before lazy removal: a removal closes its gap at once. */
class EagerModel {
  public ranges: TModelRange[] = [];

  constructor(private readonly floats: number) {}

  public setSteps(id: string, steps: readonly { step: number; instances: Float32Array }[]): void {
    const chunks = steps.filter((chunk) => chunk.instances.length > 0);
    if (chunks.length === 0) {
      this.delete(id);
      return;
    }
    const current = this.ranges.filter((range) => range.id === id);
    const same =
      current.length === chunks.length &&
      current.every(
        (range, index) => range.step === chunks[index].step && range.values.length === chunks[index].instances.length
      );
    if (same) {
      current.forEach((range, index) => {
        range.values = [...chunks[index].instances];
      });
      return;
    }
    this.delete(id);
    for (const chunk of chunks) this.ranges.push({ id, step: chunk.step, values: [...chunk.instances] });
  }

  public delete(id: string): void {
    this.ranges = this.ranges.filter((range) => range.id !== id);
  }

  public sortBy(keyOf: (id: string, step: number) => number): void {
    this.ranges = this.ranges
      .map((range, index) => ({ range, index, key: keyOf(range.id, range.step) }))
      .sort((a, b) => a.key - b.key || a.index - b.index)
      .map(({ range }) => range);
  }

  public data(): number[] {
    return this.ranges.flatMap((range) => range.values);
  }

  public layout(): [string, number, number, number][] {
    let offset = 0;
    return this.ranges.map((range) => {
      const entry: [string, number, number, number] = [range.id, offset, range.values.length / this.floats, range.step];
      offset += range.values.length / this.floats;
      return entry;
    });
  }
}

function layoutOf(ranges: InstanceRanges): [string, number, number, number][] {
  const seen: [string, number, number, number][] = [];
  ranges.forEachRange((id, offset, count, step) => seen.push([id, offset, count, step]));
  return seen;
}

describe("InstanceRanges lazy removal", () => {
  it("gives the data, count and layout of eager compaction after many removals and one read", () => {
    const floats = 2;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const draw = random(seed);
      const ranges = new InstanceRanges(floats);
      const model = new EagerModel(floats);
      const ids = Array.from({ length: 24 }, (_, index) => `e${index}`);
      let value = 0;
      const instances = (count: number): Float32Array =>
        new Float32Array(Array.from({ length: count * floats }, () => ++value));
      for (let round = 0; round < 12; round++) {
        // A frame of changes: adds, reshapes, in-place rewrites, step changes and deletes, then (mostly) one read.
        for (let change = 0; change < 30; change++) {
          const id = ids[Math.floor(draw() * ids.length)];
          const roll = draw();
          if (roll < 0.2) {
            ranges.delete(id);
            model.delete(id);
          } else {
            const steps =
              roll < 0.5
                ? [{ step: 0, instances: instances(1 + Math.floor(draw() * 3)) }]
                : [
                    { step: Math.floor(draw() * 2), instances: instances(Math.floor(draw() * 3)) },
                    { step: 2 + Math.floor(draw() * 2), instances: instances(1 + Math.floor(draw() * 2)) },
                  ];
            ranges.setSteps(id, steps);
            model.setSteps(id, steps);
          }
        }
        if (round % 3 === 2) {
          const keys = new Map(ids.map((id) => [id, draw()]));
          const keyOf = (id: string, step: number): number => step * 10 + (keys.get(id) ?? 0);
          ranges.sortBy(keyOf);
          model.sortBy(keyOf);
        }
        if (round % 4 !== 3) {
          expect([...ranges.data]).toEqual(model.data());
          expect(ranges.count).toBe(model.data().length / floats);
          expect(layoutOf(ranges)).toEqual(model.layout());
        }
      }
      expect([...ranges.data]).toEqual(model.data());
      expect(layoutOf(ranges)).toEqual(model.layout());
      expect(ranges.takeUpload()).toEqual({ kind: "full" });
    }
  });

  it("walks the list once per frame however many elements it reshapes or deletes, when the buffer has room", () => {
    const compact = jest.spyOn(InstanceRanges.prototype as unknown as { compact(): void }, "compact");
    try {
      const ranges = new InstanceRanges(1);
      const ids = Array.from({ length: 100 }, (_, index) => `e${index}`);
      // Room for 256 instances: a large element grows the buffer and goes again.
      ranges.set("large", new Float32Array(200));
      ranges.delete("large");
      for (const id of ids) ranges.set(id, inst(1));
      expect(ranges.takeUpload()).toEqual({ kind: "full" });
      expect(compact).toHaveBeenCalledTimes(1);
      // One frame reshapes every element: each moves to another step, so each range is removed and appended.
      for (const id of ids) ranges.setSteps(id, [{ step: 1, instances: inst(2) }]);
      expect(compact).toHaveBeenCalledTimes(1);
      // The frame's reads: the upload, the count to draw, the translucent order.
      expect(ranges.takeUpload()).toEqual({ kind: "full" });
      expect(ranges.count).toBe(100);
      layoutOf(ranges);
      expect(compact).toHaveBeenCalledTimes(2);
      // The next frame deletes half of them: one more walk.
      for (const id of ids.slice(0, 50)) ranges.delete(id);
      expect(ranges.count).toBe(50);
      expect([...ranges.data]).toEqual(Array.from({ length: 50 }, () => 2));
      expect(ranges.takeUpload()).toEqual({ kind: "full" });
      expect(compact).toHaveBeenCalledTimes(3);
      // In-place rewrites remove nothing: no walk.
      for (const id of ids.slice(50)) ranges.setSteps(id, [{ step: 1, instances: inst(3) }]);
      expect(ranges.takeUpload()).toMatchObject({ kind: "range", spans: [{ byteOffset: 0 }] });
      expect(compact).toHaveBeenCalledTimes(3);
    } finally {
      compact.mockRestore();
    }
  });

  it("keeps the buffer of eager compaction after a reshape or a replacement of every element", () => {
    const compact = jest.spyOn(InstanceRanges.prototype as unknown as { compact(): void }, "compact");
    const bufferOf = (ranges: InstanceRanges): number => (ranges as unknown as { buffer: Float32Array }).buffer.length;
    // Eager compaction grows the buffer only for the live instances: 64 instances doubled until they fit.
    const eager = (live: number): number => 64 * 2 ** Math.max(0, Math.ceil(Math.log2(live / 64)));
    try {
      const ranges = new InstanceRanges(1);
      const ids = Array.from({ length: 1000 }, (_, index) => `e${index}`);
      for (const id of ids) ranges.set(id, inst(1, 1, 1));
      ranges.takeUpload();
      expect(bufferOf(ranges)).toBe(eager(3000));
      compact.mockClear();
      // Every element grows by one instance: 4000 live ones still fit 4096, as without dead ranges.
      for (const id of ids) ranges.set(id, inst(2, 2, 2, 2));
      ranges.takeUpload();
      expect(ranges.count).toBe(4000);
      expect(bufferOf(ranges)).toBe(eager(4000));
      // The slack shrinks to 96 instances: a few walks for the appends that found the buffer full, never more than
      // FORCED_COMPACTIONS + 2 (10), not one per element.
      expect(compact.mock.calls.length).toBeLessThanOrEqual(10);
      // A replacement of every element: all are deleted, then added again.
      for (const id of ids) ranges.delete(id);
      for (const id of ids) ranges.set(`new-${id}`, inst(5, 5, 5, 5));
      ranges.takeUpload();
      expect(bufferOf(ranges)).toBe(eager(4000));
      expect([...ranges.data]).toEqual(Array.from({ length: 4000 }, () => 5));
    } finally {
      compact.mockRestore();
    }
  });

  it("walks a nearly full buffer a constant number of times for a same-size reshape of every element", () => {
    const compact = jest.spyOn(InstanceRanges.prototype as unknown as { compact(): void }, "compact");
    const bufferOf = (ranges: InstanceRanges): number => (ranges as unknown as { buffer: Float32Array }).buffer.length;
    const eager = (live: number): number => 64 * 2 ** Math.max(0, Math.ceil(Math.log2(live / 64)));
    // Elements of `size` instances: 1,000 x 4 fill 4000 of 4096, 10,000 x 13 fill 130,000 of 131,072. Each frame
    // reshapes every element without changing the live count: a move to another step, or alternately one instance more
    // and one fewer. Without the growth past FORCED_COMPACTIONS these walk 40 and 121 times.
    // `frame` 0 or 1: each frame changes every element again.
    const reshapes: [string, (index: number, size: number, frame: number) => TStepInstances][] = [
      ["another step", (_, size, frame) => ({ step: frame + 1, instances: new Float32Array(size) })],
      [
        "one more or one fewer",
        (index, size, frame) => ({ step: 0, instances: new Float32Array(size + ((index + frame) % 2 ? 1 : -1)) }),
      ],
    ];
    try {
      for (const [count, size] of [
        [1000, 4],
        [10000, 13],
      ]) {
        for (const [name, reshape] of reshapes) {
          const ranges = new InstanceRanges(1);
          for (let index = 0; index < count; index++) ranges.set(`e${index}`, new Float32Array(size));
          ranges.takeUpload();
          const live = count * size;
          expect(bufferOf(ranges)).toBe(eager(live));
          // Nearly full: the slack is under 2.5 % of the live instances.
          expect(eager(live) - live).toBeLessThan(live / 40);
          compact.mockClear();
          for (let index = 0; index < count; index++) ranges.setSteps(`e${index}`, [reshape(index, size, 0)]);
          expect([name, ranges.takeUpload()]).toEqual([name, { kind: "full" }]);
          expect([name, ranges.count]).toEqual([name, live]);
          expect([name, compact.mock.calls.length <= 10]).toEqual([name, true]);
          expect([name, bufferOf(ranges) <= 2 * eager(live)]).toEqual([name, true]);
          // The next frame finds room: its reshape walks the list once, at the read.
          compact.mockClear();
          for (let index = 0; index < count; index++) ranges.setSteps(`e${index}`, [reshape(index, size, 1)]);
          ranges.takeUpload();
          expect([name, ranges.count, compact.mock.calls.length]).toEqual([name, live, 1]);
        }
      }
    } finally {
      compact.mockRestore();
    }
  });

  it("keeps an in-place write made before the compaction at the element's new offset", () => {
    const ranges = new InstanceRanges(1);
    ranges.set("a", inst(1));
    ranges.set("b", inst(2));
    ranges.set("c", inst(3));
    ranges.takeUpload();
    ranges.delete("a");
    // Same count: written in place at its old offset, then moved by the compaction.
    ranges.set("c", inst(9));
    expect([...ranges.data]).toEqual([2, 9]);
    expect(ranges.takeUpload()).toEqual({ kind: "full" });
    ranges.set("c", inst(8));
    const upload = ranges.takeUpload();
    expect(upload).toMatchObject({ kind: "range", spans: [{ byteOffset: 4 }] });
    expect(spanFloats(upload)).toEqual([8]);
  });
});
