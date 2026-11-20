import type { InstanceRanges } from "../instances/InstanceRanges";

import type { TPathDrawSpan } from "./pathDrawIds";

export type TMixedOwnerRange = TPathDrawSpan & { connection: boolean };
export type TMixedOwnerSnapshot = {
  layout: number;
  ownership: number;
  membership: number;
  ranges: TMixedOwnerRange[];
};

export function firstOverlappingOwnerRange(ranges: readonly TMixedOwnerRange[], first: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ranges[mid].first + ranges[mid].count <= first) low = mid + 1;
    else high = mid;
  }
  return low;
}

function insertOwnerRange(ranges: TMixedOwnerRange[], offset: number, count: number, connection: boolean): boolean {
  const i = firstOverlappingOwnerRange(ranges, offset);
  const left = ranges[i - 1];
  const right = ranges[i];
  const end = offset + count;
  if (right && right.first < end) return false;
  const joinsLeft = left?.connection === connection && left.first + left.count === offset;
  const joinsRight = right?.connection === connection && end === right.first;
  const first = joinsLeft ? left.first : offset;
  const last = joinsRight ? end + right.count : end;
  ranges.splice(i - Number(joinsLeft), Number(joinsLeft) + Number(joinsRight), {
    first,
    count: last - first,
    connection,
  });
  return true;
}

function patchRetainedOwners(
  source: InstanceRanges,
  previous: TMixedOwnerSnapshot,
  isConnection: (id: string) => boolean
): TMixedOwnerRange[] | undefined {
  const changes = source.retainedChangesSince(previous.layout);
  if (!changes) return undefined;
  const ranges = previous.ranges.slice();
  const owners = new Set<string>();
  // Free all old slots before assigning any. Only the first change of an ID describes the cached layout.
  for (const change of changes) {
    if (owners.has(change.id)) continue;
    owners.add(change.id);
    for (const { offset, count } of change.previous) {
      const i = firstOverlappingOwnerRange(ranges, offset);
      const old = ranges[i];
      const end = offset + count;
      if (!old || old.first > offset || end > old.first + old.count) return undefined;
      const kept: TMixedOwnerRange[] = [];
      if (old.first < offset) kept.push({ ...old, count: offset - old.first });
      if (end < old.first + old.count) kept.push({ ...old, first: end, count: old.first + old.count - end });
      ranges.splice(i, 1, ...kept);
    }
  }
  for (const id of owners) {
    const current = source.ownerRanges(id);
    if (current.length === 0) continue;
    const connection = isConnection(id);
    for (const { offset, count } of current) {
      if (!insertOwnerRange(ranges, offset, count, connection)) return undefined;
    }
  }
  return ranges;
}

export function updateMixedOwnerRanges(
  source: InstanceRanges,
  ownership: number,
  previous: TMixedOwnerSnapshot | undefined,
  isConnection: (id: string) => boolean
): TMixedOwnerSnapshot {
  const layout = source.layoutRevision;
  const membership = source.membershipRevision;
  if (previous?.layout === layout && previous.ownership === ownership) return previous;

  // Resizing or reordering a dense batch with the same owners cannot change its single ownership class.
  if (
    previous?.ownership === ownership &&
    previous.membership === membership &&
    previous.ranges.length === 1 &&
    source.liveCount === source.count
  ) {
    const ranges = [{ first: 0, count: source.liveCount, connection: previous.ranges[0].connection }];
    return { layout, ownership, membership, ranges };
  }

  if (source.layoutRetained && previous?.ownership === ownership) {
    const ranges = patchRetainedOwners(source, previous, isConnection);
    if (ranges) return { layout, ownership, membership, ranges };
  }

  const ranges: TMixedOwnerRange[] = [];
  source.forEachRange((id, first, count) => {
    const connection = isConnection(id);
    const last = ranges[ranges.length - 1];
    if (last?.connection === connection && last.first + last.count === first) last.count += count;
    else ranges.push({ first, count, connection });
  });
  return { layout, ownership, membership, ranges };
}
