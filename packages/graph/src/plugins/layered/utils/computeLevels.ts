import { TConnectionId } from "../../../store/connection/ConnectionState";

/**
 * Assigns level to each block by BFS from nodes with no incoming edges (roots).
 * Levels are 0-based; roots get 0, their direct successors 1, etc.
 */
export function computeLevels(
  blockIds: TConnectionId[],
  connections: Array<{ sourceBlockId: TConnectionId; targetBlockId: TConnectionId }>
): Map<TConnectionId, number> {
  const idToStr = (id: TConnectionId) => String(id);
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const id of blockIds) {
    const s = idToStr(id);
    inDegree.set(s, 0);
    outEdges.set(s, []);
  }

  for (const c of connections) {
    const from = idToStr(c.sourceBlockId);
    const to = idToStr(c.targetBlockId);
    if (!inDegree.has(to)) inDegree.set(to, 0);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    const out = outEdges.get(from);
    if (out) out.push(to);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      level.set(id, 0);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const l = level.get(u) ?? 0;
    for (const v of outEdges.get(u) ?? []) {
      const cur = level.get(v);
      const next = l + 1;
      if (cur === undefined || next > cur) {
        level.set(v, next);
      }
      const deg = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, deg);
      if (deg === 0) {
        queue.push(v);
      }
    }
  }

  for (const id of blockIds) {
    const s = idToStr(id);
    if (!level.has(s)) {
      level.set(s, 0);
    }
  }

  const result = new Map<TConnectionId, number>();
  for (const id of blockIds) {
    result.set(id, level.get(idToStr(id)) ?? 0);
  }
  return result;
}
