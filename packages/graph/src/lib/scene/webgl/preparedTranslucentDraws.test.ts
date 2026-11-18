import { PreparedTranslucentDraws } from "./preparedTranslucentDraws";

const run = (source: number, first: number, count = 1) => ({ source, first, count });

describe("prepared physical draw groups", () => {
  it("retains unchanged clipped commands through disjoint edits, group shifts and camera movement", () => {
    const cache = new PreparedTranslucentDraws<string>();
    const batches = ["rect", "line"];
    const left = [run(1, 1, 5)];
    const mid = [run(0, 0), run(1, 10, 2)];
    const right = [run(1, 20, 8)];
    const clip = (first: number, count: number, curveChords = 8) => ({ first, count, curveChords });
    const views = [undefined, [clip(0, 12), clip(20, 4, 16)]];
    const first = [...cache.update([left, mid, right], batches, views)];
    expect(first.map((d) => [d.batch, d.first, d.count, d.curveDetail])).toEqual([
      ["line", 1, 5, 8],
      ["rect", 0, 1, undefined],
      ["line", 10, 2, 8],
      ["line", 20, 4, 16],
    ]);
    const fresh = [run(0, 5)];
    const next = cache.update([fresh, left, mid, right], batches, [undefined, [clip(2, 10), clip(20, 4, 16)]]);
    expect(next[1]).toEqual({ batch: "line", first: 2, count: 4, curveDetail: 8 });
    expect(next[2]).toBe(first[1]);
    expect(next[3]).toBe(first[2]);
    expect(next[4]).toBe(first[3]);
    expect(cache.update([right, mid], batches, [undefined, []])).toEqual([first[1]]);
    expect(cache.update([mid], ["new", "line"], views)[0].batch).toBe("new");
    cache.clear();
    expect(cache.update([], batches, views)).toEqual([]);
  });

  it("leaves cached command interiors untouched when only a distant clip tail changes", () => {
    const cache = new PreparedTranslucentDraws<string>();
    const slot = jest.fn(() => 4);
    const group = [
      {
        source: 0,
        get first() {
          return slot();
        },
        count: 6,
      },
    ];
    const groups = [group, [run(0, 90, 20)]];
    const old = [...cache.update(groups, ["p"], [[{ first: 0, count: 100 }]])];
    slot.mockClear();
    const next = cache.update(groups, ["p"], [[{ first: 0, count: 105 }]]);
    expect(next[0]).toBe(old[0]);
    expect(slot).not.toHaveBeenCalled();
    expect(next[1]).toEqual({ batch: "p", first: 90, count: 15 });
    // Inserting an interior split must produce both clipped draw records, even for identical detail.
    expect(
      cache.update(
        groups,
        ["p"],
        [
          [
            { first: 0, count: 6 },
            { first: 6, count: 99 },
          ],
        ]
      )
    ).toEqual([
      { batch: "p", first: 4, count: 2 },
      { batch: "p", first: 6, count: 4 },
      { batch: "p", first: 90, count: 15 },
    ]);
  });

  it("preserves the complete draw sequence when groups repeat, disappear or return", () => {
    const cache = new PreparedTranslucentDraws<string>();
    const groups = [[run(0, 1)], [run(0, 2), run(0, 3)], [run(1, 6)]];
    const sequences = [[0, 1, 0, 2], [1, 0, 0], [2, 1, 0, 1], [0], [], [0, 2, 0, 1]];
    for (const sequence of sequences) {
      const ranges = sequence.map((index) => groups[index]);
      const draws = cache.update(ranges, ["a", "b"], [undefined, undefined]);
      expect(draws.map(({ first }) => first)).toEqual(ranges.flatMap((group) => group.map((r) => r.first)));
    }
  });
});
