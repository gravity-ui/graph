import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import type { InstanceRanges } from "./InstanceRanges";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";
import { SUB_FLOAT } from "./translucentOrder";

type TSource = { ranges: InstanceRanges; companion?: { ranges: InstanceRanges } };
export type TPathPlanInput<B> = {
  batch: B;
  first: number;
  count: number;
  total: number;
  layout: number;
  companionLayout: number;
  owner: number;
  sub: number;
  width: number;
  minimum: number;
  mode: number;
};

export type TMixedResize<B> = {
  nextFirst: number;
  batch: B;
  first: number;
  before: number;
  after: number;
  layoutBefore?: number;
  layoutAfter: number;
  companionBefore?: number;
  companionAfter: number;
  membership?: { id: string; sibling: TPathPlanInput<B> };
};

/** Capture only the edited owner's encoded inputs to painter order and the opaque subpixel check. */
export function appendPathPlanInputs<B extends TSource>(
  runs: TPathPlanInput<B>[],
  batch: B,
  id: string,
  opaque: boolean
): void {
  const ranges = batch.ranges.ownerRanges(id);
  if (!ranges.length || !batch.companion) return;
  const payload = batch.ranges.data;
  const elements = batch.companion.ranges.data;
  const total = payload.length / INSTANCE_FLOATS;
  for (const range of ranges) {
    let last: TPathPlanInput<B> | undefined;
    for (let slot = range.offset; slot < range.offset + range.count; slot++) {
      const at = slot * PATH_ELEMENT_FLOATS;
      const owner = elements[at];
      const sub = elements[at + SUB_FLOAT];
      const width = opaque ? payload[slot * INSTANCE_FLOATS + 12] : 0;
      const mode = opaque ? Math.floor(elements[at + 6] / 8) : 0;
      const minimum = mode ? elements[at + 3] : 0;
      if (
        last &&
        last.owner === owner &&
        last.sub === sub &&
        last.width === width &&
        last.minimum === minimum &&
        last.mode === mode
      ) {
        last.count++;
      } else {
        last = {
          batch,
          first: slot,
          count: 1,
          total,
          layout: batch.ranges.layoutRevision,
          companionLayout: batch.companion.ranges.layoutRevision,
          owner,
          sub,
          width,
          minimum,
          mode,
        };
        runs.push(last);
      }
    }
  }
}

function samePrimitive<B>(a: TPathPlanInput<B>, b: TPathPlanInput<B>): boolean {
  return a.owner === b.owner && a.sub === b.sub && a.width === b.width && a.minimum === b.minimum && a.mode === b.mode;
}

/** A retained relocation and a dense tail resize both leave every other owner at its old address. */
function resizeCommonRuns<B extends TSource>(
  before: readonly TPathPlanInput<B>[],
  after: readonly TPathPlanInput<B>[]
): TMixedResize<B>[] | undefined {
  const resized: TMixedResize<B>[] = [];
  for (let i = 0; i < before.length; i++) {
    const a = before[i],
      b = after[i];
    if (a.batch !== b.batch || !samePrimitive(a, b)) return undefined;
    if (a.count === b.count && a.first === b.first) continue;
    // The cached draw coverage can certify one changed interval per batch.
    if (resized.some((edit) => edit.batch === a.batch)) return undefined;
    if (a.batch.ranges.layoutRetained) {
      // Equal key/sub/tie is ordered by physical address. A split primitive must use the full planner.
      if (
        before.some(
          (other, index) => index !== i && other.batch === a.batch && other.owner === a.owner && other.sub === a.sub
        )
      )
        return undefined;
    } else if (a.first !== b.first || a.first + a.count !== a.total || b.first + b.count !== b.total) return undefined;
    resized.push({
      batch: a.batch,
      nextFirst: b.first,
      first: a.first,
      before: a.count,
      after: b.count,
      layoutBefore: a.layout,
      layoutAfter: b.layout,
      companionBefore: a.companionLayout,
      companionAfter: b.companionLayout,
    });
  }
  return resized;
}

export function pathPlanResizes<B extends TSource>(
  before: readonly TPathPlanInput<B>[],
  after: readonly TPathPlanInput<B>[],
  id?: string
): TMixedResize<B>[] | undefined {
  if (before.length === after.length) return resizeCommonRuns(before, after);
  if (id === undefined || Math.abs(before.length - after.length) !== 1) return undefined;

  const entering = after.length > before.length;
  const shorter = entering ? before : after;
  const longer = entering ? after : before;
  let i = 0;
  while (i < shorter.length && shorter[i].batch === longer[i].batch) i++;
  const run = longer[i];
  const { batch } = run;
  const sibling = shorter.find((other) => samePrimitive(other, run));
  // Only a whole resident run may enter or leave a bin. Another bin of the same stroke must survive.
  if (
    !batch.ranges.layoutRetained ||
    !batch.companion?.ranges.layoutRetained ||
    shorter.some((other) => other.batch === batch) ||
    !sibling
  )
    return undefined;
  const common = longer.slice();
  common.splice(i, 1);
  const edits = entering ? resizeCommonRuns(before, common) : resizeCommonRuns(common, after);
  if (!edits) return undefined;
  edits.push({
    batch,
    first: run.first,
    nextFirst: run.first,
    before: entering ? 0 : run.count,
    after: entering ? run.count : 0,
    layoutBefore: entering ? undefined : run.layout,
    companionBefore: entering ? undefined : run.companionLayout,
    layoutAfter: batch.ranges.layoutRevision,
    companionAfter: batch.companion.ranges.layoutRevision,
    membership: { id, sibling },
  });
  return edits;
}

type TDraw<B> = { batch: B; first: number; count: number; curveDetail?: number };
type TCovered = { first: number; count: number; chords: number };

function appendCoverage(ranges: TCovered[], first: number, end: number, chords: number): void {
  if (first >= end) return;
  const last = ranges[ranges.length - 1];
  if (last?.chords === chords && last.first + last.count === first) last.count += end - first;
  else ranges.push({ first, count: end - first, chords });
}

/** Ignore the edited slots in both views, but retain every other visible address and template. */
function coverage<B>(draws: readonly TDraw<B>[], edit: TMixedResize<B>, old: boolean, defaultChords: number) {
  const visible: TCovered[] = [];
  const others: TCovered[] = [];
  const oldEnd = edit.first + edit.before,
    nextEnd = edit.nextFirst + edit.after;
  const leftFirst = Math.min(edit.first, edit.nextFirst),
    rightEnd = Math.max(oldEnd, nextEnd);
  const leftEnd = edit.first <= edit.nextFirst ? oldEnd : nextEnd;
  const rightFirst = Math.max(edit.first, edit.nextFirst);
  for (const draw of draws) {
    if (draw.batch !== edit.batch) continue;
    const end = draw.first + draw.count;
    const chords = draw.curveDetail ?? defaultChords;
    appendCoverage(
      visible,
      Math.max(draw.first, old ? edit.first : edit.nextFirst),
      Math.min(end, old ? oldEnd : nextEnd),
      chords
    );
    appendCoverage(others, draw.first, Math.min(end, leftFirst), chords);
    appendCoverage(others, Math.max(draw.first, leftEnd), Math.min(end, rightFirst), chords);
    appendCoverage(others, Math.max(draw.first, rightEnd), end, chords);
  }
  return { visible, others };
}

export function visiblePathResize<B>(
  before: readonly TDraw<B>[],
  after: readonly TDraw<B>[],
  edit: TMixedResize<B>,
  defaultChords: number
) {
  const old = coverage(before, edit, true, defaultChords),
    next = coverage(after, edit, false, defaultChords);
  if (
    old.others.length !== next.others.length ||
    old.others.some(
      (span, i) =>
        span.first !== next.others[i].first ||
        span.count !== next.others[i].count ||
        span.chords !== next.others[i].chords
    )
  )
    return undefined;
  if (!old.visible.length && !next.visible.length) return "hidden" as const;
  if (!edit.before || !edit.after) {
    const visible = edit.before ? old.visible : next.visible;
    if (visible.length !== 1) return undefined;
    const { chords, first, count } = visible[0];
    return { chords, first, nextFirst: first, before: edit.before ? count : 0, after: edit.after ? count : 0 };
  }
  if (old.visible.length !== 1 || next.visible.length !== 1 || old.visible[0].chords !== next.visible[0].chords)
    return undefined;
  return {
    chords: old.visible[0].chords,
    first: old.visible[0].first,
    before: old.visible[0].count,
    nextFirst: next.visible[0].first,
    after: next.visible[0].count,
  };
}
