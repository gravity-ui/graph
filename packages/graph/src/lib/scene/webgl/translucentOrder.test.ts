import { InstanceRanges } from "./InstanceRanges";
import { SCENE_DEPTH } from "./depth";
import {
  ELEMENT_KEYS,
  MAX_OUT_OF_PLACE,
  bucketOf,
  chunkOrder,
  elementSteps,
  filterTranslucentRuns,
  maxStepsOf,
  mergeBuckets,
  orderTranslucent,
  sortBuckets,
  sourceBuckets,
  splitSteps,
} from "./translucentOrder";
import type { TTranslucentOrderCache, TTranslucentRun, TTranslucentSource } from "./translucentOrder";

/** The narrowest sub-order width, which the tests use unless they change it. */
const BITS = SCENE_DEPTH.MIN_SUB_BITS;

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
  it("keeps a retained schedule on in-place subs edits but invalidates it when its local steps change", () => {
    const ranges = new InstanceRanges(3);
    ranges.setSteps("a", [{ step: 0, instances: quads([1, 0], [2, 1]) }]);
    ranges.setSteps("b", [{ step: 1, instances: quads([3, 2]) }]);
    ranges.retainLayout();
    const levelOf = (): number => 0;
    const before = sourceBuckets(ranges, levelOf, BITS);
    const layout = ranges.layoutRevision;
    ranges.edit("a", (data) => {
      data[1] += 4;
      data[4] += 4;
    });
    expect(ranges.layoutRevision).toBe(layout);
    expect(sourceBuckets(ranges, levelOf, BITS)).toEqual(before);
    ranges.setSteps("a", [{ step: 2, instances: quads([1, 4], [2, 5]) }]);
    expect(ranges.layoutRevision).not.toBe(layout);
    expect(orderTranslucent([{ instances: ranges }], levelOf, () => 0, BITS)).toEqual([
      { source: 0, first: 2, count: 1 },
      { source: 0, first: 0, count: 2 },
    ]);
  });

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

  it("reads each source's subs at its own float: glyph subs in a list of one float per glyph", () => {
    const rects = { subs: quads([0, 0], [0, 1], [0, 3], [0, 4]), floats: 3 };
    const glyphSubs = { subs: new Float32Array([2, 2, 2]), floats: 1, subFloat: 0 };
    expect(elementSteps([rects, glyphSubs])).toEqual([
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
  it("reuses source snapshots and the merged schedule when their effective buckets stay unchanged", () => {
    const a = new InstanceRanges(3);
    const b = new InstanceRanges(3);
    a.set("a", quads([1, 0], [2, 0]));
    b.set("b", quads([3, 0]));
    a.retainLayout();
    b.retainLayout();
    const sources = [{ instances: a }, { instances: b }];
    const cache: TTranslucentOrderCache = { levelRevision: 0 };
    const levels: Record<string, number> = { a: 0, b: 1 };
    const order = () =>
      orderTranslucent(
        sources,
        (id) => levels[id],
        () => 0,
        BITS,
        false,
        undefined,
        cache
      );
    const first = order();
    const visitA = jest.spyOn(a, "forEachRange");
    const visitB = jest.spyOn(b, "forEachRange");
    expect(order()).toBe(first);
    a.edit("a", (data) => {
      data[0] = 10;
    });
    expect(order()).toBe(first);
    expect(visitA).not.toHaveBeenCalled();
    expect(visitB).not.toHaveBeenCalled();
    levels.a = 2;
    cache.levelRevision = 1;
    cache.changedLevelIds = ["a"];
    const moved = order();
    expect(moved).toEqual([
      { source: 1, first: 0, count: 1 },
      { source: 0, first: 0, count: 2 },
    ]);
    expect(moved).not.toBe(first);
    expect(visitA).toHaveBeenCalled();
    expect(visitB).not.toHaveBeenCalled();
    visitA.mockClear();
    visitB.mockClear();
    expect(order()).toBe(moved);
    expect(visitA).not.toHaveBeenCalled();
    expect(visitB).not.toHaveBeenCalled();
    visitA.mockRestore();
    visitB.mockRestore();
  });

  it("rescans a source when the latest level delta cannot describe the changes since its snapshot", () => {
    const edges = new InstanceRanges(3);
    const blocks = new InstanceRanges(3);
    edges.set("e", quads([1, 0]));
    blocks.set("b", quads([2, 0]));
    edges.retainLayout();
    blocks.retainLayout();
    const sources = [{ instances: edges }, { instances: blocks }];
    const cache: TTranslucentOrderCache = { levelRevision: 2 };
    const levels: Record<string, number> = { e: 1, b: 0, added: 0 };
    const level = (id: string) => levels[id];
    const order = (bits: number = BITS) => orderTranslucent(sources, level, () => 0, bits, false, undefined, cache);
    const exact = (bits: number = BITS) => orderTranslucent(sources, level, () => 0, bits, false);
    order();
    // The block moved in the skipped revision. The latest delta includes only the edge.
    levels.b = 3;
    levels.e = 2;
    cache.levelRevision = 4;
    cache.changedLevelIds = ["e"];
    expect(order()).toEqual(exact());
    // A source layout can change in the same update as an unrelated element's level.
    blocks.set("added", quads([3, 0]));
    levels.e = 1;
    cache.levelRevision = 5;
    expect(order()).toEqual(exact());
    // The same level has a different bucket position when the step width changes.
    cache.levelRevision = 6;
    cache.changedLevelIds = [];
    const visit = jest.spyOn(blocks, "forEachRange");
    const resized = order(BITS + 1);
    expect(visit).toHaveBeenCalled();
    visit.mockRestore();
    expect(resized).toEqual(exact(BITS + 1));
  });

  it("shares unchanged upper painter bands through layout changes and joins across the boundary in both directions", () => {
    const a = new InstanceRanges(3);
    const b = new InstanceRanges(3);
    a.set("lowerA", quads([1, 0]));
    a.set("upperA", quads([2, 0]));
    b.set("lowerB", quads([3, 0]));
    b.set("upperB", quads([4, 0]));
    a.retainLayout();
    b.retainLayout();
    const cache: TTranslucentOrderCache = { firstUpperLevel: 10 };
    const levels: Record<string, number> = { lowerA: 1, lowerB: 0, upperA: 10, upperB: 11, added: 0 };
    const level = (id: string) => levels[id];
    let sources = [{ instances: a }, { instances: b }];
    const compare = (bits: number = BITS) => {
      const result = orderTranslucent(sources, level, () => 0, bits, true, undefined, cache);
      expect(result).toEqual(orderTranslucent(sources, level, () => 0, bits, true));
      return result;
    };
    const initial = compare();
    expect(initial[1]).toEqual({ source: 0, first: 0, count: 2 });
    const upperTail = initial[2];

    // Both programs have ranges in both bands. A lower layout edit splits the old cross-band run.
    levels.lowerA = 0;
    b.set("added", quads([5, 0]));
    const split = compare();
    expect(split[split.length - 2]).toEqual({ source: 0, first: 1, count: 1 });
    expect(split[split.length - 1]).toBe(upperTail);
    b.delete("added");
    levels.lowerA = 1;
    const joined = compare();
    expect(joined[1]).toEqual({ source: 0, first: 0, count: 2 });
    expect(joined[2]).toBe(upperTail);
    expect(initial[1].count).toBe(2);

    // Relocating an upper range, changing source order or the depth width, and removing the band split stay exact.
    b.set("upperB", quads([6, 0], [7, 0]));
    const resized = compare();
    expect(resized[resized.length - 1]).not.toBe(upperTail);
    sources = [{ instances: b }, { instances: a }];
    compare();
    compare(BITS + 1);
    cache.firstUpperLevel = undefined;
    levels.lowerA = 0;
    compare();
    expect(cache.upper).toBeUndefined();
  });

  it("matches stateless ordering through retained hole reuse, source changes, steps, levels and dense sorting", () => {
    const a = new InstanceRanges(3);
    const b = new InstanceRanges(3);
    const dense = new InstanceRanges(3);
    a.set("a", quads([1, 0], [2, 0]));
    a.set("c", quads([3, 0]));
    b.set("b", quads([4, 0]));
    dense.set("d", quads([5, 0]));
    dense.set("e", quads([6, 0]));
    a.retainLayout();
    b.retainLayout();
    let sources = [{ instances: a }, { instances: b }, { instances: dense }];
    const levels: Record<string, number> = { a: 2, b: 1, c: 0, d: 4, e: 3, added: 1 };
    const level = (id: string) => levels[id];
    const cache = {};
    const compare = (bits: number = BITS) => {
      const result = orderTranslucent(sources, level, () => 0, bits, true, undefined, cache);
      expect(result).toEqual(orderTranslucent(sources, level, () => 0, bits));
      return result;
    };
    compare();
    a.delete("a");
    compare();
    a.set("added", quads([7, 0]));
    compare();
    a.setSteps("added", [{ step: 3, instances: quads([8, 0], [9, 0], [10, 0]) }]);
    compare();
    levels.added = 5;
    levels.e = 6;
    compare();
    levels.added = 2 ** 30;
    compare();
    compare(BITS + 1);
    sources = [{ instances: dense }, { instances: a }];
    compare();
    sources = [];
    expect(compare()).toEqual([]);
    sources = [{ instances: b }];
    compare();
    expect(
      orderTranslucent(
        sources,
        level,
        () => 0,
        BITS,
        false,
        () => false,
        cache
      )
    ).toEqual([]);
    compare();
  });

  it("omits inactive retained ranges before querying levels or building draw positions", () => {
    const paths = new InstanceRanges(3);
    paths.set("hidden", quads([1, 0], [2, 0]));
    paths.set("shown", quads([3, 0], [4, 0]));
    paths.retainLayout();
    const visited: string[] = [];
    const levelOf = (id: string): number => {
      visited.push(id);
      return 0;
    };
    expect(sourceBuckets(paths, levelOf, BITS, (first) => first >= 2)).toEqual([{ bucket: 0, first: 2, count: 2 }]);
    expect(visited).toEqual(["shown"]);
    expect(
      orderTranslucent(
        [{ instances: paths }],
        levelOf,
        () => 0,
        BITS,
        false,
        () => false
      )
    ).toEqual([]);
  });

  it("orders retained path slots around holes and other programs without rewriting their geometry", () => {
    const paths = new InstanceRanges(3);
    const rects = new InstanceRanges(3);
    paths.set("back", quads([10, 0], [11, 0]));
    paths.set("removed", quads([20, 0], [21, 0]));
    paths.set("front", quads([30, 0], [31, 0]));
    rects.set("middle", quads([40, 0]));
    paths.takeUpload();
    paths.retainLayout();
    paths.delete("removed");
    paths.takeUpload();
    const levels: Record<string, number> = { back: 0, middle: 1, front: 2 };
    const order = (): TTranslucentRun[] =>
      orderTranslucent(
        [{ instances: paths }, { instances: rects }],
        (id) => levels[id],
        () => 0,
        BITS
      );
    expect(order()).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 1 },
      { source: 0, first: 4, count: 2 },
    ]);
    levels.back = 3;
    expect(order()).toEqual([
      { source: 1, first: 0, count: 1 },
      { source: 0, first: 4, count: 2 },
      { source: 0, first: 0, count: 2 },
    ]);
    expect(tags(paths)).toEqual([10, 11, 0, 0, 30, 31]);
    expect(paths.takeUpload()).toEqual({ kind: "none" });
  });

  it("filters existing draws and merges only inactive intervening programs and buffer gaps", () => {
    const input = [
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 2 },
      { source: 0, first: 4, count: 2 },
    ];
    const active = [
      [true, false, false, false, false, true],
      [false, false],
    ];
    const visible = (source: number, first: number, count: number): boolean =>
      active[source].slice(first, first + count).some(Boolean);
    expect(filterTranslucentRuns(input, visible)).toEqual([{ source: 0, first: 0, count: 6 }]);
    // Gathered path IDs can join these commands without submitting their inactive physical gap.
    expect(filterTranslucentRuns(input, visible, () => false)).toEqual([input[0], input[2]]);
    active[1][0] = true;
    expect(filterTranslucentRuns(input, visible)).toEqual(input);
    active[1][0] = false;
    active[0][3] = true;
    expect(filterTranslucentRuns(input, visible)).toEqual([input[0], input[2]]);
  });

  it("reuses unchanged runs and copies only merged runs without changing the resident schedule", () => {
    const input = [
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 2 },
      { source: 1, first: 2, count: 2 },
      { source: 1, first: 4, count: 2 },
      { source: 2, first: 0, count: 2 },
    ];
    const original = input.map((run) => ({ ...run }));
    input.forEach(Object.freeze);
    const result = filterTranslucentRuns(input, (_source, _first, count) => count > 0);
    expect(result).toEqual([input[0], { source: 1, first: 0, count: 6 }, input[4]]);
    expect(result[0]).toBe(input[0]);
    expect(result[1]).not.toBe(input[1]);
    expect(result[2]).toBe(input[4]);
    expect(input).toEqual(original);
  });

  it("orders chunks by level, then step, then element key", () => {
    expect(ELEMENT_KEYS).toBe(2 ** SCENE_DEPTH.INDEX_BITS);
    for (const bits of [BITS, 7]) {
      const steps = maxStepsOf(bits);
      expect(chunkOrder(0, 1, ELEMENT_KEYS - 1, bits)).toBeLessThan(chunkOrder(0, 2, 0, bits));
      expect(chunkOrder(0, steps - 1, ELEMENT_KEYS - 1, bits)).toBeLessThan(chunkOrder(1, 0, 0, bits));
      expect(bucketOf(1, 0, bits)).toBe(steps);
    }
    expect(maxStepsOf(BITS)).toBe(64);
    expect(maxStepsOf(7)).toBe(256);
  });

  it("orders chunks by the extended element key, sub base included", () => {
    expect(chunkOrder(0, 1, 0, BITS)).toBeGreaterThan(chunkOrder(0, 0, 2 ** 23 - 1, BITS));
  });

  it("keeps the order across a width change: an element's steps past 64 stay under the next level", () => {
    // A alternates rects and glyphs, so each primitive is a step; B lies on level 1 with one rect.
    const rects = new InstanceRanges(3);
    const glyphs = new InstanceRanges(3);
    const writeA = (count: number): void => {
      const primitives = Array.from({ length: count }, (_, sub): [number, number] => [100 + sub, sub]);
      writeElement("A", [
        [rects, quads(...primitives.filter(([, sub]) => sub % 2 === 0))],
        [glyphs, quads(...primitives.filter(([, sub]) => sub % 2 === 1))],
      ]);
    };
    writeA(20);
    writeElement("B", [[rects, quads([7, 0])]]);
    const levels: Record<string, number> = { A: 0, B: 1 };
    const keys: Record<string, number> = { A: 1, B: 2 };
    const order = (bits: number): TTranslucentRun[] =>
      orderTranslucent(
        [{ instances: rects }, { instances: glyphs }],
        (id) => levels[id],
        (id) => keys[id] * 2 ** bits,
        bits
      );
    expect(order(BITS).at(-1)).toEqual({ source: 0, first: 10, count: 1 });
    expect(tags(rects).at(-1)).toBe(7);
    // A grows to 70 primitives (70 steps): its root needs 7 bits. Under the old width, steps 64..69 would share the
    // draw positions of level 1 and B's rect would land between them.
    writeA(70);
    const stale = order(BITS);
    expect(tags(rects).at(-1)).not.toBe(7);
    expect(stale.at(-1)).not.toEqual({ source: 0, first: 35, count: 1 });
    const runs = order(7);
    expect(tags(rects).at(-1)).toBe(7);
    expect(runs.at(-1)).toEqual({ source: 0, first: 35, count: 1 });
    expect(runs).toHaveLength(71);
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
      (id) => keys[id],
      BITS
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
      (id) => keys[id],
      BITS
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
        (id) => keys[id],
        BITS
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
      [{ instances: lines, companion: lineData }, { instances: curves, companion: curveData }, { instances: rects }],
      () => 0,
      (id) => keys[id],
      BITS
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
      (id) => keys[id],
      BITS
    );
    expect(tags(rects)).toEqual([10, 20]);
    keys.A = 3;
    expect(
      orderTranslucent(
        [{ instances: rects }],
        () => 0,
        (id) => keys[id],
        BITS
      )
    ).toEqual([{ source: 0, first: 0, count: 2 }]);
    expect(tags(rects)).toEqual([20, 10]);
  });

  it("has no draws without translucent instances", () => {
    expect(
      orderTranslucent(
        [{ instances: new InstanceRanges(3) }],
        () => 0,
        () => 0,
        BITS
      )
    ).toEqual([]);
  });

  it("groups contiguous ranges of one position into one bucket and puts the lower source first on a tie", () => {
    const rects = new InstanceRanges(3);
    rects.set("A", quads([1, 0]));
    rects.set("B", quads([2, 0], [3, 0]));
    rects.set("C", quads([4, 0]));
    const levels: Record<string, number> = { A: 0, B: 0, C: 1 };
    expect(sourceBuckets(rects, (id) => levels[id], BITS)).toEqual([
      { bucket: 0, first: 0, count: 3 },
      { bucket: maxStepsOf(BITS), first: 3, count: 1 },
    ]);
    expect(mergeBuckets([[{ bucket: 5, first: 0, count: 2 }], [{ bucket: 5, first: 0, count: 3 }]])).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 3 },
    ]);
  });

  it("sorts physical fragments within each position and keeps all source ties ahead of the next position", () => {
    const first = sortBuckets([
      { bucket: 4, first: 20, count: 1 },
      { bucket: 2, first: 11, count: 2 },
      { bucket: 2, first: 7, count: 1 },
    ]);
    expect(first).toEqual([
      { bucket: 2, first: 7, count: 1 },
      { bucket: 2, first: 11, count: 2 },
      { bucket: 4, first: 20, count: 1 },
    ]);
    expect(
      mergeBuckets([
        first,
        [
          { bucket: 2, first: 4, count: 2 },
          { bucket: 3, first: 10, count: 1 },
        ],
        [
          { bucket: 1, first: 9, count: 1 },
          { bucket: 2, first: 3, count: 1 },
        ],
      ])
    ).toEqual([
      { source: 2, first: 9, count: 1 },
      { source: 0, first: 7, count: 1 },
      { source: 0, first: 11, count: 2 },
      { source: 1, first: 4, count: 2 },
      { source: 2, first: 3, count: 1 },
      { source: 1, first: 10, count: 1 },
      { source: 0, first: 20, count: 1 },
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
        BITS,
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
      BITS,
      false
    );
    expect(runs).toEqual([{ source: 0, first: 0, count: manyIds.length }]);
    expect(tags(many).slice(0, 3)).toEqual([0, 2, 4]);
  });
});
