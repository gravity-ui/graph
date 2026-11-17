import type { TTileRect } from "../../culling/TileIndex";
import { bakeElementStyle } from "../style";
import type { TScenePrimitive } from "../types";

import { SceneDepth } from "./depth";
import { geometryBounds } from "./levelBounds";
import { OverlapGrid, TranslucentLevels } from "./overlapLevels";
import type { TLevelElement } from "./overlapLevels";

const box = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

/** The levels by definition: 1 + the highest level of the earlier boxes that intersect, O(n^2). */
function bruteForce(boxes: readonly TTileRect[]): number[] {
  const levels: number[] = [];
  boxes.forEach((current, index) => {
    let best = -1;
    for (let other = 0; other < index; other++) {
      const b = boxes[other];
      const hit = !(b.maxX < current.minX || current.maxX < b.minX || b.maxY < current.minY || current.maxY < b.minY);
      if (hit) best = Math.max(best, levels[other]);
    }
    levels.push(best + 1);
  });
  return levels;
}

/** Overlap levels of boxes given in scene order, and their count. */
function overlapLevels(boxes: readonly TTileRect[]): { levels: Int32Array; count: number } {
  const flat = new Float64Array(boxes.length * 4);
  boxes.forEach((item, index) => flat.set([item.minX, item.minY, item.maxX, item.maxY], index * 4));
  const grid = new OverlapGrid();
  const levels = new Int32Array(boxes.length);
  grid.compute(flat, boxes.length, levels);
  return { levels, count: grid.levelCount };
}

/** A seeded generator in [0, 1) (Park-Miller): the random tests are repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("overlapLevels", () => {
  it("puts disjoint elements on level 0", () => {
    const boxes = [box(0, 0, 10, 10), box(20, 0, 30, 10), box(0, 20, 10, 30), box(1000, 1000, 1010, 1010)];
    expect([...overlapLevels(boxes).levels]).toEqual([0, 0, 0, 0]);
    expect(overlapLevels(boxes).count).toBe(1);
  });

  it("raises each element of a chain and of a stack over the earlier ones it overlaps", () => {
    // A chain: a overlaps b, b overlaps c, a and c are apart; then d overlaps only a.
    const chain = [box(0, 0, 10, 10), box(8, 0, 18, 10), box(16, 0, 26, 10), box(-5, 5, 2, 12)];
    expect([...overlapLevels(chain).levels]).toEqual([0, 1, 2, 1]);
    // A stack: each overlaps all the earlier ones.
    const stack = [box(0, 0, 50, 50), box(10, 10, 60, 60), box(20, 20, 70, 70)];
    expect([...overlapLevels(stack).levels]).toEqual([0, 1, 2]);
    expect(overlapLevels(stack).count).toBe(3);
  });

  it("does not raise elements that share a grid cell without overlapping", () => {
    // Cells are about 100 units: these blocks share cells but their bounds are apart.
    const boxes: TTileRect[] = [];
    for (let i = 0; i < 20; i++) boxes.push(box(i * 101, 0, i * 101 + 100, 100));
    expect(overlapLevels(boxes).levels.every((level: number) => level === 0)).toBe(true);
  });

  it("levels a stack of 50,000 boxes in one cell in linear time", () => {
    // Every box overlaps every earlier one. Without the stop at the cell's bound each box scans all earlier boxes,
    // 1.25e9 tests: about 14 s here, against about 0.2 s with it. The bound leaves a wide margin for slow machines.
    const count = 50000;
    const boxes = Array.from({ length: count }, () => box(0, 0, 10, 10));
    const start = performance.now();
    const { levels } = overlapLevels(boxes);
    expect(performance.now() - start).toBeLessThan(5000);
    expect(levels.every((level, index) => level === index)).toBe(true);
    // Moving the top box off the stack and back re-levels only it.
    const flat = new Float64Array(boxes.flatMap((item) => [item.minX, item.minY, item.maxX, item.maxY]));
    const out = new Int32Array(count);
    const grid = new OverlapGrid();
    grid.compute(flat, count, out);
    flat.set([100, 100, 110, 110], (count - 1) * 4);
    expect(grid.move([count - 1])).toEqual([count - 1]);
    expect(out[count - 1]).toBe(0);
    flat.set([0, 0, 10, 10], (count - 1) * 4);
    expect(grid.move([count - 1])).toEqual([count - 1]);
    expect(out[count - 1]).toBe(count - 1);
    expect(grid.levelCount).toBe(count);
  });

  it("matches the definition on random boxes, with wide and unbounded ones", () => {
    const random = seeded(7);
    const boxes: TTileRect[] = [];
    for (let i = 0; i < 600; i++) {
      const size = random() < 0.05 ? 400 + random() * 4000 : 5 + random() * 60;
      const x = random() * 3000;
      const y = random() * 2000;
      boxes.push(box(x, y, x + size * (0.3 + random()), y + size * (0.3 + random())));
    }
    boxes[100] = box(-Infinity, 500, Infinity, 520);
    boxes[300] = box(1500, -Infinity, 1510, Infinity);
    expect([...overlapLevels(boxes).levels]).toEqual(bruteForce(boxes));
  });

  it("never puts two overlapping elements on one level", () => {
    const random = seeded(3);
    const boxes: TTileRect[] = [];
    for (let i = 0; i < 300; i++) {
      const x = random() * 800;
      const y = random() * 800;
      boxes.push(box(x, y, x + 40 + random() * 40, y + 30 + random() * 30));
    }
    const { levels } = overlapLevels(boxes);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [p, q] = [boxes[a], boxes[b]];
        if (!(p.maxX < q.minX || q.maxX < p.minX || p.maxY < q.minY || q.maxY < p.minY)) {
          expect(levels[b]).toBeGreaterThan(levels[a]);
        }
      }
    }
  });
});

describe("OverlapGrid.move", () => {
  it("abandons a dense cascade with the original levels intact, then rebuilds exactly", () => {
    const count = 512;
    const flat = new Float64Array(count * 4);
    flat.set([0, 0, 10, 10]);
    for (let i = 1; i < count; i++) flat.set([9.5, 0, 19.5, 10], i * 4);
    const out = new Int32Array(count);
    const grid = new OverlapGrid();
    grid.compute(flat, count, out);
    const before = out.slice();
    expect(before.every((level, index) => level === index)).toBe(true);

    // A small shrink separates the first box from the stack. Every later level falls by one.
    flat.set([1, 1, 9, 9]);
    expect(grid.move([0])).toBeUndefined();
    expect(out).toEqual(before);
    expect(grid.levelCount).toBe(count);
    grid.compute(flat, count, out);
    expect(out.every((level, index) => level === Math.max(0, index - 1))).toBe(true);
    expect(grid.levelCount).toBe(count - 1);

    // The exact rebuild clears all work queued by the aborted move.
    const top = count - 1;
    flat.set([40, 0, 50, 10], top * 4);
    expect(grid.move([top])).toEqual([top]);
    expect(out[top]).toBe(0);
    expect(grid.levelCount).toBe(count - 2);
  });

  it("re-levels moved boxes exactly as a full computation would, and reports the boxes whose level changed", () => {
    const random = seeded(11);
    const count = 400;
    const flat = new Float64Array(count * 4);
    const place = (index: number, far: boolean): void => {
      const size = random() < 0.05 ? 300 + random() * 600 : 10 + random() * 50;
      const x = far ? 5000 + random() * 2000 : random() * 2000;
      const y = random() * 1500;
      flat.set([x, y, x + size * (0.4 + random()), y + size * (0.4 + random())], index * 4);
    };
    for (let index = 0; index < count; index++) place(index, false);
    // A box unbounded along x: it reaches both edges of the grid.
    flat.set([-Infinity, 700, Infinity, 710], 50 * 4);
    const boxesOf = (): TTileRect[] =>
      Array.from({ length: count }, (_, index) =>
        box(...(Array.from(flat.subarray(index * 4, index * 4 + 4)) as [number, number, number, number]))
      );
    const out = new Int32Array(count);
    const grid = new OverlapGrid();
    grid.compute(flat, count, out);
    expect([...out]).toEqual(bruteForce(boxesOf()));
    let full = 0;
    let incremental = 0;
    for (let round = 0; round < 150; round++) {
      const before = [...out];
      const moved = Array.from({ length: 1 + Math.floor(random() * 3) }, () => Math.floor(random() * count));
      for (const index of new Set(moved)) place(index, random() < 0.1);
      // A box that becomes unbounded both ways covers every cell: wide.
      if (round === 75) flat.set([-Infinity, -Infinity, Infinity, Infinity], moved[0] * 4);
      const changed = grid.move([...new Set(moved)]);
      if (changed === undefined) {
        full++;
        grid.compute(flat, count, out);
      } else {
        incremental++;
        const differing = before.flatMap((level, index) => (level === out[index] ? [] : [index]));
        expect([...changed].sort((a, b) => a - b)).toEqual(differing);
      }
      const want = bruteForce(boxesOf());
      expect([...out]).toEqual(want);
      expect(grid.levelCount).toBe(Math.max(...want) + 1);
    }
    expect(incremental).toBeGreaterThan(100);
    expect(full).toBeGreaterThan(0);
  });
});

describe("TranslucentLevels", () => {
  type TPlaced = TLevelElement & { zIndex: number; order: number };

  type TScene = { depth: SceneDepth; levels: TranslucentLevels; update: () => boolean };

  function scene(elements: Record<string, TPlaced>): TScene {
    const depth = new SceneDepth();
    for (const [id, element] of Object.entries(elements)) depth.set(id, element.zIndex, element.order);
    const levels = new TranslucentLevels();
    const keyOf = (id: string): number => depth.keyOf(id);
    const elementOf = (id: string): TLevelElement | undefined => elements[id];
    return { depth, levels, update: (): boolean => levels.update(keyOf, elementOf) };
  }

  const placed = (x: number, y: number, zIndex: number, order: number): TPlaced => ({
    x,
    y,
    bounds: box(0, 0, 100, 60),
    zIndex,
    order,
  });

  it("walks in scene order: a raised zIndex bucket puts the element above a later one", () => {
    const elements = { a: placed(0, 0, 200, 1), b: placed(50, 30, 200, 2) };
    const { depth, levels, update } = scene(elements);
    levels.set("a", undefined);
    levels.set("b", undefined);
    expect(update()).toBe(true);
    expect([levels.levelOf("a"), levels.levelOf("b")]).toEqual([0, 1]);
    // A style raises a: its bucket is the zIndex plus the raise.
    depth.set("a", 201, 1);
    levels.reordered("a");
    expect(update()).toBe(true);
    expect([levels.levelOf("a"), levels.levelOf("b")]).toEqual([1, 0]);
  });

  it("uses the bounds of the baked primitives: a widened stroke overlaps a neighbour", () => {
    // The store bounds (0..100) are 20 apart; the border widened to 30 (outside) reaches the neighbour.
    const elements = { a: placed(0, 0, 200, 1), b: placed(120, 0, 200, 2) };
    const { levels, update } = scene(elements);
    const border: TScenePrimitive[] = [
      { kind: "rect", x: 0, y: 0, width: 100, height: 60, border: { width: 2, align: "outside" }, part: "border" },
    ];
    levels.set("a", geometryBounds(border));
    levels.set("b", geometryBounds(border));
    update();
    expect([levels.levelOf("a"), levels.levelOf("b")]).toEqual([0, 0]);
    levels.set("a", geometryBounds(bakeElementStyle(border, { opacity: 0.5, parts: { border: { width: 30 } } })));
    expect(levels.pending).toBe(true);
    expect(update()).toBe(true);
    expect([levels.levelOf("a"), levels.levelOf("b")]).toEqual([0, 1]);
  });

  it("follows a move: dragging an element onto another raises the later one, dragging it away lowers it", () => {
    const elements = { a: placed(0, 0, 200, 1), b: placed(500, 0, 200, 2), c: placed(1000, 0, 200, 3) };
    const { levels, update } = scene(elements);
    for (const id of ["a", "b", "c"]) levels.set(id, undefined);
    update();
    const before = levels.revision;
    expect(["a", "b", "c"].map((id) => levels.levelOf(id))).toEqual([0, 0, 0]);
    // A pan or a zoom changes nothing the levels read: no update runs.
    expect(levels.pending).toBe(false);
    expect(update()).toBe(false);
    elements.a.x = 480;
    levels.moved("a");
    expect(update()).toBe(true);
    expect(["a", "b", "c"].map((id) => levels.levelOf(id))).toEqual([0, 1, 0]);
    expect(levels.revision).not.toBe(before);
    // A move that changes no level keeps the revision.
    const after = levels.revision;
    elements.a.x = 470;
    levels.moved("a");
    expect(update()).toBe(false);
    expect(levels.revision).toBe(after);
    elements.a.x = 0;
    levels.moved("a");
    expect(update()).toBe(true);
    expect(levels.levelOf("b")).toBe(0);
  });

  it("does not move grid entries when changed local bounds and origin leave the absolute box unchanged", () => {
    const elements = { a: placed(0, 0, 200, 1), b: placed(50, 0, 200, 2) };
    const { levels, update } = scene(elements);
    levels.set("a", undefined);
    levels.set("b", undefined);
    update();
    const move = jest.spyOn(OverlapGrid.prototype, "move");
    try {
      elements.a.x = 10;
      elements.a.bounds = box(-10, 0, 90, 60);
      levels.moved("a");
      expect(update()).toBe(false);
      expect(move).not.toHaveBeenCalled();
      expect([levels.levelOf("a"), levels.levelOf("b")]).toEqual([0, 1]);
    } finally {
      move.mockRestore();
    }
  });

  it("drops an element that stops being translucent and lowers the ones above it", () => {
    const elements = { a: placed(0, 0, 200, 1), b: placed(50, 0, 200, 2), c: placed(100, 0, 200, 3) };
    const { levels, update } = scene(elements);
    for (const id of ["a", "b", "c"]) levels.set(id, undefined);
    update();
    expect(["a", "b", "c"].map((id) => levels.levelOf(id))).toEqual([0, 1, 2]);
    expect(levels.count).toBe(3);
    levels.delete("b");
    update();
    expect([levels.levelOf("a"), levels.levelOf("c")]).toEqual([0, 1]);
    // Moving an element that is not translucent changes nothing.
    levels.moved("b");
    expect(levels.pending).toBe(false);
  });

  it("rebuilds nothing when an opaque element is raised among translucent ones, and re-levels a raised translucent one", () => {
    // One band: an opaque element O first, then 1000 translucent ones; T0 and T1 overlap, the rest lie apart.
    const elements: Record<string, TPlaced> = { O: placed(0, -500, 200, 0) };
    for (let i = 0; i < 1000; i++) elements[`T${i}`] = placed(i < 2 ? i * 50 : i * 150, 0, 200, i + 1);
    const { depth, levels, update } = scene(elements);
    for (let i = 0; i < 1000; i++) levels.set(`T${i}`, undefined);
    // What the backend does after each change: reorder only the elements whose own zIndex or order was set.
    const flush = (): string[] => {
      const changed = depth.takeChanged();
      for (const id of depth.takeSet()) levels.reordered(id);
      return changed;
    };
    flush();
    update();
    expect([levels.levelOf("T0"), levels.levelOf("T1")]).toEqual([0, 1]);
    const rebuild = jest.spyOn(levels as unknown as { rebuild: () => boolean }, "rebuild");
    // Raise O: the dense ranks of the band renumber every translucent element, but their order stands.
    depth.set("O", 200, 2000);
    expect(flush()).toHaveLength(1001);
    expect(levels.pending).toBe(false);
    expect(update()).toBe(false);
    expect(rebuild).not.toHaveBeenCalled();
    // Raise T0 above T1: a full rebuild, and T0 now lies over T1.
    depth.set("T0", 200, 2001);
    flush();
    expect(levels.pending).toBe(true);
    expect(update()).toBe(true);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect([levels.levelOf("T1"), levels.levelOf("T0")]).toEqual([0, 1]);
  });
});
