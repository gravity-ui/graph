import { MIXED_PATH_SOURCE_STRIDE, mixedPathSchedule } from "./mixedPathPlan";
import type { TMixedPathRange, TNativePathRange } from "./mixedPathPlan";
import { StockCommandGroups } from "./stockCommandGroups";

type TBatch = { pathRecords?: object };
type TSource = { records: object; chords: number };
type TDraw = { batch: TBatch; first: number; count: number; curveDetail?: number };
type TGroups = readonly (readonly TDraw[])[];
type TClassify = (batch: TBatch, detail?: number) => TSource | undefined;

function reference(groups: TGroups, classify: TClassify) {
  const draws = groups.flat();
  const sources: (TSource & { tie: number })[] = [];
  const ranges: (TMixedPathRange | TNativePathRange<TBatch>)[] = [];
  let ordinary = 0;
  for (const [key, { batch, first, count, curveDetail }] of draws.entries()) {
    if (!key || batch !== draws[key - 1].batch || curveDetail !== draws[key - 1].curveDetail || !batch.pathRecords)
      ordinary++;
    const source = batch.pathRecords ? classify(batch, curveDetail) : undefined;
    const range = { first, count, key, sub: 0, tie: 0 };
    if (!source) ranges.push({ ...range, native: batch });
    else {
      let index = sources.findIndex((s) => s.records === source.records && s.chords === source.chords);
      if (index < 0) index = sources.push({ ...source, tie: sources.length }) - 1;
      if (index >= 8) return "fallback";
      ranges.push({ ...range, source: index });
    }
  }
  if (ordinary < 32 || !sources.length) return undefined;
  const schedule = mixedPathSchedule(ranges);
  if (!schedule) return "fallback";
  return schedule.commands.length + 16 <= ordinary ? { sources, ...schedule } : undefined;
}

function flatPlan(plan: ReturnType<StockCommandGroups<TBatch, TSource>["update"]>) {
  if (!plan || plan === "fallback") return plan;
  const { sources, commands, spans } = plan;
  return { sources, commands, spans };
}

describe("stock command groups", () => {
  const a: TBatch = { pathRecords: {} },
    b: TBatch = { pathRecords: {} },
    native: TBatch = {};
  const sources = [a, b].map((batch) => ({ records: batch.pathRecords!, chords: 16 }));
  const coarse = { records: sources[0].records, chords: 8 };
  const classify: TClassify = (batch, detail) =>
    batch === a ? (detail === 8 ? coarse : sources[0]) : batch === b ? sources[1] : undefined;
  const draw = (batch: TBatch, first: number, count = 1, curveDetail?: number): TDraw => ({
    batch,
    first,
    count,
    curveDetail,
  });
  const many = Array.from({ length: 64 }, (_, i) => draw(i % 2 ? a : b, i));

  it("repacks changed selectors, coalesces seams and preserves native barriers and detail", () => {
    const cache = new StockCommandGroups<TBatch, TSource>();
    const head = [draw(a, 0), draw(b, 0), draw(a, MIXED_PATH_SOURCE_STRIDE - 1)];
    const mid = [draw(b, 0), draw(a, 0, 1, 8), draw(native, 4)];
    const tail = [draw(native, 5), draw(a, 2), draw(a, 3)];
    for (const groups of [
      [head, [], mid, tail, many],
      [mid, head, tail, many],
      [head, tail, mid, many],
      [head, tail, many],
    ]) {
      const result = cache.update(groups, classify);
      expect(flatPlan(result)).toEqual(reference(groups, classify));
      expect(result).toBeDefined();
      expect(cache.update(groups, classify)).toBe(result);
    }
  });

  it("keeps immutable schedule fragments across far edits and rechecks changed group classifications", () => {
    const cache = new StockCommandGroups<TBatch, TSource>();
    const first = jest.fn(() => 24);
    const stable = [
      {
        batch: a,
        count: 1,
        get first() {
          return first();
        },
      },
      draw(b, 6),
    ];
    const head = [draw(a, 0), draw(b, 3)];
    const before = [head, stable, many];
    cache.update(before, classify);
    first.mockClear();
    const after = [head, [draw(a, 7)], stable, many, [draw(a, 902)]];
    const result = cache.update(after, classify);
    expect(first).not.toHaveBeenCalled();
    expect(flatPlan(result)).toEqual(reference(after, classify));
    const inactive: TClassify = (batch, detail) => (batch === b ? undefined : classify(batch, detail));
    expect(flatPlan(cache.update(after, inactive))).toEqual(reference(after, inactive));
    expect(flatPlan(cache.update(after, classify))).toEqual(reference(after, classify));
  });

  it("keeps the captured group selectors and overview seams after a later plan changes their order", () => {
    const cache = new StockCommandGroups<TBatch, TSource>();
    const seam = [draw(a, 3), draw(native, 7), draw(a, 4)];
    const groups = [[draw(a, 1, 2)], seam, many];
    const plan = cache.update(groups, classify);
    const moved = [[draw(b, 0)], ...groups];
    const later = cache.update(moved, classify);
    if (!plan || plan === "fallback" || !later || later === "fallback") throw new Error("Expected stock plans");
    expect(plan.spanGroups[1]).not.toBe(later.spanGroups[2]);
    expect(flatPlan(plan)).toEqual(reference(groups, classify));
    expect(flatPlan(later)).toEqual(reference(moved, classify));
    const ids = (spans: readonly { first: number; count: number }[]) =>
      spans.flatMap(({ first, count }) => Array.from({ length: count }, (_, i) => first + i));
    expect(plan.spanGroups.flatMap(ids)).toEqual(ids(plan.spans));
  });

  it("retains the exact source and address limits and evaluates profitability across group seams", () => {
    const cache = new StockCommandGroups<TBatch, TSource>();
    const batches = Array.from({ length: 9 }, () => ({ pathRecords: {} }));
    const extended: TClassify = (batch) => ({ records: batch.pathRecords!, chords: 1 });
    expect(cache.update([many, batches.map((batch) => draw(batch, 0))], extended)).toBe("fallback");
    expect(cache.update([many, [draw(a, MIXED_PATH_SOURCE_STRIDE)]], classify)).toBe("fallback");
    const few = [many.slice(0, 15), many.slice(15, 31)];
    expect(cache.update(few, classify)).toBeUndefined();
    const valid = [many, [], [draw(a, MIXED_PATH_SOURCE_STRIDE - 1)]];
    expect(flatPlan(cache.update(valid, classify))).toEqual(reference(valid, classify));
  });

  it("matches the flat scheduler through reordering, local edits and mixed group sizes", () => {
    const cache = new StockCommandGroups<TBatch, TSource>();
    let seed = 391;
    const random = (n: number): number => (seed = (seed * 16807) % 2147483647) % n;
    let groups = Array.from({ length: 32 }, () =>
      Array.from({ length: random(8) }, () =>
        draw([a, b, native][random(3)], random(12), random(3), random(7) === 0 ? 8 : undefined)
      )
    );
    for (let i = 0; i < 75; i++) {
      const result = cache.update(groups, classify);
      expect(flatPlan(result)).toEqual(reference(groups, classify));
      groups = groups.slice();
      const at = random(groups.length);
      if (i % 2) groups.splice(random(groups.length), 0, ...groups.splice(at, 1));
      else groups[at] = [...groups[at], draw(a, random(10))];
    }
  });
});
