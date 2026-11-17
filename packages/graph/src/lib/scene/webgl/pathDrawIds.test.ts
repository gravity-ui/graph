import { PathDrawIds, gatheredPathDrawCount } from "./pathDrawIds";

describe("path draw IDs", () => {
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

  it("snapshots caller spans and preserves the unchanged prefix when its storage grows", () => {
    const ids = new PathDrawIds();
    const spans = [{ first: 7, count: 2 }];
    ids.update(spans);
    spans[0].first = 8;
    expect(ids.update(spans)?.data).toEqual(new Float32Array([8, 9]));
    spans[0].count = 5;
    expect(ids.update(spans)).toEqual({ byteOffset: 8, data: new Float32Array([10, 11, 12]) });
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
    expect(ids.update(spans)).toEqual({ byteOffset: 12, data: new Float32Array([30, 31, 40]) });

    expect(ids.update([])).toBeUndefined();
    expect(ids.data).toHaveLength(0);
    expect(ids.update(spans)).toEqual({ byteOffset: 0, data: new Float32Array([10, 11, 2, 30, 31, 40]) });
    expect(ids.update(spans)).toBeUndefined();
  });
});
