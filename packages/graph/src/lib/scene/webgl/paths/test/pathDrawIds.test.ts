import { MIXED_PATH_SOURCE_STRIDE, mixedPathSchedule } from "../mixedPathPlan";
import { PathDrawIds, gatheredPathDrawCount } from "../pathDrawIds";

describe("path draw IDs", () => {
  it("preserves draw boundaries and signed overview groups when splitting sixteen-chord sources", () => {
    const ids = new PathDrawIds();
    const stride = MIXED_PATH_SOURCE_STRIDE;
    const compact = { starts: new Uint8Array([1, 0, 0, 0, 0]), revision: 0, pieces: 4 as const };
    const spans = [
      { first: 7, count: 1 },
      { first: stride, count: 5 },
      { first: 8, count: 1 },
    ];
    ids.updatePlan(spans, [undefined, compact], 2);
    expect([...ids.data]).toEqual([7, -1 - stride, -2 - stride, stride + 8, stride + 9, 8]);
    expect([0, 1, 6, 7].map((point) => ids.offset(point))).toEqual([0, 1, 5, 6]);
    expect(ids.updatePlan(spans, [undefined, compact], 2)).toBeUndefined();

    compact.starts.fill(0);
    compact.revision++;
    ids.updatePlan(spans, [undefined, compact], 2);
    expect([...ids.data]).toEqual([7, ...Array.from({ length: 10 }, (_, i) => stride + i), 8]);
    expect(ids.offset(6)).toBe(11);
    ids.updatePlan(spans);
    expect([...ids.data]).toEqual([7, stride, stride + 1, stride + 2, stride + 3, stride + 4, 8]);
    expect(ids.offset(6)).toBe(6);
  });

  it("keeps split addresses exact through a change of painter order and a physical source boundary", () => {
    const ids = new PathDrawIds();
    const stride = MIXED_PATH_SOURCE_STRIDE;
    const tail = { first: 7 * stride + stride / 2 - 1, count: 1 };
    ids.updatePlan([{ first: stride - 1, count: 3 }, tail], undefined, 2 ** 1 + 2 ** 7);
    expect([...ids.data]).toEqual([stride - 1, stride, stride + 1, stride + 2, stride + 3, 2 ** 24 - 2, 2 ** 24 - 1]);
    const change = ids.updatePlan([tail, { first: stride, count: 2 }], undefined, 2 ** 1 + 2 ** 7);
    expect(change?.byteOffset).toBe(0);
    expect([...ids.data]).toEqual([2 ** 24 - 2, 2 ** 24 - 1, stride, stride + 1, stride + 2, stride + 3]);
  });

  it("reuses immutable plans but keeps snapshots for mutable callers", () => {
    const ids = new PathDrawIds();
    let reads = 0;
    const first = [
      {
        get first() {
          reads++;
          return 3;
        },
        count: 2,
      },
      { first: 20, count: 2 },
    ];
    ids.updatePlan(first);
    reads = 0;
    expect(ids.updatePlan(first)).toBeUndefined();
    expect(reads).toBe(0);
    const second: { first: number; count: number }[] = [{ first: 4, count: 2 }, first[1]];
    ids.updatePlan(second);
    expect([...ids.data]).toEqual([4, 5, 20, 21]);
    ids.update(second, undefined, true);
    second[0].first = 12;
    ids.updatePlan(second);
    expect([...ids.data]).toEqual([12, 13, 20, 21]);
  });

  it("invalidates an immutable plan when descriptor revisions or source identity changes", () => {
    const ids = new PathDrawIds();
    const spans = [{ first: 0, count: 4 }];
    const groups = {
      starts: new Uint8Array([1, 0, 0, 0]),
      revision: 1,
      pieces: 4 as const,
    };
    ids.updatePlan(spans, [groups]);
    expect([...ids.data]).toEqual([-1]);
    groups.starts.fill(0);
    groups.revision++;
    ids.updatePlan(spans, [groups]);
    expect([...ids.data]).toEqual([0, 1, 2, 3]);
    ids.updatePlan(spans, [{ ...groups, starts: new Uint8Array([1, 0, 0, 0]) }]);
    expect([...ids.data]).toEqual([-1]);
    ids.updatePlan(spans);
    expect([...ids.data]).toEqual([0, 1, 2, 3]);
  });

  it("reuses grouped addresses, with exact deltas across splits, repeated groups, tail reuse and overview", () => {
    const ids = new PathDrawIds();
    const flat = new PathDrawIds();
    let reads = 0;
    const stable = [
      {
        get first() {
          reads++;
          return 1;
        },
        count: 4,
      },
    ];
    const high = [{ first: 30, count: 3 }];
    const low = [{ first: 1, count: 2 }];
    const rest = [{ first: 3, count: 2 }];
    const overview = { starts: new Uint8Array([0, 1, 0, 0, 0]), revision: 1, pieces: 4 as const };
    for (const groups of [
      [stable, high],
      [low, rest, high],
      [stable, high, stable],
      [high, stable],
      [high],
      [],
      [high, stable],
    ]) {
      const expected = flat.updatePlan(groups.flat());
      reads = 0;
      expect(ids.updateGroups(groups)).toEqual(expected);
      if (groups[0] === high || groups.length === 3) expect(reads).toBe(0);
      expect(ids.data).toEqual(flat.data);
      expect(ids.updateGroups(groups)).toBeUndefined();
      expect(ids.offset(3)).toBe(3);
    }
    const groups = [high, stable],
      spans = groups.flat();
    expect(ids.updatePlan(spans, [overview])).toEqual(flat.updatePlan(spans, [overview]));
    expect(ids.data).toEqual(flat.data);
    expect(ids.offset(7)).toBe(4);
    expect(ids.updateGroups(groups)).toEqual(flat.updatePlan(spans));
    expect(ids.data).toEqual(flat.data);
    expect(ids.offset(7)).toBe(7);
    expect(ids.updatePlan([])).toBeUndefined();
    expect(ids.data).toHaveLength(0);
    flat.updatePlan([]);
    expect(ids.updateGroups(groups)).toEqual(flat.updatePlan(spans));
    expect(ids.data).toEqual(flat.data);
  });

  it("counts gathered path groups without joining across non-path barriers", () => {
    const sources = [0, 0, 0, 1, 1, 0, 0, 2, 2];
    expect(
      gatheredPathDrawCount(
        sources.map((source) => ({ source })),
        [true, false, true]
      )
    ).toBe(5);
  });
  it("gathers disjoint and backwards physical ranges without changing logical order", () => {
    const ids = new PathDrawIds();
    expect(
      ids.update([
        { first: 10, count: 3 },
        { first: 2, count: 2 },
        { first: 20, count: 1 },
      ])?.data
    ).toEqual(new Float32Array([10, 11, 12, 2, 3, 20]));
    expect(ids.data).toEqual(new Float32Array([10, 11, 12, 2, 3, 20]));
    expect(
      ids.update([
        { first: 10, count: 3 },
        { first: 2, count: 2 },
        { first: 20, count: 1 },
      ])
    ).toBeUndefined();
  });

  it("uploads only changed addresses, keeping record edits and removed tails out of the ID buffer", () => {
    const ids = new PathDrawIds();
    ids.update([{ first: 0, count: 8 }]);
    expect(
      ids.update([
        { first: 0, count: 3 },
        { first: 12, count: 2 },
        { first: 5, count: 3 },
      ])
    ).toEqual({ byteOffset: 12, data: new Float32Array([12, 13]) });
    expect(
      ids.update([
        { first: 0, count: 3 },
        { first: 12, count: 2 },
      ])
    ).toBeUndefined();
    expect(ids.data).toEqual(new Float32Array([0, 1, 2, 12, 13]));
    expect(ids.update([])).toBeUndefined();
    expect(ids.data).toHaveLength(0);
    expect(() => ids.update([{ first: 2 ** 24, count: 1 }])).toThrow(/exact/);
  });

  it("keeps an empty overview source list on the canonical path without allocating command offsets", () => {
    const ids = new PathDrawIds();
    const spans = [{ first: 3, count: 200 }];
    ids.update(spans, [undefined, undefined], true);
    expect(ids["offsets"].byteLength).toBe(0);
    expect(ids.data).toHaveLength(200);
    expect(ids.offset(120)).toBe(120);
  });

  it("reuses an unchanged compressed prefix across snapshot growth and tail removal", () => {
    const ids = new PathDrawIds();
    const groups = {
      starts: new Uint8Array([1, 0, 0, 0]),
      revision: 1,
      pieces: 4 as const,
    };
    const prefix = { first: 0, count: 4 };
    ids.update([prefix], [groups]);
    ids.update([prefix, { first: 18, count: 3 }, { first: 30, count: 12 }], [groups]);
    expect([...ids.data]).toEqual([-1, 18, 19, 20, ...Array.from({ length: 12 }, (_, i) => 30 + i)]);
    expect([ids.offset(4), ids.offset(7), ids.offset(19)]).toEqual([1, 4, 16]);
    expect(ids.update([prefix], [groups])).toBeUndefined();
    expect([...ids.data]).toEqual([-1]);
    expect(ids.offset(4)).toBe(1);
  });

  it("compacts complete four-piece descriptors within each ordered draw and restores detail across a cut", () => {
    const ids = new PathDrawIds();
    const source = {
      starts: new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0]),
      revision: 1,
      pieces: 4 as const,
    };
    const spans = [
      { first: 0, count: 4 },
      { first: 4, count: 2 },
      { first: 6, count: 2 },
    ];
    ids.update(spans, [source]);
    expect(ids.data).toEqual(new Float32Array([-1, 4, 5, 6, 7]));
    expect(ids.offset(4)).toBe(1);
    expect(ids.offset(8)).toBe(5);
    expect(ids.update(spans, [source])).toBeUndefined();
    source.starts.fill(0);
    source.revision++;
    ids.update(spans, [source]);
    expect(ids.data).toEqual(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]));
    ids.update(spans);
    expect(ids.offset(4)).toBe(4);
  });

  it("keeps two-piece and four-piece opaque/translucent sources separate through packed boundaries", () => {
    const ids = new PathDrawIds();
    const full = {
      starts: new Uint8Array([1, 0, 0, 0]),
      revision: 1,
      pieces: 4 as const,
    };
    const short = {
      starts: new Uint8Array([1, 0, 1, 0]),
      revision: 1,
      pieces: 2 as const,
    };
    const stride = 2 ** 21;
    const spans = [
      { first: stride, count: 4 },
      { first: 0, count: 4 },
    ];
    ids.update(spans, [full, short], true);
    expect([...ids.data]).toEqual([-1 - stride, -3 - stride, -1]);
    expect(ids.offset(4)).toBe(2);
    ids.update(spans, [full, short], false);
    expect([...ids.data]).toEqual([stride, stride + 1, stride + 2, stride + 3, -1]);
  });

  it("stops a packed descriptor at a texture boundary even when the schedule merges the addresses", () => {
    const ids = new PathDrawIds();
    const stride = MIXED_PATH_SOURCE_STRIDE;
    const first = stride - 2;
    const large = {
      starts: new Uint8Array(stride + 2),
      revision: 1,
      pieces: 4 as const,
    };
    large.starts[first] = 1;
    const small = {
      starts: new Uint8Array([1, 0]),
      revision: 1,
      pieces: 2 as const,
    };
    const spans =
      mixedPathSchedule([
        { key: 1, sub: 0, tie: 0, source: 0, first, count: 2 },
        { key: 2, sub: 0, tie: 0, source: 1, first: 0, count: 2 },
      ])?.spans ?? [];
    expect(spans).toEqual([{ first, count: 4 }]);
    ids.update(spans, [large, small], true);
    expect([...ids.data]).toEqual([first, first + 1, -1 - stride]);
    ids.update(spans, [large]);
    expect([...ids.data]).toEqual([-1 - first]);
  });

  it("snapshots caller spans and preserves the unchanged prefix when its storage grows", () => {
    const ids = new PathDrawIds();
    const spans = [{ first: 7, count: 2 }];
    ids.update(spans);
    spans[0].first = 8;
    expect(ids.update(spans)?.data).toEqual(new Float32Array([8, 9]));
    spans[0].count = 5;
    expect(ids.update(spans)).toEqual({
      byteOffset: 8,
      data: new Float32Array([10, 11, 12]),
    });
    expect(ids.data).toEqual(new Float32Array([8, 9, 10, 11, 12]));
  });

  it("rewrites a removed tail on regrowth and replaces the full address list after clearing", () => {
    const ids = new PathDrawIds();
    const spans = [
      { first: 10, count: 2 },
      { first: 2, count: 1 },
      { first: 30, count: 2 },
      { first: 40, count: 1 },
    ];
    ids.update(spans);
    expect(ids.update(spans.slice(0, 2))).toBeUndefined();
    expect(ids.data).toEqual(new Float32Array([10, 11, 2]));
    expect(ids.update(spans)).toEqual({
      byteOffset: 12,
      data: new Float32Array([30, 31, 40]),
    });

    expect(ids.update([])).toBeUndefined();
    expect(ids.data).toHaveLength(0);
    expect(ids.update(spans)).toEqual({
      byteOffset: 0,
      data: new Float32Array([10, 11, 2, 30, 31, 40]),
    });
    expect(ids.update(spans)).toBeUndefined();
  });
});
