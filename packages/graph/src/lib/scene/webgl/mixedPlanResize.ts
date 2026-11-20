import { MIXED_PATH_MAX_SOURCES, MIXED_PATH_SOURCE_STRIDE } from "./mixedPathPlan";
import type { TLowerPathCommand } from "./mixedPathPlan";
import type { TPathDrawSpan } from "./pathDrawIds";

type TEdit = { source: number; first: number; before: number; after: number; nextFirst?: number };
type TChange = { first: number; end: number; nextFirst: number; nextEnd: number; span: number };
type TInterval = { first: number; end: number; change: TChange };
type TPatch = { changes: TChange[]; additions: TChange[]; intervals: TInterval[]; delta: number };

function validRange(first: number, count: number, limit: number, minimum = 1): boolean {
  return Number.isInteger(first) && first >= 0 && Number.isInteger(count) && count >= minimum && first + count <= limit;
}

function prepareChanges(edits: readonly TEdit[], membership: boolean): TPatch | undefined {
  const changes: TChange[] = [];
  const additions: TChange[] = [];
  const intervals: TInterval[] = [];
  let delta = 0;
  for (const { source, first, before, after, nextFirst = first } of edits) {
    const minimum = membership && before !== after && first === nextFirst ? 0 : 1;
    if (
      !validRange(source, 1, MIXED_PATH_MAX_SOURCES) ||
      !validRange(first, before, MIXED_PATH_SOURCE_STRIDE, minimum) ||
      !validRange(nextFirst, after, MIXED_PATH_SOURCE_STRIDE, minimum)
    )
      return undefined;
    const base = source * MIXED_PATH_SOURCE_STRIDE;
    const change = {
      first: base + first,
      end: base + first + before,
      nextFirst: base + nextFirst,
      nextEnd: base + nextFirst + after,
      span: -1,
    };
    (before ? changes : additions).push(change);
    if (change.end < change.nextFirst || change.nextEnd < change.first) {
      intervals.push(
        { first: change.first, end: change.end, change },
        { first: change.nextFirst, end: change.nextEnd, change }
      );
    } else {
      intervals.push({
        first: Math.min(change.first, change.nextFirst),
        end: Math.max(change.end, change.nextEnd),
        change,
      });
    }
    delta += after - before;
  }
  intervals.sort((a, b) => a.first - b.first);
  for (let i = 1; i < intervals.length; i++) if (intervals[i - 1].end > intervals[i].first) return undefined;
  return { changes, additions, intervals, delta };
}

function firstInterval(intervals: readonly TInterval[], first: number): number {
  let low = 0;
  let high = intervals.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (intervals[mid].end <= first) low = mid + 1;
    else high = mid;
  }
  return low;
}

type TSpanWindow = { first: number; end: number };
type TAddressIndex = { buckets: Map<number, number[]>; total: number; links: number; limit: number; drift: number };
const PAGE_SIZE = 256;
// A physical address page names only the painter pages that could contain its spans.
const indices = new WeakMap<readonly TPathDrawSpan[], TAddressIndex>();

function includeSpan(index: TAddressIndex, span: TPathDrawSpan, i: number): void {
  const painterPage = Math.floor(i / PAGE_SIZE);
  const last = Math.floor((span.first + span.count - 1) / PAGE_SIZE);
  for (let page = Math.floor(span.first / PAGE_SIZE); page <= last; page++) {
    const hits = index.buckets.get(page);
    if (!hits) index.buckets.set(page, [painterPage]);
    else if (hits[hits.length - 1] !== painterPage && !hits.includes(painterPage)) hits.push(painterPage);
    else continue;
    index.links++;
  }
}

function preparedIndex(spans: readonly TPathDrawSpan[]): TAddressIndex | undefined {
  const cached = indices.get(spans);
  if (cached) return cached;
  const index: TAddressIndex = { buckets: new Map(), total: 0, links: 0, limit: 0, drift: 0 };
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!validRange(span.first, span.count, MIXED_PATH_MAX_SOURCES * MIXED_PATH_SOURCE_STRIDE)) return undefined;
    includeSpan(index, span, i);
    index.total += span.count;
  }
  index.limit = 2 * index.links;
  indices.set(spans, index);
  return index;
}

function candidatePages(index: TAddressIndex, intervals: readonly TInterval[]): Set<number> {
  const pages = new Set<number>();
  for (const { first, end } of intervals) {
    const last = Math.floor((end - 1) / PAGE_SIZE);
    for (let page = Math.floor(first / PAGE_SIZE); page <= last; page++) {
      const hits = index.buckets.get(page);
      if (!hits) continue;
      for (const hit of hits) {
        pages.add(hit);
        // A retained link can move by less than one page in either direction.
        if (index.drift) {
          if (hit) pages.add(hit - 1);
          pages.add(hit + 1);
        }
      }
    }
  }
  return pages;
}

function locateSpan(span: TPathDrawSpan, i: number, intervals: readonly TInterval[]): boolean {
  const { first, count } = span,
    end = first + count;
  if (end <= intervals[0].first || first >= intervals[intervals.length - 1].end) return true;
  for (let j = firstInterval(intervals, first); j < intervals.length && intervals[j].first < end; j++) {
    const { change } = intervals[j];
    const from = Math.max(change.nextFirst, first),
      to = Math.min(change.nextEnd, end);
    if (from < to && (from < change.first || to > change.end)) return false;
    if (change.end <= first || end <= change.first) continue;
    if (change.span !== -1 || change.first < first || change.end > end) return false;
    change.span = i;
  }
  return true;
}

function locateChanges(
  spans: readonly TPathDrawSpan[],
  total: number,
  { changes, intervals }: TPatch,
  index?: TAddressIndex
): boolean {
  if (index) {
    if (index.total !== total) return false;
    for (const page of candidatePages(index, intervals)) {
      const end = Math.min((page + 1) * PAGE_SIZE, spans.length);
      for (let i = page * PAGE_SIZE; i < end; i++) if (!locateSpan(spans[i], i, intervals)) return false;
    }
  } else {
    let count = 0;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (
        !validRange(span.first, span.count, MIXED_PATH_MAX_SOURCES * MIXED_PATH_SOURCE_STRIDE) ||
        !locateSpan(span, i, intervals)
      )
        return false;
      count += span.count;
    }
    if (count !== total) return false;
  }
  return changes.every((change) => change.span !== -1);
}

function append(spans: TPathDrawSpan[], span: TPathDrawSpan): void {
  const last = spans[spans.length - 1];
  if (last && last.first + last.count === span.first)
    spans[spans.length - 1] = { first: last.first, count: last.count + span.count };
  else spans.push(span);
}

type TReplacement = TSpanWindow & { pieces: TPathDrawSpan[] };
const sameSpan = (a: TPathDrawSpan, b: TPathDrawSpan) => a.first === b.first && a.count === b.count;

function replacements(spans: readonly TPathDrawSpan[], changes: TChange[]): TReplacement[] {
  changes.sort((a, b) => a.span - b.span || a.first - b.first);
  const replacements: TReplacement[] = [];
  for (let i = 0; i < changes.length; ) {
    // Only immediate painter neighbors can now join. Preserve a shared seam between adjacent edits.
    const start = Math.max(0, changes[i].span - 1);
    let limit = i + 1;
    while (limit < changes.length && changes[limit].span <= changes[limit - 1].span + 2) limit++;
    const end = Math.min(spans.length, changes[limit - 1].span + 2);
    const pieces: TPathDrawSpan[] = [];
    for (let pos = start; pos < end; pos++) {
      const span = spans[pos];
      if (i === limit || changes[i].span !== pos) {
        append(pieces, span);
        continue;
      }
      let cursor = span.first;
      while (i < limit && changes[i].span === pos) {
        const change = changes[i++];
        if (change.first > cursor) append(pieces, { first: cursor, count: change.first - cursor });
        if (change.nextEnd > change.nextFirst)
          append(pieces, { first: change.nextFirst, count: change.nextEnd - change.nextFirst });
        cursor = change.end;
      }
      if (cursor < span.first + span.count) append(pieces, { first: cursor, count: span.first + span.count - cursor });
    }
    let left = 0,
      right = 0;
    while (start + left < end && left < pieces.length && sameSpan(pieces[left], spans[start + left])) left++;
    while (
      end - right > start + left &&
      pieces.length - right > left &&
      sameSpan(pieces[pieces.length - right - 1], spans[end - right - 1])
    )
      right++;
    if (start + left !== end - right || left !== pieces.length - right)
      replacements.push({ first: start + left, end: end - right, pieces: pieces.slice(left, pieces.length - right) });
  }
  return replacements;
}

function replaceSpans(
  spans: readonly TPathDrawSpan[],
  edits: readonly TReplacement[],
  stablePositions: boolean
): TPathDrawSpan[] {
  if (stablePositions) {
    const result = spans.slice();
    for (const edit of edits) for (let j = 0; j < edit.pieces.length; j++) result[edit.first + j] = edit.pieces[j];
    return result;
  }
  const result: TPathDrawSpan[] = [];
  let cursor = 0;
  for (const edit of edits) {
    while (cursor < edit.first) result.push(spans[cursor++]);
    for (const piece of edit.pieces) result.push(piece);
    cursor = edit.end;
  }
  while (cursor < spans.length) result.push(spans[cursor++]);
  return result;
}

type TCompareRecords = (left: number, right: number) => number;

function insertionPoint(low: number, high: number, orderAt: (index: number) => number): number | undefined {
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const order = orderAt(mid);
    if (!Number.isFinite(order)) return undefined;
    if (order < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Packed spans retain painter order even when one span crosses an owner or texture boundary. */
function insertOrderedSpan(
  spans: TPathDrawSpan[],
  first: number,
  count: number,
  compare: TCompareRecords
): TReplacement | undefined {
  const order = compare(first, first + count - 1);
  if (!Number.isFinite(order) || order > 0) return undefined;
  const index = insertionPoint(0, spans.length, (i) => compare(spans[i].first + spans[i].count - 1, first));
  if (index === undefined) return undefined;
  const span = spans[index];
  const begin = span?.first ?? 0;
  const end = begin + (span?.count ?? 0);
  const cut = insertionPoint(begin, end, (address) => compare(address, first));
  if (cut === undefined) return undefined;
  const previous = spans[index - 1];
  const left = span && cut > span.first ? cut - 1 : previous && previous.first + previous.count - 1;
  if ((left !== undefined && !(compare(left, first) < 0)) || (cut < end && !(compare(first + count - 1, cut) < 0)))
    return undefined;

  // Pack both seams exactly as the full schedule does, including insertion into the middle of a merged span.
  const start = Math.max(0, index - 1);
  const pieces: TPathDrawSpan[] = previous ? [previous] : [];
  if (span && cut > span.first) append(pieces, { first: span.first, count: cut - span.first });
  append(pieces, { first, count });
  if (cut < end) append(pieces, { first: cut, count: end - cut });
  return { first: start, end: Math.min(spans.length, index + 1), pieces };
}

function transferIndex(
  index: TAddressIndex,
  before: readonly TPathDrawSpan[],
  after: readonly TPathDrawSpan[],
  edits: readonly TReplacement[],
  delta: number
): void {
  // Every splice can shift an earlier link by at most its change in span count.
  indices.delete(before);
  for (const edit of edits) {
    index.drift += Math.abs(edit.pieces.length - (edit.end - edit.first));
    for (let j = 0; j < edit.pieces.length; j++) includeSpan(index, edit.pieces[j], edit.first + j);
  }
  index.total += delta;
  if (index.links <= index.limit && index.drift < PAGE_SIZE) indices.set(after, index);
}

/**
 * A resized run keeps its painter position. For a new run the caller supplies the current painter order
 * of resident records. Immutable plans can also reuse the physical address index across edits.
 */
export function resizeMixedPlan<B>(
  spans: readonly TPathDrawSpan[],
  commands: readonly TLowerPathCommand<B>[],
  edits: readonly TEdit[],
  immutable = false,
  compare?: TCompareRecords
): { spans: TPathDrawSpan[]; commands: TLowerPathCommand<B>[] } | undefined {
  const command = commands[0];
  if (!edits.length || commands.length !== 1 || command.native !== undefined || command.first !== 0) return undefined;
  const patch = prepareChanges(edits, compare !== undefined);
  if (!patch) return undefined;
  const index = immutable && spans.length >= PAGE_SIZE ? preparedIndex(spans) : undefined;
  if (!locateChanges(spans, command.count, patch, index)) return undefined;
  const parts = replacements(spans, patch.changes);
  const stablePositions = parts.every((edit) => edit.end - edit.first === edit.pieces.length);
  const result = replaceSpans(spans, parts, stablePositions);
  for (const change of patch.additions) {
    const insert = compare && insertOrderedSpan(result, change.nextFirst, change.nextEnd - change.nextFirst, compare);
    if (!insert) return undefined;
    result.splice(insert.first, insert.end - insert.first, ...insert.pieces);
    parts.push(insert);
  }
  if (index) transferIndex(index, spans, result, parts, patch.delta);
  const count = command.count + patch.delta;
  const next = patch.delta ? { first: 0, count } : command;
  return { spans: result, commands: count ? [next] : [] };
}
