import type { TTileRect } from "../../../culling/TileIndex";
import { InstanceRanges } from "../InstanceRanges";
import type { TSceneFrame } from "../backendTypes";
import { TranslucentRefinement, coalesceTranslucentRuns, translucentRunOwners } from "../coalesceTranslucent";
import type { TTranslucentRun } from "../translucentOrder";

const clip: TTileRect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const box = (x: number): TTileRect => ({ minX: x, maxX: x + 5, minY: 0, maxY: 5 });

describe("translucent refinement after a direct draw", () => {
  const frame: TSceneFrame = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    scale: 1,
    dpr: 2,
    level: "detailed",
    time: 0,
    dimColor: "",
  };

  it("requests one follow-up only when the submitted draw count reaches the threshold", () => {
    const refinement = new TranslucentRefinement();
    expect(refinement.record(frame, 511, 0)).toBe(false);
    expect(refinement.take(frame, 0)).toBe(false);
    expect(refinement.record(frame, 512, 0)).toBe(true);
    expect(refinement.take({ ...frame, time: 1 }, 0)).toBe(true);
    expect(refinement.take(frame, 0)).toBe(false);
  });

  it("remeasures after panning, zooming, resizing or changing the active programs", () => {
    const refinement = new TranslucentRefinement();
    for (const camera of [
      { x: 1 },
      { y: 1 },
      { width: 801 },
      { height: 601 },
      { dpr: 1 },
      { scale: 0.99 },
      { level: "schematic" as const },
    ]) {
      const reusedFrame = { ...frame };
      refinement.record(reusedFrame, 600, 0);
      Object.assign(reusedFrame, camera);
      expect(refinement.take(reusedFrame, 0)).toBe(false);
      expect(refinement.take(frame, 0)).toBe(false);
    }
    refinement.record(frame, 600, 0);
    expect(refinement.take(frame, 1)).toBe(false);
    refinement.record(frame, 600, 1);
    refinement.clear();
    expect(refinement.take(frame, 1)).toBe(false);
  });
});

function schedule(): { sources: InstanceRanges[]; runs: TTranslucentRun[] } {
  const sources = [new InstanceRanges(1), new InstanceRanges(1)];
  sources[0].set("a", [1]);
  sources[0].set("c", [3]);
  sources[1].set("b", [2]);
  return {
    sources,
    runs: [
      { source: 0, first: 0, count: 1 },
      { source: 1, first: 0, count: 1 },
      { source: 0, first: 1, count: 1 },
    ],
  };
}

describe("disjoint translucent runs", () => {
  it("merges consecutive resident draws only across disjoint intervening paint", () => {
    const { sources, runs } = schedule();
    const owners = translucentRunOwners(runs, sources);
    const positions: Record<string, TTileRect> = { a: box(0), b: box(20), c: box(40) };
    expect(coalesceTranslucentRuns(owners, clip, (id) => positions[id])).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 1 },
    ]);
    positions.c = box(20);
    expect(coalesceTranslucentRuns(owners, clip, (id) => positions[id])).toEqual(runs);
  });

  it("retains overlap constraints from every intervening draw after previous merges", () => {
    const { sources, runs } = schedule();
    sources[0].set("d", [4]);
    runs.push({ source: 0, first: 2, count: 1 });
    const positions: Record<string, TTileRect> = { a: box(0), b: box(20), c: box(40), d: box(20) };
    expect(coalesceTranslucentRuns(translucentRunOwners(runs, sources), clip, (id) => positions[id])).toEqual([
      { source: 0, first: 0, count: 2 },
      { source: 1, first: 0, count: 1 },
      { source: 0, first: 2, count: 1 },
    ]);
  });

  it("keeps nonfinite geometry conservative and removes only paint outside the retained clip", () => {
    const { sources, runs } = schedule();
    const owners = translucentRunOwners(runs, sources);
    const positions: Record<string, TTileRect> = { a: box(200), b: box(20), c: { ...box(40), minX: NaN } };
    expect(coalesceTranslucentRuns(owners, clip, (id) => positions[id])).toEqual(runs.slice(1));
  });

  it("does not move a range across another live range of the same source in physical order", () => {
    const { sources, runs } = schedule();
    const reversed = [runs[2], runs[1], runs[0]];
    expect(coalesceTranslucentRuns(translucentRunOwners(reversed, sources), clip, () => box(0))).toEqual(reversed);
  });

  it("retains glyph or unknown-ink barriers even when their authored bounds are outside the clip", () => {
    const { sources, runs } = schedule();
    const owners = translucentRunOwners(runs, sources, [false, true]);
    const positions: Record<string, TTileRect> = { a: box(0), b: box(200), c: box(40) };
    expect(coalesceTranslucentRuns(owners, clip, (id) => positions[id])).toEqual(runs);
  });
});
