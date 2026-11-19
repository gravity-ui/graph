import type { InstanceVisibility, TVisibilitySpan } from "./instanceVisibility";
import type { TTranslucentPart, TTranslucentRun } from "./translucentOrder";

type TSourceVisibility = Pick<InstanceVisibility, "any" | "changesSince" | "visibilityRevision" | "coverage">;
type TSourceSnapshot = { visibility: TSourceVisibility; revision: number; bridge: boolean };
type TChanges = readonly (readonly TVisibilitySpan[] | undefined)[];
type TBounds = TVisibilitySpan & { source: number };
type TPartView = {
  part: TTranslucentPart;
  raw: readonly TTranslucentRun[];
  source: number;
  first: number;
  end: number;
  visibility?: TSourceVisibility;
  revision?: number;
  bridge?: boolean;
  visible: TTranslucentPart;
};
const EMPTY: TTranslucentPart = { runs: [], first: 0, end: 0 };
type TSeam = {
  body: readonly TTranslucentRun[];
  incoming: TTranslucentRun | undefined;
  gap?: TVisibilitySpan;
  commands: readonly TTranslucentRun[];
  tail: TTranslucentRun;
};
type TPartBlock = {
  parts: readonly TTranslucentPart[];
  count: number;
  sources?: number;
  generation?: number;
  raw?: { views: TPartView[]; bounds: TBounds[] };
  visible?: readonly TTranslucentRun[];
  seam?: TSeam;
};

// Bound both the metadata traversal and the work of replacing one cached body.
const MAX_PARTS = 128;
const MAX_RUNS = 1024;

function regroup(input: readonly TTranslucentPart[], previous: readonly TPartBlock[]): TPartBlock[] {
  const anchors = new Map(previous.map((block) => [block.parts[0], block]));
  const blocks: TPartBlock[] = [];
  let runCount = 0;
  for (let at = 0; at < input.length; ) {
    const last = anchors.get(input[at]);
    if (last?.parts.every((part, offset) => part === input[at + offset])) {
      blocks.push(last);
      runCount += last.count;
      at += last.parts.length;
      continue;
    }
    const start = at;
    let count = 0;
    do {
      const { first, end } = input[at++];
      count += end - first;
    } while (
      at < input.length &&
      at - start < MAX_PARTS &&
      count + input[at].end - input[at].first <= MAX_RUNS &&
      !anchors.has(input[at])
    );
    blocks.push({ parts: input.slice(start, at), count });
    runCount += count;
  }
  // Prevent repeated small insertions before old anchors from accumulating one-part cache blocks.
  const compactLimit = 2 * (Math.ceil(input.length / MAX_PARTS) + Math.ceil(runCount / MAX_RUNS));
  return previous.length > 0 && blocks.length > compactLimit ? regroup(input, []) : blocks;
}

const spanEnd = (span: TVisibilitySpan): number => span.end;
const runEnd = (run: TTranslucentRun): number => run.first + run.count;

/** First interval ending strictly after the given slot. Adjacent candidates are common in a dense edit. */
function seekPast<T>(items: readonly T[], low: number, high: number, slot: number, endOf: (item: T) => number): number {
  if (low === high || endOf(items[low]) > slot) return low;
  low++;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (endOf(items[mid]) <= slot) low = mid + 1;
    else high = mid;
  }
  return low;
}

function firstOverlap(spans: readonly TVisibilitySpan[], { first, end }: TVisibilitySpan): number {
  if (spans.length === 0 || spans[0].first >= end || spans[spans.length - 1].end <= first) return -1;
  const at = seekPast(spans, 0, spans.length, first, spanEnd);
  return at < spans.length && spans[at].first < end ? at : -1;
}

function partView(part: TTranslucentPart, cache: WeakMap<TTranslucentPart, TPartView>): TPartView {
  let view = cache.get(part);
  if (view) return view;
  const raw = part.runs;
  const head = raw[part.first];
  const tail = raw[part.end - 1];
  view = { part, raw, source: head.source, first: head.first, end: tail.first + tail.count, visible: EMPTY };
  cache.set(part, view);
  return view;
}

function prepare(parts: readonly TTranslucentPart[], cache: WeakMap<TTranslucentPart, TPartView>) {
  const bounds: TBounds[] = [];
  const views = parts.map((part) => partView(part, cache));
  for (const { source, first, end } of views) {
    const bound = bounds.find((b) => b.source === source);
    if (bound) {
      bound.first = Math.min(bound.first, first);
      bound.end = Math.max(bound.end, end);
    } else bounds.push({ source, first, end });
  }
  return { views, bounds };
}

/** One order part is a single source in increasing physical order. Search its existing runs for an edited slot. */
function intersectsRuns(view: TPartView, spans: readonly TVisibilitySpan[], bridge: boolean): boolean {
  let i = firstOverlap(spans, view);
  if (i < 0) return false;
  const { part, raw } = view;
  if (bridge || part.end === part.first + 1) return true;
  let j = part.first;
  while (i < spans.length && j < part.end) {
    const span = spans[i];
    const run = raw[j];
    if (span.end <= run.first) i = seekPast(spans, i + 1, spans.length, run.first, spanEnd);
    else if (runEnd(run) <= span.first) j = seekPast(raw, j + 1, part.end, span.first, runEnd);
    else return true;
  }
  return false;
}

function project(
  view: TPartView,
  visibility: TSourceVisibility,
  coverage: TSourceVisibility["coverage"],
  bridge: boolean,
  frameChanges?: TChanges
): TTranslucentPart {
  if (view.visibility === visibility && view.bridge === bridge && view.revision !== undefined) {
    if (view.revision === visibility.visibilityRevision) return view.visible;
    if (coverage === "partial") {
      // A reused block already validated its parts through the previous frame, including skipped revisions.
      const changed = frameChanges ? frameChanges[view.source] : visibility.changesSince(view.revision);
      if (changed && !intersectsRuns(view, changed, bridge)) {
        view.revision = visibility.visibilityRevision;
        return view.visible;
      }
    }
  }
  view.visibility = visibility;
  view.revision = visibility.visibilityRevision;
  view.bridge = bridge;
  if (coverage === "all") return (view.visible = view.part);
  if (coverage === "none") return (view.visible = EMPTY);
  const { raw, part } = view;
  // Broad physical emptiness is common below a part's LOD and needs only one predicate lookup.
  if (!visibility.any(view.first, view.end - view.first)) return (view.visible = EMPTY);
  if (part.end === part.first + 1) return (view.visible = part);
  const runs: TTranslucentRun[] = [];
  for (let i = part.first; i < part.end; i++) {
    const run = raw[i];
    if (!visibility.any(run.first, run.count)) continue;
    const last = runs[runs.length - 1];
    if (last && bridge && !visibility.any(last.first + last.count, run.first - last.first - last.count))
      runs[runs.length - 1] = { source: run.source, first: last.first, count: run.first + run.count - last.first };
    else runs.push(run);
  }
  return (view.visible = runs.length ? { runs, first: 0, end: runs.length } : EMPTY);
}

function filterBlock(
  views: readonly TPartView[],
  visibility: readonly TSourceVisibility[],
  coverage: readonly TSourceVisibility["coverage"][],
  bridges: readonly boolean[],
  frameChanges?: TChanges
) {
  if (views.length === 1) {
    const view = views[0];
    const source = view.source;
    const body = project(view, visibility[source], coverage[source], bridges[source], frameChanges);
    return body.first === 0 && body.end === body.runs.length ? body.runs : body.runs.slice(body.first, body.end);
  }
  const runs: TTranslucentRun[] = [];
  for (const view of views) {
    const source = view.source;
    const body = project(view, visibility[source], coverage[source], bridges[source], frameChanges);
    if (body.first === body.end) continue;
    const active = body === view.part ? view.raw : body.runs;
    const head = active[body.first];
    const last = runs[runs.length - 1];
    const gap = last && last.source === source ? head.first - last.first - last.count : -1;
    let join = gap === 0;
    if (gap > 0 && bridges[source]) {
      join = coverage[source] !== "all" && !visibility[source].any(head.first - gap, gap);
    }
    if (join) runs[runs.length - 1] = { source, first: last.first, count: head.first + head.count - last.first };
    else runs.push(head);
    for (let i = body.first + 1; i < body.end; i++) runs.push(active[i]);
  }
  return runs;
}

function invalidated(
  raw: { bounds: TBounds[]; views: TPartView[] },
  changed: TChanges,
  bridges: readonly boolean[]
): boolean {
  for (const bound of raw.bounds) {
    const spans = changed[bound.source];
    if (!spans) return true;
    if (firstOverlap(spans, bound) < 0) continue;
    // A painter group can span distant physical slots. Only bridging observes visibility inside its gaps.
    if (bridges[bound.source]) return true;
    for (const view of raw.views) {
      if (view.source === bound.source && intersectsRuns(view, spans, false)) return true;
    }
  }
  return false;
}

function sameRun(a: TTranslucentRun | undefined, b: TTranslucentRun | undefined): boolean {
  return a === b || Boolean(a && b && a.source === b.source && a.first === b.first && a.count === b.count);
}

function finishBlock(
  block: TPartBlock,
  body: readonly TTranslucentRun[],
  incoming: TTranslucentRun | undefined,
  changed: TChanges,
  visible: (source: number, first: number, count: number) => boolean,
  bridge: boolean
): TSeam {
  const head = body[0];
  const previous = block.seam;
  if (previous?.body === body && sameRun(previous.incoming, incoming)) {
    const spans = changed[head.source];
    if (!previous.gap || (spans && firstOverlap(spans, previous.gap) < 0)) return previous;
  }
  // A singleton can carry a joined tail across any number of empty or singleton groups.
  const commands = body.slice();
  let gap: TVisibilitySpan | undefined;
  if (incoming) {
    const end = incoming.first + incoming.count;
    if (incoming.source === head.source && end < head.first) gap = { first: end, end: head.first };
    if (
      incoming.source === head.source &&
      (end === head.first || (gap && bridge && !visible(head.source, end, head.first - end)))
    ) {
      commands[0] = { source: head.source, first: incoming.first, count: head.first + head.count - incoming.first };
    } else {
      commands.unshift(incoming);
    }
  }
  const tail = commands.pop()!;
  const same =
    previous?.commands.length === commands.length && previous.commands.every((run, i) => sameRun(run, commands[i]));
  return (block.seam = { body, incoming, gap, commands: same ? previous.commands : commands, tail });
}

/** Reuse consecutive order parts and their filter results until a queried physical predicate changes. */
export class TranslucentVisibility {
  private input?: readonly TTranslucentPart[];
  private generation = 0;
  private sources: TSourceSnapshot[] = [];
  private blocks: TPartBlock[] = [];
  private parts = new WeakMap<TTranslucentPart, TPartView>();
  private pages = new WeakMap<readonly TTranslucentPart[], TPartBlock>();
  private groups: readonly (readonly TTranslucentRun[])[] = [];

  public clear(): void {
    this.input = undefined;
    this.blocks = [];
    this.parts = new WeakMap();
    this.pages = new WeakMap();
    this.groups = [];
    this.sources = [];
  }

  public update(
    input: readonly TTranslucentPart[],
    visibility: readonly TSourceVisibility[],
    bridges: readonly boolean[],
    partGroups?: readonly (readonly TTranslucentPart[])[]
  ): readonly (readonly TTranslucentRun[])[] {
    const changed = visibility.map((source, i) => {
      const previous = this.sources[i];
      return previous?.visibility === source && previous.bridge === bridges[i]
        ? source.changesSince(previous.revision)
        : undefined;
    });
    const coverage = visibility.map((source) => source.coverage);
    const visible = (source: number, first: number, count: number): boolean =>
      coverage[source] === "all" || (coverage[source] === "partial" && visibility[source].any(first, count));
    if (this.input !== input) {
      if (partGroups) {
        const generation = ++this.generation;
        this.blocks = partGroups.map((parts) => {
          let block = this.pages.get(parts);
          if (!block) this.pages.set(parts, (block = { parts, count: 0 }));
          else if (block.generation !== generation - 1) {
            block.visible = undefined;
            block.seam = undefined;
          }
          block.generation = generation;
          return block;
        });
      } else {
        this.blocks = regroup(input, this.blocks);
      }
      this.input = input;
    }
    /* eslint-disable no-bitwise -- Conservative source masks skip inactive order groups. */
    let activeSources = 0;
    let changedSources = 0;
    for (let i = 0; i < coverage.length; i++) {
      if (coverage[i] !== "none") activeSources |= 1 << i;
      if (changed[i]?.length !== 0) changedSources |= 1 << i;
    }
    const groups: (readonly TTranslucentRun[])[] = [];
    let tail: TTranslucentRun | undefined;
    for (const block of this.blocks) {
      // Source bits are a conservative skip: a collision for sources 32 apart only adds a predicate check.
      block.sources ??= block.parts.reduce((mask, p) => mask | (1 << p.runs[p.first].source), 0);
      if ((block.sources & activeSources) === 0) {
        block.visible = EMPTY.runs;
        block.seam = undefined;
        continue;
      }
      block.raw ??= prepare(block.parts, this.parts);
      if (!block.visible || ((block.sources & changedSources) !== 0 && invalidated(block.raw, changed, bridges))) {
        const validated = block.visible && block.visible !== EMPTY.runs;
        block.visible = filterBlock(block.raw.views, visibility, coverage, bridges, validated ? changed : undefined);
      }
      const body = block.visible;
      if (body.length === 0) {
        block.seam = undefined;
        continue;
      }
      const seam = finishBlock(block, body, tail, changed, visible, bridges[body[0].source]);
      if (seam.commands.length > 0) groups.push(seam.commands);
      tail = seam.tail;
    }
    /* eslint-enable no-bitwise */
    if (tail) {
      const last = this.groups[this.groups.length - 1];
      groups.push(last?.length === 1 && sameRun(last[0], tail) ? last : [tail]);
    }
    if (groups.length !== this.groups.length || groups.some((group, i) => group !== this.groups[i]))
      this.groups = groups;
    this.sources = visibility.map((source, i) => ({
      visibility: source,
      revision: source.visibilityRevision,
      bridge: bridges[i],
    }));
    return this.groups;
  }
}
