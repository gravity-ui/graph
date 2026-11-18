import type { TTranslucentRun } from "./translucentOrder";

type TClip = { first: number; count: number; curveChords?: number };
type TView = readonly TClip[] | undefined;
type TDraw<B> = { batch: B; first: number; count: number; curveDetail?: number };
type TGroup<B> = {
  sources: { source: number; first: number; end: number; view: TView }[];
  draws: TDraw<B>[];
  frame: number;
  offset: number;
};

function startAt(view: readonly TClip[], first: number): number {
  let lo = 0;
  let hi = view.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (view[mid].first + view[mid].count <= first) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sameClip(left: TView, right: TView, first: number, end: number): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  let a = startAt(left, first);
  let b = startAt(right, first);
  while (a < left.length && left[a].first < end && b < right.length && right[b].first < end) {
    const x = left[a++];
    const y = right[b++];
    if (
      Math.max(first, x.first) !== Math.max(first, y.first) ||
      Math.min(end, x.first + x.count) !== Math.min(end, y.first + y.count) ||
      x.curveChords !== y.curveChords
    )
      return false;
  }
  return !(a < left.length && left[a].first < end) && !(b < right.length && right[b].first < end);
}

function sameRange(a: TClip, b: TClip): boolean {
  return a.first === b.first && a.count === b.count && a.curveChords === b.curveChords;
}

/** The outer physical bounds of a changed clip list, including newly split or joined boundaries. */
function clipChange(a: TView, b: TView): { first: number; end: number } | undefined {
  if (!a || !b || a === b) return undefined;
  let start = 0;
  let i = a.length,
    j = b.length;
  while (start < i && start < j && sameRange(a[start], b[start])) start++;
  while (start < i && start < j && sameRange(a[i - 1], b[j - 1])) {
    i--;
    j--;
  }
  const x = start < i ? a[start] : undefined,
    y = start < j ? b[start] : undefined;
  let first = Math.min(x?.first ?? Infinity, y?.first ?? Infinity);
  if (x && y && x.first === y.first && x.curveChords === y.curveChords) first += Math.min(x.count, y.count);
  const u = start < i ? a[i - 1] : undefined,
    v = start < j ? b[j - 1] : undefined;
  let end = Math.max(u ? u.first + u.count : -Infinity, v ? v.first + v.count : -Infinity);
  if (u && v && u.first + u.count === v.first + v.count && u.curveChords === v.curveChords)
    end = Math.max(u.first, v.first);
  return { first, end };
}

/** Cached physical commands are immutable. Gathering into a frame's address buffer uses separate mutable draws. */
export class PreparedTranslucentDraws<B> {
  private groups = new WeakMap<readonly TTranslucentRun[], TGroup<B>>();
  private batches: readonly B[] = [];
  private input?: readonly (readonly TTranslucentRun[])[];
  private views: readonly TView[] = [];
  private frame = 0;
  public ordered: readonly (readonly TDraw<B>[])[] = [];
  private readonly draws: TDraw<B>[] = [];

  public clear(): void {
    this.groups = new WeakMap();
    this.batches = [];
    this.input = undefined;
    this.views = [];
    this.ordered = [];
    this.draws.length = 0;
  }

  public update(
    groups: readonly (readonly TTranslucentRun[])[],
    batches: readonly B[],
    views: readonly TView[]
  ): TDraw<B>[] {
    if (this.batches.length !== batches.length || this.batches.some((batch, i) => batch !== batches[i])) this.clear();
    this.batches = batches;
    const previous = this.views;
    if (this.input === groups && views.length === previous.length && views.every((v, i) => v === previous[i]))
      return this.draws;
    const changes = views.map((view, i) => clipChange(previous[i], view));
    this.views = views;
    this.input = groups;
    this.frame++;
    let offset = 0;
    let next: (readonly TDraw<B>[])[] | undefined;
    let position = 0;
    for (const runs of groups) {
      let group = this.groups.get(runs);
      if (group) {
        for (const bounds of group.sources) {
          const { source, view: old } = bounds;
          if (old === views[source]) continue;
          const delta = old === previous[source] ? changes[source] : undefined;
          if (
            (!delta || (bounds.first < delta.end && bounds.end > delta.first)) &&
            runs.some((run) => run.source === source && !sameClip(old, views[source], run.first, run.first + run.count))
          ) {
            group = undefined;
            break;
          }
          bounds.view = views[source];
        }
      }
      if (!group) {
        const draws: TDraw<B>[] = [];
        const sources: TGroup<B>["sources"] = [];
        for (const { source, first, count } of runs) {
          const batch = batches[source];
          const view = views[source];
          const bounds = sources.find((b) => b.source === source);
          if (bounds) {
            bounds.first = Math.min(bounds.first, first);
            bounds.end = Math.max(bounds.end, first + count);
          } else sources.push({ source, first, end: first + count, view });
          if (!view) {
            draws.push({ batch, first, count });
            continue;
          }
          const end = first + count;
          for (let i = startAt(view, first); i < view.length && view[i].first < end; i++) {
            const clip = view[i];
            const from = Math.max(clip.first, first);
            draws.push({
              batch,
              first: from,
              count: Math.min(end, clip.first + clip.count) - from,
              curveDetail: clip.curveChords,
            });
          }
        }
        group = {
          sources,
          draws,
          frame: -1,
          offset: -1,
        };
        this.groups.set(runs, group);
      }
      // Only groups that are new or have shifted need to publish references into the contiguous submission list.
      if (group.offset !== offset || group.frame !== this.frame - 1) {
        for (let i = 0; i < group.draws.length; i++) this.draws[offset + i] = group.draws[i];
      }
      if (group.draws.length > 0) {
        if (!next && this.ordered[position] !== group.draws) next = this.ordered.slice(0, position);
        next?.push(group.draws);
        position++;
      }
      group.frame = this.frame;
      group.offset = offset;
      offset += group.draws.length;
    }
    if (next || position !== this.ordered.length) this.ordered = next ?? this.ordered.slice(0, position);
    this.draws.length = offset;
    return this.draws;
  }
}
