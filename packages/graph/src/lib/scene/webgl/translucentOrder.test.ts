import { InstanceRanges } from "./InstanceRanges";
import { SCENE_DEPTH } from "./depth";
import {
  MAX_OUT_OF_PLACE,
  MAX_STEPS,
  bucketOf,
  chunkOrder,
  elementSteps,
  mergeBuckets,
  orderTranslucent,
  sourceBuckets,
  splitSteps,
} from "./translucentOrder";
import type { TTranslucentRun, TTranslucentSource } from "./translucentOrder";

/** Instances of 3 floats: (tag, sub, 0); the tag names the primitive so a test can read the buffer order. */
function quads(...entries: [tag: number, sub: number][]): Float32Array {
  return new Float32Array(entries.flatMap(([tag, sub]) => [tag, sub, 0]));
}

function tags(ranges: InstanceRanges): number[] {
  return [...ranges.data].filter((_, index) => index % ranges.floats === 0);
}

/** Writes an element's instances of several programs with their local steps, as the backend does. */
function writeElement(id: string, writes: [ranges: InstanceRanges, instances: Float32Array][]): void {
  const present = writes.filter(([, instances]) => instances.length > 0);
  const steps = elementSteps(present.map(([ranges, instances]) => ({ subs: instances, floats: ranges.floats })));
  present.forEach(([ranges, instances], source) => {
    ranges.setSteps(id, splitSteps(instances, ranges.floats, steps[source]));
  });
}

describe("element steps", () => {
  it("starts a step at each change of program in primitive order", () => {
    // Body and border rects (subs 0, 1), a title of 3 glyphs (sub 2), anchor rects (subs 3, 4).
    const rects = { subs: quads([0, 0], [0, 1], [0, 3], [0, 4]), floats: 3 };
    const glyphs = { subs: quads([0, 2], [0, 2], [0, 2]), floats: 3 };
    expect(elementSteps([rects, glyphs])).toEqual([
      [
        { step: 0, first: 0, count: 2 },
        { step: 2, first: 2, count: 2 },
      ],
      [{ step: 1, first: 0, count: 3 }],
    ]);
  });

  it("puts a path's line pieces before its curve pieces, each a step, and keeps a program's run as one step", () => {
    // Path 0 (lines and curves), path 1 (lines and curves), then two rects.
    const lines = { subs: quads([0, 0], [0, 0], [0, 1]), floats: 3 };
    const curves = { subs: quads([0, 0], [0, 1], [0, 1]), floats: 3 };
    const rects = { subs: quads([0, 2], [0, 3]), floats: 3 };
    expect(elementSteps([lines, curves, rects])).toEqual([
      [
        { step: 0, first: 0, count: 2 },
        { step: 2, first: 2, count: 1 },
      ],
      [
        { step: 1, first: 0, count: 1 },
        { step: 3, first: 1, count: 2 },
      ],
      [{ step: 4, first: 0, count: 2 }],
    ]);
    expect(elementSteps([])).toEqual([]);
  });

  it("cuts instance data into the chunks of the steps", () => {
    const data = quads([1, 0], [2, 0], [3, 2]);
    const parts = splitSteps(data, 3, [
      { step: 0, first: 0, count: 2 },
      { step: 3, first: 2, count: 1 },
    ]);
    expect(parts.map((part) => [part.step, [...part.instances]])).toEqual([
      [0, [1, 0, 0, 2, 0, 0]],
      [3, [3, 2, 0]],
    ]);
  });
});

describe("translucent order", () => {
  it("orders chunks by level, then step, then element key", () => {
    const keys = 2 ** (SCENE_DEPTH.BAND_BITS + SCENE_DEPTH.RANK_BITS);
    expect(chunkOrder(0, 1, keys - 1)).toBeLessThan(chunkOrder(0, 2, 0));
    expect(chunkOrder(0, MAX_STEPS - 1, keys - 1)).toBeLessThan(chunkOrder(1, 0, 0));
    expect(bucketOf(1, 0)).toBe(MAX_STEPS);
  });

  it("draws elements of one level together: one draw per (level, step, program)", () => {
    // Three blocks that do not overlap: body rect (sub 0), title glyphs (sub 1), anchor rects (subs 2, 3).
    const rects = new InstanceRanges(3);
    const glyphs = new InstanceRanges(3);
    for (const [index, id] of ["C", "A", "B"].entries()) {
      const tag = (index + 1) * 10;
      writeElement(id, [
        [rects, quads([tag, 0], [tag + 2, 2], [tag + 3, 3])],
        [glyphs, quads([tag + 1, 1], [tag + 1, 1])],
      ]);
    }
    const keys: Record<string, number> = { A: 1, B: 2, C: 3 };
    const sources: TTranslucentSource[] = [{ instances: rects }, { instances: glyphs }];
    const runs = orderTranslucent(
      sources,
      () => 0,
      (id) => keys[id]
    );
    // Sorted by (level, step, element key): the bodies of A, B, C, then their anchors.
    expect(tags(rects)).toEqual([20, 30, 10, 22, 23, 32, 33, 12, 13]);
    expect(tags(glyphs)).toEqual([21, 21, 31, 31, 11, 11]);
    expect(runs).toEqual([
      { source: 0, first: 0, count: 3 }, // level 0, step 0: every body
      { source: 1, first: 0, count: 6 }, // level 0, step 1: every title
      { source: 0, first: 3, count: 6 }, // level 0, step 2: every anchor, the element's own order kept
    ]);
  });

  it("keeps scene order between overlapping elements: a later level draws after every step of an earlier one", () => {
    // A and B overlap (B on level 1); C overlaps neither (level 0) and joins A's draws.
    const rects = new InstanceRanges(3);
    const glyphs = new InstanceRanges(3);
    writeElement("B", [
      [rects, quads([20, 0])],
      [glyphs, quads([21, 1])],
    ]);
    writeElement("A", [
      [rects, quads([10, 0], [12, 2])],
      [glyphs, quads([11, 1], [11, 1])],
    ]);
    writeElement("C", [[glyphs, quads([31, 0])]]);
    const keys: Record<string, number> = { A: 1, B: 2, C: 3 };
    const levels: Record<string, number> = { A: 0, B: 1, C: 0 };
    const runs = orderTranslucent(
      [{ instances: rects }, { instances: glyphs }],
      (id) => levels[id],
      (id) => keys[id]
    );
    expect(tags(rects)).toEqual([10, 12, 20]);
    expect(tags(glyphs)).toEqual([31, 11, 11, 21]);
    expect(runs).toEqual([
      { source: 0, first: 0, count: 1 }, // level 0, step 0: A's body
      // Level 0, step 0: C's title, its only step, then level 0, step 1: A's title. Nothing lies between them in draw
      // order, so they join one draw.
      { source: 1, first: 0, count: 3 },
      { source: 0, first: 1, count: 2 }, // level 0, step 2: A's badge, then level 1, step 0: B's body (one draw)
      { source: 1, first: 3, count: 1 }, // level 1, step 1: B's title
    ]);
    // B moved away: back on level 0, it shares A's draws.
    levels.B = 0;
    expect(
      orderTranslucent(
        [{ instances: rects }, { instances: glyphs }],
        (id) => levels[id],
        (id) => keys[id]
      )
    ).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 4 },
      { source: 0, first: 2, count: 1 },
    ]);
    expect(tags(rects)).toEqual([10, 20, 12]);
  });

  it("sorts a path's element data with its instances and draws its lines before its curves", () => {
    const lines = new InstanceRanges(3);
    const lineData = new InstanceRanges(3);
    const curves = new InstanceRanges(3);
    const curveData = new InstanceRanges(3);
    const rects = new InstanceRanges(3);
    const write = (id: string, tag: number): void => {
      const steps = elementSteps([
        { subs: quads([0, 0]), floats: 3 },
        { subs: quads([0, 0], [0, 0]), floats: 3 },
        { subs: quads([0, 1]), floats: 3 },
      ]);
      lines.setSteps(id, splitSteps(quads([tag, 9]), 3, steps[0]));
      lineData.setSteps(id, splitSteps(quads([tag, 0]), 3, steps[0]));
      curves.setSteps(id, splitSteps(quads([tag + 1, 9], [tag + 1, 9]), 3, steps[1]));
      curveData.setSteps(id, splitSteps(quads([tag + 1, 0], [tag + 1, 0]), 3, steps[1]));
      rects.setSteps(id, splitSteps(quads([tag + 2, 1]), 3, steps[2]));
    };
    write("Q", 20);
    write("P", 10);
    const keys: Record<string, number> = { P: 1, Q: 2 };
    const runs = orderTranslucent(
      [{ instances: lines, elements: lineData }, { instances: curves, elements: curveData }, { instances: rects }],
      () => 0,
      (id) => keys[id]
    );
    expect(tags(lines)).toEqual([10, 20]);
    expect(tags(lineData)).toEqual(tags(lines));
    expect(tags(curveData)).toEqual(tags(curves));
    expect(runs).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 4 },
      { source: 2, first: 0, count: 2 },
    ]);
  });

  it("follows a raise: a new element key reorders the chunks on a level", () => {
    const rects = new InstanceRanges(3);
    writeElement("A", [[rects, quads([10, 0])]]);
    writeElement("B", [[rects, quads([20, 0])]]);
    const keys: Record<string, number> = { A: 1, B: 2 };
    orderTranslucent(
      [{ instances: rects }],
      () => 0,
      (id) => keys[id]
    );
    expect(tags(rects)).toEqual([10, 20]);
    keys.A = 3;
    expect(
      orderTranslucent(
        [{ instances: rects }],
        () => 0,
        (id) => keys[id]
      )
    ).toEqual([{ source: 0, first: 0, count: 2 }]);
    expect(tags(rects)).toEqual([20, 10]);
  });

  it("has no draws without translucent instances", () => {
    expect(
      orderTranslucent(
        [{ instances: new InstanceRanges(3) }],
        () => 0,
        () => 0
      )
    ).toEqual([]);
  });

  it("groups contiguous ranges of one position into one bucket and puts the lower source first on a tie", () => {
    const rects = new InstanceRanges(3);
    rects.set("A", quads([1, 0]));
    rects.set("B", quads([2, 0], [3, 0]));
    rects.set("C", quads([4, 0]));
    const levels: Record<string, number> = { A: 0, B: 0, C: 1 };
    expect(sourceBuckets(rects, (id) => levels[id])).toEqual([
      { bucket: 0, first: 0, count: 3 },
      { bucket: MAX_STEPS, first: 3, count: 1 },
    ]);
    expect(mergeBuckets([[{ bucket: 5, first: 0, count: 2 }], [{ bucket: 5, first: 0, count: 3 }]])).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 3 },
    ]);
  });

  it("draws a chunk whose level changed from where it lies, without moving the data, until too many are out of place", () => {
    // Blocks B0..B9 apart, each a body rect (step 0) and a title (step 1); sorted once, as after they were added.
    const rects = new InstanceRanges(3);
    const glyphs = new InstanceRanges(3);
    const ids = Array.from({ length: 10 }, (_, index) => `B${index}`);
    ids.forEach((id, index) =>
      writeElement(id, [
        [rects, quads([index * 10, 0])],
        [glyphs, quads([index * 10 + 1, 1])],
      ])
    );
    const keys = new Map(ids.map((id, index) => [id, index]));
    const levels = new Map(ids.map((id) => [id, 0]));
    const sources: TTranslucentSource[] = [{ instances: rects }, { instances: glyphs }];
    const order = (compact: boolean): TTranslucentRun[] =>
      orderTranslucent(
        sources,
        (id) => levels.get(id) ?? 0,
        (id) => keys.get(id) ?? 0,
        compact
      );
    expect(order(true)).toEqual([
      { source: 0, first: 0, count: 10 },
      { source: 1, first: 0, count: 10 },
    ]);
    rects.takeUpload();
    glyphs.takeUpload();
    const layout = rects.layoutRevision;
    // B4 moves onto B3 and goes to level 1. Its chunks stay at index 4.
    levels.set("B4", 1);
    expect(order(false)).toEqual([
      { source: 0, first: 0, count: 4 }, // level 0, step 0: B0..B3
      { source: 0, first: 5, count: 5 }, // B5..B9
      { source: 1, first: 0, count: 4 }, // level 0, step 1
      { source: 1, first: 5, count: 5 },
      { source: 0, first: 4, count: 1 }, // level 1, step 0: B4's body, then its title
      { source: 1, first: 4, count: 1 },
    ]);
    expect(rects.layoutRevision).toBe(layout);
    expect(rects.takeUpload()).toEqual({ kind: "none" });
    // Back on level 0: the original draws.
    levels.set("B4", 0);
    expect(order(false)).toHaveLength(2);
    // More out-of-place chunks than allowed: the data is sorted and the draws are one per position again.
    const many = new InstanceRanges(3);
    const manyIds = Array.from({ length: 2 * MAX_OUT_OF_PLACE + 4 }, (_, index) => `M${index}`);
    manyIds.forEach((id, index) => many.set(id, quads([index, 0])));
    const manyLevels = new Map(manyIds.map((id, index) => [id, index % 2]));
    const runs = orderTranslucent(
      [{ instances: many }],
      (id) => manyLevels.get(id) ?? 0,
      (id) => Number(id.slice(1)),
      false
    );
    expect(runs).toEqual([{ source: 0, first: 0, count: manyIds.length }]);
    expect(tags(many).slice(0, 3)).toEqual([0, 2, 4]);
  });
});
