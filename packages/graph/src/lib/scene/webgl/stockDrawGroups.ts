import { MIXED_PATH_MAX_SOURCES } from "./mixedPathPlan";
import type { TTranslucentRun } from "./translucentOrder";

type TGroup = readonly TTranslucentRun[];
type TSummary = { count: number; first: number; last: number; stockSources: number[] };
type TMode = { stock: boolean[]; groups: WeakMap<TGroup, TSummary> };

function sameFlags(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((flag, i) => flag === b[i]);
}

function summarize(group: TGroup, stock: readonly boolean[], paths: readonly boolean[]): TSummary {
  let previous = -2;
  let count = 0;
  const used = new Set<number>();
  for (const { source } of group) {
    const key = stock[source] ? -1 : source;
    if (key !== previous || !paths[source]) count++;
    if (key === -1) used.add(source);
    previous = key;
  }
  return { count, first: group[0].source, last: previous, stockSources: [...used] };
}

/** Stock paths may share one program up to its texture-source limit. Native non-path commands always split draws. */
export class StockDrawGroups {
  private modes: TMode[] = [];
  private paths: boolean[] = [];

  public count(
    groups: readonly TGroup[],
    nativeStock: readonly boolean[],
    stock: readonly boolean[],
    paths: readonly boolean[]
  ): number {
    if (!sameFlags(this.paths, paths)) {
      this.paths = [...paths];
      this.modes = [];
    }
    return this.countMode(groups, nativeStock, 0) ?? this.countMode(groups, stock, 1) ?? this.countMode(groups, [], 2)!;
  }

  private countMode(groups: readonly TGroup[], stock: readonly boolean[], index: number): number | undefined {
    let mode = this.modes[index];
    if (!mode || !sameFlags(mode.stock, stock)) this.modes[index] = mode = { stock: [...stock], groups: new WeakMap() };
    const used = new Set<number>();
    let previous = -2;
    let count = 0;
    for (const group of groups) {
      if (!group.length) continue;
      let summary = mode.groups.get(group);
      if (!summary) {
        summary = summarize(group, stock, this.paths);
        mode.groups.set(group, summary);
      }
      for (const source of summary.stockSources) used.add(source);
      if (used.size > MIXED_PATH_MAX_SOURCES) return undefined;
      const first = summary.first;
      count += summary.count;
      if (this.paths[first] && (stock[first] ? -1 : first) === previous) count--;
      previous = summary.last;
    }
    return count;
  }
}
