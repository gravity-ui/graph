import type { TTileRect } from "../../../../culling/TileIndex";
import { OverlapGrid } from "../OverlapGrid";

import { box, bruteForce, seeded } from "./utils/boxes";

/** Overlap levels of boxes given in scene order, and their count. */
function overlapLevels(boxes: readonly TTileRect[]): { levels: Int32Array; count: number } {
  const flat = new Float64Array(boxes.length * 4);
  boxes.forEach((item, index) => flat.set([item.minX, item.minY, item.maxX, item.maxY], index * 4));
  const grid = new OverlapGrid();
  const levels = new Int32Array(boxes.length);
  grid.compute(flat, boxes.length, levels);
  return { levels, count: grid.levelCount };
}

describe("OverlapGrid.compute", () => {
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
  it("keeps previously filed neighbors when a caller rewrites the box twice before moving it", () => {
    const boxes = Float64Array.of(0, 0, 10, 10, 5, 0, 15, 10, 70, 0, 80, 10);
    const levels = new Int32Array(3);
    const grid = new OverlapGrid();
    grid.compute(boxes, 3, levels);
    grid.writeBox(0, [30, 0, 40, 10]);
    grid.writeBox(0, [60, 0, 70, 10]);
    expect(grid.move([0])).toEqual([1, 2]);
    expect([...levels]).toEqual([0, 0, 1]);

    boxes.set([0, 0, 10, 10]);
    expect(grid.move([0])).toEqual([1, 2]);
    expect([...levels]).toEqual([0, 1, 0]);
  });

  it("refiles a single wide box in both directions without relabeling unsupported successors", () => {
    const count = 1000;
    const boxes = Array.from({ length: count }, (_, i) =>
      box(i * 10, i % 2 === 0 ? 0 : 10000, i * 10 + 1, i % 2 === 0 ? 1 : 10001)
    );
    const moved = 100;
    boxes[moved] = box(-100, -100, -90, -90);
    for (let i = 0; i < 6; i++) boxes[200 + i] = box(5000 + i * 9, 5000, 5010 + i * 9, 5010);
    const flat = new Float64Array(boxes.flatMap((b) => [b.minX, b.minY, b.maxX, b.maxY]));
    const levels = new Int32Array(count);
    const grid = new OverlapGrid();
    grid.compute(flat, count, levels);
    for (const next of [
      box(1000, 1000, 9000, 9000),
      box(-100, -100, -90, -90),
      box(-Infinity, 1000, Infinity, 9000),
      box(3000, 1000, 9000, 9000),
      box(-100, -100, -90, -90),
    ]) {
      const before = [...levels];
      boxes[moved] = next;
      flat.set([next.minX, next.minY, next.maxX, next.maxY], moved * 4);
      const changed = grid.move([moved]);
      expect(changed).toBeDefined();
      expect([...levels]).toEqual(bruteForce(boxes));
      expect(changed).toEqual(before.flatMap((old, i) => (old === levels[i] ? [] : [i])));
    }
  });

  it("reconnects across a populated strip without reading distant owners' geometry", () => {
    const count = 256;
    const moved = count - 2;
    const last = count - 1;
    const boxes = new Float64Array(count * 4);
    for (let i = 0; i < count; i++) boxes.set([i * 8, 0, i * 8 + 1, 1], 4 * i);
    boxes.set([0, 0, 1, 1], 4 * moved);

    // Count distinct owners read from the geometry given to the grid, independently of its indexing strategy.
    const read = new Set<number>();
    const tracked = new Proxy(boxes, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) read.add(Math.floor(Number(key) / 4));
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const levels = new Int32Array(count);
    const grid = new OverlapGrid();
    grid.compute(tracked, count, levels);
    expect([levels[moved], levels[last]]).toEqual([1, 0]);
    read.clear();
    boxes.set([last * 8, 0, last * 8 + 1, 1], moved * 4);
    expect(grid.move([moved], undefined, [0, 0, 1, 1])).toEqual([moved, last]);
    expect([levels[moved], levels[last]]).toEqual([0, 1]);
    // Only the old and new neighbors can affect these two final slots. Allow extra grid-cell candidates.
    expect(read.size).toBeLessThan(16);
  });

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
