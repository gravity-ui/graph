// scripts/bench/culling/scene/scenes.ts
// Deterministic scenes of the scene bench. "guarantee" follows the sizes Nirvana guarantees (user, 2026-11-09):
// ~10k blocks with at least 3 anchors each, ~10k connections, ~1k groups. "median" is Nirvana's median graph,
// "stress" the 100k stress case.
import { STATUSES, anchorPosition, blockHeight } from "./look";
import type { TBlockMeta } from "./look";

export type TSceneKind = "guarantee" | "median" | "stress";

export type TBenchBlock = {
  id: string;
  is: "nirvana-like";
  x: number;
  y: number;
  width: number;
  height: number;
  selected: false;
  name: string;
  anchors: Array<{ id: string; blockId: string; type: "IN" | "OUT"; index: number }>;
  meta: TBlockMeta;
};

export type TBenchConnection = {
  id: string;
  sourceBlockId: string;
  sourceAnchorId: string;
  targetBlockId: string;
  targetAnchorId: string;
  points: Array<{ x: number; y: number }>;
};

export type TBenchGroup = { id: string; rect: { x: number; y: number; width: number; height: number } };

export type TBenchScene = { blocks: TBenchBlock[]; connections: TBenchConnection[]; groups: TBenchGroup[] };

const SIZES: Record<TSceneKind, { blocks: number; blocksPerGroup: number }> = {
  guarantee: { blocks: 10000, blocksPerGroup: 10 },
  median: { blocks: 130, blocksPerGroup: 10 },
  stress: { blocks: 100000, blocksPerGroup: 10 },
};

const COLUMN_STEP = 420;
const ROW_STEP = 260;
const WORDS = ["Extract", "features", "from", "the", "dataset", "and", "join", "with", "dictionary", "by", "key"];

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An orthogonal route from an output anchor to an input anchor, through the middle of the gap. */
export function routePoints(
  source: TBenchBlock,
  sourceIndex: number,
  target: TBenchBlock,
  targetIndex: number
): Array<{ x: number; y: number }> {
  const from = anchorPosition(false, sourceIndex);
  const to = anchorPosition(true, targetIndex);
  const sx = source.x + from.x;
  const sy = source.y + from.y;
  const tx = target.x + to.x;
  const ty = target.y + to.y;
  if (sy === ty)
    return [
      { x: sx, y: sy },
      { x: tx, y: ty },
    ];
  const middle = (sx + tx) / 2;
  return [
    { x: sx, y: sy },
    { x: middle, y: sy },
    { x: middle, y: ty },
    { x: tx, y: ty },
  ];
}

export function buildScene(kind: TSceneKind): TBenchScene {
  const random = mulberry32(9);
  const { blocks: count, blocksPerGroup } = SIZES[kind];
  const columns = Math.ceil(Math.sqrt(count));
  const blocks: TBenchBlock[] = [];
  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / columns);
    const row = i % columns;
    const inputs = 1 + Math.floor(random() * 2);
    const outputs = 2 + Math.floor(random() * 2);
    const words = 2 + Math.floor(random() * 5);
    const name = Array.from({ length: words }, () => WORDS[Math.floor(random() * WORDS.length)]).join(" ");
    const meta: TBlockMeta = {
      status: STATUSES[Math.floor(random() * STATUSES.length)],
      progress: random(),
      name: `${name} ${i}`,
      subname: `team-${i % 37}/operation`,
      version: `v${1 + (i % 5)}.${i % 10}.0`,
      icons: Math.floor(random() * 7),
      inputs,
      outputs,
    };
    const id = `b${i}`;
    const anchors: TBenchBlock["anchors"] = [];
    for (let k = 0; k < inputs; k++) anchors.push({ id: `${id}_in${k}`, blockId: id, type: "IN", index: k });
    for (let k = 0; k < outputs; k++) anchors.push({ id: `${id}_out${k}`, blockId: id, type: "OUT", index: k });
    blocks.push({
      id,
      is: "nirvana-like",
      x: column * COLUMN_STEP,
      y: row * ROW_STEP,
      width: 240,
      height: blockHeight(meta),
      selected: false,
      name: meta.name,
      anchors,
      meta,
    });
  }

  const connections: TBenchConnection[] = [];
  for (let i = columns; i < count; i++) {
    const target = blocks[i];
    const column = Math.floor(i / columns);
    const sourceRow = Math.floor(random() * columns);
    const source = blocks[(column - 1) * columns + sourceRow];
    const sourceIndex = Math.floor(random() * source.meta.outputs);
    const targetIndex = Math.floor(random() * target.meta.inputs);
    connections.push({
      id: `c${i}`,
      sourceBlockId: source.id,
      sourceAnchorId: `${source.id}_out${sourceIndex}`,
      targetBlockId: target.id,
      targetAnchorId: `${target.id}_in${targetIndex}`,
      points: routePoints(source, sourceIndex, target, targetIndex),
    });
  }

  // Groups cover tiles of 2 columns × (blocksPerGroup / 2) rows.
  const groups: TBenchGroup[] = [];
  const rowsPerGroup = Math.max(1, Math.floor(blocksPerGroup / 2));
  const groupColumns = Math.ceil(Math.ceil(count / columns) / 2);
  const groupRows = Math.ceil(columns / rowsPerGroup);
  for (let gx = 0; gx < groupColumns; gx++) {
    for (let gy = 0; gy < groupRows; gy++) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let c = gx * 2; c < gx * 2 + 2; c++) {
        for (let r = gy * rowsPerGroup; r < (gy + 1) * rowsPerGroup && r < columns; r++) {
          const block = blocks[c * columns + r];
          if (!block) continue;
          minX = Math.min(minX, block.x);
          minY = Math.min(minY, block.y);
          maxX = Math.max(maxX, block.x + block.width);
          maxY = Math.max(maxY, block.y + block.height);
        }
      }
      if (minX === Infinity) continue;
      const pad = 20;
      groups.push({
        id: `g${gx}_${gy}`,
        rect: { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad },
      });
    }
  }
  return { blocks, connections, groups };
}
