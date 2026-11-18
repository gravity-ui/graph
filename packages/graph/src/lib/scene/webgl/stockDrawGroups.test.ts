import { MIXED_PATH_MAX_SOURCES } from "./mixedPathPlan";
import { gatheredPathDrawCount } from "./pathDrawIds";
import { StockDrawGroups } from "./stockDrawGroups";
import type { TTranslucentRun } from "./translucentOrder";

const run = (source: number): TTranslucentRun => ({ source, first: 0, count: 1 });

function reference(runs: TTranslucentRun[], native: boolean[], stock: boolean[], paths: boolean[]): number {
  for (const flags of [native, stock]) {
    const used = new Set(runs.filter(({ source }) => flags[source]).map(({ source }) => source));
    if (used.size > MIXED_PATH_MAX_SOURCES) continue;
    let previous = -2;
    return runs.reduce((count, { source }) => {
      const key = flags[source] ? -1 : source;
      const repeat = key === previous && paths[source];
      previous = key;
      return count + (repeat ? 0 : 1);
    }, 0);
  }
  return gatheredPathDrawCount(runs, paths);
}

describe("retained stock draw counts", () => {
  it("reuses unchanged bodies across updates and repairs native barriers at a seam", () => {
    const counters = new StockDrawGroups();
    const source = jest.fn(() => 0);
    const tracked = {
      ...run(0),
      get source() {
        return source();
      },
    };
    const old = [run(0), tracked, run(2)];
    const native = [true, true, false];
    const stock = [true, false, false];
    const paths = [true, true, false];
    expect(counters.count([old, [], [run(2), run(1)]], native, stock, paths)).toBe(4);
    source.mockClear();
    expect(counters.count([[run(1)], old], [...native], [...stock], [...paths])).toBe(2);
    expect(source).not.toHaveBeenCalled();
    native[1] = false;
    expect(counters.count([[run(1)], old], native, stock, paths)).toBe(3);
    paths[2] = true;
    expect(counters.count([old, [run(2)]], native, stock, paths)).toBe(2);
  });

  it("matches a flat traversal across actual source limits, reordered groups and changes of activity", () => {
    let seed = 7;
    const next = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
    const sources = MIXED_PATH_MAX_SOURCES + 4;
    const groups = Array.from({ length: 20 }, () => Array.from({ length: 1 + next(12) }, () => run(next(sources))));
    const counts = new StockDrawGroups();
    const flags = Array.from({ length: sources }, () => true);
    for (let i = 0; i < 300; i++) {
      const paths = flags.map(() => next(6) > 0);
      const native = paths.map((path) => path && next(8) < i % 9);
      const stock = native.map((flag) => flag && next(8) < i % 9);
      const used = groups.slice(next(4), 5 + next(15));
      used.splice(next(used.length), 1, []);
      expect(counts.count(used, native, stock, paths)).toBe(reference(used.flat(), native, stock, paths));
    }
    const nineUsed = [Array.from({ length: MIXED_PATH_MAX_SOURCES + 1 }, (_, source) => run(source))];
    const strictlyStock = flags.map((_, source) => source < MIXED_PATH_MAX_SOURCES);
    expect(counts.count(nineUsed, flags, strictlyStock, flags)).toBe(2);
    expect(counts.count(nineUsed, flags, flags, flags)).toBe(nineUsed[0].length);
    // Many possible sources can be classified as stock even when only two take part.
    expect(counts.count([[run(9)], [run(0)]], flags, flags, flags)).toBe(1);
    expect(counts.count([], flags, flags, flags)).toBe(0);
  });
});
