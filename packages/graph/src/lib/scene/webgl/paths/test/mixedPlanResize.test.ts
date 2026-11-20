import { MIXED_PATH_SOURCE_STRIDE as STRIDE, mixedPathSchedule } from "../mixedPathPlan";
import { resizeMixedPlan } from "../mixedPlanResize";

const span = (first: number, count: number) => ({ first, count });
const edit = (first: number, before: number, after: number, source = 0, nextFirst = first) => ({
  source,
  first,
  before,
  after,
  nextFirst,
});

describe("mixed stock tail resize", () => {
  it("preserves painter order in a large immutable schedule across relocated edits", () => {
    const ranges = Array.from({ length: 1600 }, (_, i) => ({
      key: i,
      sub: 0,
      tie: i % 2,
      source: i % 2,
      first: Math.floor(i / 2) * 8,
      count: 2,
    }));
    const initial = mixedPathSchedule(ranges);
    if (!initial) throw new Error("Expected a stock schedule");
    let plan = initial;
    let seed = 0x5aa51;
    const pick = (limit: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % limit;
    };
    for (let step = 0; step < 48; step++) {
      const at = pick(ranges.length),
        run = ranges[at],
        prev = plan;
      const after = 2 + pick(5);
      const nextFirst = run.first < 10000 ? 12000 + at * 8 : Math.floor(at / 2) * 8;
      const next = resizeMixedPlan(
        prev.spans,
        prev.commands,
        [edit(run.first, run.count, after, run.source, nextFirst)],
        true
      );
      if (!next) throw new Error("Expected a local update");
      ranges[at] = { ...run, first: nextFirst, count: after };
      expect(next).toEqual(mixedPathSchedule(ranges));
      expect(next.spans[(at + 1) % ranges.length]).toBe(prev.spans[(at + 1) % ranges.length]);
      plan = next;
    }
  });
  it("shares the untouched window around a merged seam and reindexes the resulting split", () => {
    const side = Array.from({ length: 260 }, (_, i) => span(STRIDE + 4 * i, 1));
    const spans = [...side, span(20, 2), span(5, 4), span(40, 1)],
      commands = [span(0, 267)];
    const next = resizeMixedPlan(spans, commands, [edit(5, 4, 2, 0, 22)], true);
    if (!next) throw new Error("Expected a painter join");
    expect(next.spans).toEqual([...side, span(20, 4), span(40, 1)]);
    expect(next.spans[259]).toBe(spans[259]);
    expect(next.spans[261]).toBe(spans[262]);
    const restored = resizeMixedPlan(next.spans, next.commands, [edit(22, 2, 4, 0, 5)], true);
    expect(restored?.spans).toEqual(spans);
    expect(resizeMixedPlan(spans, commands, [edit(5, 4, 2, 0, 40)], true)).toBeUndefined();
  });
  it("resizes merged-left ranges in painter order and shares unchanged spans with the preceding plan", () => {
    const ranges = [
      { key: 3, sub: 0, tie: 0, source: 0, first: 0, count: 2 },
      { key: 4, sub: 0, tie: 0, source: 0, first: 2, count: 2 },
      { key: 1, sub: 0, tie: 1, source: 2, first: 6, count: 3 },
      { key: 2, sub: 0, tie: 0, source: 1, first: 9, count: 4 },
    ];
    const old = mixedPathSchedule(ranges)!;
    const changes = [edit(6, 3, 1, 2), edit(2, 2, 4)];
    const next = resizeMixedPlan(old.spans, old.commands, changes)!;
    expect(next).toEqual(mixedPathSchedule(ranges.map((range, i) => ({ ...range, count: [2, 4, 1, 4][i] }))));
    expect(next.spans[1]).toBe(old.spans[1]);
    expect(old).toEqual(mixedPathSchedule(ranges));
    expect(next.commands[0]).toBe(old.commands[0]);
  });

  it("joins newly adjacent spans exactly like full packing", () => {
    const left = { key: 0, sub: 0, tie: 0, source: 0, first: 0, count: 2 };
    const right = { ...left, key: 1, first: 4 };
    const before = mixedPathSchedule([left, right])!;
    expect(resizeMixedPlan(before.spans, before.commands, [edit(0, 2, 4)])).toEqual(
      mixedPathSchedule([{ ...left, count: 4 }, right])
    );
  });

  it("relocates two interior owners across separate sources at their original painter positions", () => {
    const ranges = [0, 1].flatMap((source) =>
      [0, 2, 4].map((first, i) => ({ key: source * 3 + i, sub: 0, tie: source, source, first, count: 2 }))
    );
    const previous = mixedPathSchedule(ranges)!;
    const changes = [edit(2, 2, 3, 0, 8), edit(2, 2, 1, 1, 9)];
    const updated = ranges.map((range) =>
      range.first === 2
        ? { ...range, first: changes[range.source].nextFirst, count: changes[range.source].after }
        : range
    );
    expect(resizeMixedPlan(previous.spans, previous.commands, changes)).toEqual(mixedPathSchedule(updated));
    expect(previous).toEqual(mixedPathSchedule(ranges));
  });

  it("preserves both untouched pieces of a merged span and bridges new painter-adjacent addresses", () => {
    const spans = [span(5, 2), span(12, 8), span(4, 1)];
    const changes = [edit(12, 2, 1, 0, 7), edit(16, 2, 1, 0, 3), edit(18, 2, 1, 0, 9)];
    expect(resizeMixedPlan(spans, [span(0, 11)], changes)).toEqual({
      spans: [span(5, 3), span(14, 2), span(3, 1), span(9, 1), span(4, 1)],
      commands: [span(0, 8)],
    });
    expect(resizeMixedPlan([span(4, 6)], [span(0, 6)], [edit(5, 4, 2, 0, 6)])).toEqual({
      spans: [span(4, 1), span(6, 2), span(9, 1)],
      commands: [span(0, 4)],
    });
  });

  it("rejects collisions outside the old owner, with another edit, and across a source boundary", () => {
    const spans = [span(10, 6), span(30, 1)];
    for (const changes of [
      [edit(11, 2, 3, 0, 13)],
      [edit(11, 2, 2, 0, 29)],
      [edit(11, 2, 2, 0, 30), edit(30, 1, 1, 0, 21)],
      [edit(11, 2, 2, 0, 20), edit(30, 1, 2, 0, 21)],
      [edit(11, 2, 2, 0, STRIDE - 1)],
      [edit(11, 2, 2, 0, -1)],
    ])
      expect(resizeMixedPlan(spans, [span(0, 7)], changes)).toBeUndefined();
    expect(
      resizeMixedPlan([span(STRIDE - 2, 4)], [span(0, 4)], [edit(STRIDE - 1, 1, 1, 0, 0), edit(0, 1, 2, 1, 5)])
    ).toEqual({
      spans: [span(STRIDE - 2, 1), span(0, 1), span(STRIDE + 5, 2), span(STRIDE + 1, 1)],
      commands: [span(0, 5)],
    });
  });

  it("keeps the first and last exact record addresses, including a span crossing encoded sources", () => {
    const spans = [span(0, 1), span(7 * STRIDE - 1, 3), span(8 * STRIDE - 2, 1)];
    expect(resizeMixedPlan(spans, [span(0, 5)], [edit(0, 1, 2), edit(0, 2, 1, 7), edit(STRIDE - 2, 1, 2, 7)])).toEqual({
      spans: [span(0, 2), span(7 * STRIDE - 1, 2), span(8 * STRIDE - 2, 2)],
      commands: [span(0, 6)],
    });
  });

  it("declines partial, duplicate, right-merged, absent and newly overlapping ranges", () => {
    for (const spans of [
      [span(10, 1), span(11, 1)],
      [span(10, 2), span(10, 2)],
      [span(10, 3)],
      [span(11, 1)],
      [span(23, 2)],
      [span(10, 2), span(13, 3)],
    ]) {
      const count = spans.reduce((n, range) => n + range.count, 0);
      expect(resizeMixedPlan(spans, [span(0, count)], [edit(10, 2, 4)])).toBeUndefined();
    }
  });

  it("declines overlapping edits even if their old spans were disjoint", () => {
    const spans = [span(8, 2), span(12, 2)];
    expect(resizeMixedPlan(spans, [span(0, 4)], [edit(12, 2, 4), edit(8, 2, 5)])).toBeUndefined();
    expect(resizeMixedPlan(spans, [span(0, 4)], [edit(8, 2, 1), edit(8, 2, 3)])).toBeUndefined();
  });

  it("inserts a new geometry group inside a packed span and rejoins the seam on removal", () => {
    // Neighbouring depths happened to occupy adjacent slots in the same source.
    const runs = [
      { source: 0, first: 4, count: 2, key: 1, sub: 0, tie: 0 },
      { source: 0, first: 6, count: 2, key: 3, sub: 0, tie: 0 },
    ];
    const inserted = { source: 1, first: 7, count: 3, key: 2, sub: 0, tie: 1 };
    const all = [...runs, inserted];
    const compare = (left: number, right: number) => {
      const keyOf = (address: number) =>
        all.find(
          (r) =>
            r.source === Math.floor(address / STRIDE) &&
            address % STRIDE >= r.first &&
            address % STRIDE < r.first + r.count
        )?.key ?? NaN;
      return keyOf(left) - keyOf(right) || left - right;
    };
    const old = mixedPathSchedule(runs)!;
    expect(old.spans).toEqual([span(4, 4)]);
    const added = resizeMixedPlan(old.spans, old.commands, [edit(7, 0, 3, 1)], true, compare)!;
    expect(added).toEqual(mixedPathSchedule(all));
    expect(resizeMixedPlan(added.spans, added.commands, [edit(7, 3, 0, 1)], true, compare)).toEqual(old);
    expect(resizeMixedPlan(old.spans, old.commands, [edit(5, 0, 3)], true, compare)).toBeUndefined();
    expect(resizeMixedPlan(old.spans, old.commands, [edit(7, 0, 3, 1)], true, () => NaN)).toBeUndefined();
  });

  it("places the added group beside a relocated sibling in painter tie order", () => {
    const runs = [
      { source: 0, first: 0, count: 2, key: 1, sub: 1, tie: 0 },
      { source: 1, first: 3, count: 2, key: 1, sub: 0, tie: 1 },
      { source: 2, first: 4, count: 2, key: 2, sub: 0, tie: 2 },
    ];
    const next = [runs[0], { ...runs[1], first: 9, count: 3 }, runs[2], { ...runs[2], key: 1, first: 1, count: 2 }];
    const records = new Map(
      next.flatMap((run) =>
        Array.from({ length: run.count }, (_, offset) => [run.source * STRIDE + run.first + offset, run] as const)
      )
    );
    const compare = (left: number, right: number) => {
      const a = records.get(left),
        b = records.get(right);
      if (!a || !b) throw new Error("Compared a vacated slot");
      return a.key - b.key || a.sub - b.sub || a.tie - b.tie || (left % STRIDE) - (right % STRIDE);
    };
    const old = mixedPathSchedule(runs)!;
    const edits = [edit(1, 0, 2, 2), edit(3, 2, 3, 1, 9)];
    expect(resizeMixedPlan(old.spans, old.commands, edits, true, compare)).toEqual(mixedPathSchedule(next));
  });

  it("finds moved and newly inserted spans across painter page boundaries without reindexing distant spans", () => {
    const base = Array.from({ length: 2048 }, (_, i) => ({
      source: 0,
      first: i * 4,
      count: 1,
      key: i * 2,
      sub: 0,
      tie: 0,
    }));
    const a = { source: 1, first: 10, count: 1, key: 509, sub: 0, tie: 1 };
    const b = { ...a, first: 12, key: 1021 };
    const compare = (left: number, right: number) => {
      const key = (slot: number) => (slot < STRIDE ? slot / 2 : slot === STRIDE + a.first ? a.key : b.key);
      return key(left) - key(right);
    };
    let plan = mixedPathSchedule(base)!;
    let distantReads = 0;
    plan.spans[2000] = {
      get first() {
        distantReads++;
        return base[2000].first;
      },
      count: 1,
    };
    const added = [edit(a.first, 0, 1, 1), edit(b.first, 0, 1, 1)];
    plan = resizeMixedPlan(plan.spans, plan.commands, added, true, compare)!;
    expect(plan).toEqual(mixedPathSchedule([...base, a, b]));
    distantReads = 0;
    // The former slots 255 and 511 now live in the next painter pages.
    const removed = [edit(base[255].first, 1, 0), edit(base[511].first, 1, 0)];
    plan = resizeMixedPlan(plan.spans, plan.commands, removed, true, compare)!;
    expect(distantReads).toBe(0);
    const kept = base.filter((_, i) => i !== 255 && i !== 511);
    expect(plan).toEqual(mixedPathSchedule([...kept, a, b]));
    distantReads = 0;
    plan = resizeMixedPlan(plan.spans, plan.commands, [edit(a.first, 1, 0, 1), edit(b.first, 1, 0, 1)], true, compare)!;
    expect(distantReads).toBe(0);
    expect(plan).toEqual(mixedPathSchedule(kept));
  });

  it("declines native barriers, incomplete commands and invalid source addresses", () => {
    const spans = [span(0, 1)];
    for (const commands of [
      [{ ...span(0, 1), native: "custom" }],
      [span(0, 1), span(1, 1)],
      [span(1, 1)],
      [span(0, 2)],
    ])
      expect(resizeMixedPlan(spans, commands, [edit(0, 1, 2)])).toBeUndefined();
    for (const change of [
      edit(0, 1, 2, 8),
      edit(0, 1, 2, -1),
      edit(0, 1, 2, 0.5),
      edit(-1, 1, 2),
      edit(0, 1, 1.5),
      edit(0, 1, 0),
      edit(0, 0, 1),
      edit(STRIDE - 1, 1, 2),
      edit(0, STRIDE + 1, 1),
    ])
      expect(resizeMixedPlan(spans, [span(0, 1)], [change])).toBeUndefined();
    expect(resizeMixedPlan([span(0, 1), span(8 * STRIDE - 1, 2)], [span(0, 3)], [edit(0, 1, 2)])).toBeUndefined();
  });
});
