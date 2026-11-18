import { MIXED_PATH_MAX_SOURCES, packOrderedPaths } from "./mixedPathPlan";
import type { TLowerPathCommand } from "./mixedPathPlan";
import type { TPathDrawGroups, TPathDrawSpan } from "./pathDrawIds";

type TDraw<B> = { batch: B; first: number; count: number; curveDetail?: number };
type TGroups<B> = readonly (readonly TDraw<B>[])[];
type TPacked<B> = { linesOnly?: boolean; spans: TPathDrawSpan[]; commands: TLowerPathCommand<B>[] };
type TPlan<B, S> = {
  sources: (S & { tie: number })[];
  spans: TPathDrawSpan[];
  commands: TLowerPathCommand<B>[];
  spanGroups: TPathDrawGroups;
  lineRange?: TPathDrawSpan;
};
type TFragment<B> = {
  bindings: TDraw<B>[];
  bindingOf: number[];
  selectors: (number | undefined)[];
  ordinary: number;
  packed?: TPacked<B>;
};

function sameOrdinary<B extends { pathRecords?: unknown }>(left: TDraw<B> | undefined, right: TDraw<B>): boolean {
  return left?.batch === right.batch && left.curveDetail === right.curveDetail && Boolean(right.batch.pathRecords);
}

function describe<B extends { pathRecords?: unknown }>(draws: readonly TDraw<B>[]): TFragment<B> {
  const bindings: TDraw<B>[] = [];
  const bindingOf: number[] = [];
  let ordinary = 0;
  for (let i = 0; i < draws.length; i++) {
    const draw = draws[i];
    let binding = bindings.findIndex((other) => other.batch === draw.batch && other.curveDetail === draw.curveDetail);
    if (binding === -1) binding = bindings.push(draw) - 1;
    bindingOf.push(binding);
    if (!sameOrdinary(draws[i - 1], draw)) ordinary++;
  }
  return { bindings, bindingOf, ordinary, selectors: [] };
}

/** Only the overview needs flat spans, joined across touching stock commands to compact whole curves. */
function joinSpans<B>(groups: readonly TPacked<B>[]): TPathDrawSpan[] {
  const spans: TPathDrawSpan[] = [];
  let previous: TLowerPathCommand<B> | undefined;
  for (const { commands, spans: group } of groups) {
    if (!commands.length) continue;
    const last = spans[spans.length - 1];
    let first = 0;
    if (
      previous &&
      previous.native === undefined &&
      commands[0].native === undefined &&
      last.first + last.count === group[0].first
    ) {
      spans[spans.length - 1] = { first: last.first, count: last.count + group[0].count };
      first = 1;
    }
    for (let i = first; i < group.length; i++) spans.push(group[i]);
    previous = commands[commands.length - 1];
  }
  return spans;
}

function assemble<B, S>(packed: readonly TPacked<B>[], sources: S[], ordinary: number): TPlan<B, S> | undefined {
  const commands: TLowerPathCommand<B>[] = [];
  let offset = 0;
  let lineStart = 0;
  let longestStart = 0;
  let longestCount = 0;
  for (const group of packed) {
    for (const command of group.commands) {
      const previous = commands[commands.length - 1];
      const first = command.native === undefined ? offset : command.first;
      if (previous && previous.native === command.native && previous.first + previous.count === first) {
        commands[commands.length - 1] = { ...previous, count: previous.count + command.count };
      } else commands.push(command.native === undefined ? { first, count: command.count } : command);
      if (command.native === undefined) offset += command.count;
    }
    if (!group.linesOnly) lineStart = offset;
    else if (offset - lineStart > longestCount) {
      longestStart = lineStart;
      longestCount = offset - lineStart;
    }
  }
  if (commands.length + 16 > ordinary) return undefined;
  let spans: TPathDrawSpan[] | undefined;
  return {
    sources: sources.map((source, tie) => ({ ...source, tie })),
    commands,
    lineRange: longestCount ? { first: longestStart, count: longestCount } : undefined,
    spanGroups: packed.map((group) => group.spans),
    get spans() {
      return (spans ??= joinSpans(packed));
    },
  };
}

/** Stock selectors depend on global first occurrence. Each immutable draw group only repacks if its selectors move. */
export class StockCommandGroups<B extends { pathRecords?: unknown }, S extends { records: object; chords: number }> {
  private fragments = new WeakMap<readonly TDraw<B>[], TFragment<B>>();
  private last?: { groups: TGroups<B>; sources: S[]; plan?: TPlan<B, S> };

  public clear(): void {
    if (this.last) this.fragments = new WeakMap();
    this.last = undefined;
  }

  public update(
    groups: TGroups<B>,
    classify: (batch: B, detail?: number) => S | undefined
  ): TPlan<B, S> | undefined | "fallback" {
    const sources: S[] = [];
    const packed: TPacked<B>[] = [];
    let ordinary = 0;
    let previous: TDraw<B> | undefined;
    let reuse = this.last?.groups === groups;
    for (const draws of groups) {
      if (!draws.length) continue;
      let fragment = this.fragments.get(draws);
      if (!fragment) this.fragments.set(draws, (fragment = describe(draws)));
      ordinary += fragment.ordinary - Number(sameOrdinary(previous, draws[0]));
      previous = draws[draws.length - 1];

      let linesOnly = true;
      for (let i = 0; i < fragment.bindings.length; i++) {
        const { batch, curveDetail } = fragment.bindings[i];
        const source = batch.pathRecords ? classify(batch, curveDetail) : undefined;
        linesOnly &&= source?.chords === 1;
        let slot: number | undefined;
        if (source) {
          slot = sources.findIndex((other) => other.records === source.records && other.chords === source.chords);
          if (slot < 0) {
            if (sources.length === MIXED_PATH_MAX_SOURCES) {
              this.last = undefined;
              return "fallback";
            }
            slot = sources.push(source) - 1;
          }
        }
        if (fragment.selectors[i] !== slot) {
          fragment.selectors[i] = slot;
          fragment.packed = undefined;
        }
      }
      if (!fragment.packed) {
        reuse = false;
        fragment.packed = packOrderedPaths(
          draws,
          (_, i) => fragment.selectors[fragment.bindingOf[i]],
          (draw) => draw.batch
        );
        if (!fragment.packed) {
          this.last = undefined;
          return "fallback";
        }
      }
      // A later selector change replaces the fragment schedule; this plan retains the original.
      fragment.packed.linesOnly = linesOnly;
      packed.push(fragment.packed);
    }
    const last = this.last;
    if (
      reuse &&
      last &&
      sources.length === last.sources.length &&
      sources.every((source, i) => source === last.sources[i])
    )
      return last.plan;
    const plan = ordinary >= 32 && sources.length ? assemble(packed, sources, ordinary) : undefined;
    this.last = { groups, sources, plan };
    return plan;
  }
}
