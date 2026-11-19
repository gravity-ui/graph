import type { TTileRect } from "../../../culling/TileIndex";
import { bakeElementStyle } from "../../style";
import type { TScenePrimitive } from "../../types";
import { InstanceRanges } from "../InstanceRanges";
import { SceneDepth } from "../depth";
import { geometryBounds } from "../levelBounds";
import { OverlapGrid, TranslucentLevels } from "../overlapLevels";
import type { TLevelElement } from "../overlapLevels";
import { orderTranslucent, orderTranslucentChunks } from "../translucentOrder";
import type { TTranslucentOrderCache } from "../translucentOrder";

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

  it("preserves painted overlap when large origins and local coordinates cancel in float32", () => {
    const origin = 2 ** 26;
    const elements = { back: placed(origin, 0, 0, 0), front: placed(0, 0, 0, 1) };
    const { levels, update } = scene(elements);
    // In double precision the two intervals are separate. In the shader both local endpoints round to -origin.
    levels.set("back", box(-origin + 1, 0, -origin + 2, 1), true);
    levels.set("front", box(0, 0, 0.5, 1), true);
    update();
    expect(levels.levelOf("back")).toBeLessThan(levels.levelOf("front"));
    elements.back.x += 1000;
    levels.moved("back");
    update();
    expect(levels.levelOf("back")).toBe(levels.levelOf("front"));
  });

  it("keeps later painter bands stable when an earlier edge gains or drops overlaps", () => {
    const elements = {
      edge: placed(0, 0, 100, 0),
      next: placed(50, 0, 100, 1),
      block: placed(75, 0, 200, 2),
      label: placed(90, 0, 200, 3),
    };
    const { depth, levels } = scene(elements);
    const ids = Object.keys(elements) as (keyof typeof elements)[];
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        (id) => elements[id as keyof typeof elements],
        (id) => elements[id as keyof typeof elements].zIndex
      );
    for (const id of ids) levels.set(id, undefined);
    update();
    expect(ids.map((id) => levels.levelOf(id))).toEqual([0, 1, 2, 3]);
    elements.edge.x = 500;
    levels.moved("edge");
    expect(update()).toBe(true);
    expect(ids.map((id) => levels.levelOf(id))).toEqual([0, 0, 2, 3]);
    expect(levels.count).toBe(3);
    expect(levels.changedLevelIds).toEqual(["next"]);
    const revision = levels.revision;
    const delta = levels.changedLevelIds;
    elements.edge.x = 510;
    levels.moved("edge");
    expect(update()).toBe(false);
    expect(levels.revision).toBe(revision);
    expect(levels.changedLevelIds).toBe(delta);
    elements.edge.x = 0;
    levels.moved("edge");
    expect(update()).toBe(true);
    expect(ids.map((id) => levels.levelOf(id))).toEqual([0, 1, 2, 3]);
    expect(levels.changedLevelIds).toEqual(["next"]);
    expect(levels.count).toBe(4);
  });

  it("retains upper command pages on a lower membership edit and preserves the full painter order", () => {
    const elements: Record<string, TPlaced> = {
      edge: placed(0, 0, -3.5, 0),
      glow: placed(10, 0, -3.5, 1),
      body: placed(0, 0, 0.25, 2),
      label: placed(10, 0, 0.25, 3),
      distant: placed(1000, 0, 0.25, 4),
    };
    const { depth, levels } = scene(elements);
    const keys = (id: string) => depth.keyOf(id);
    const edges = new InstanceRanges(1);
    const blocks = new InstanceRanges(1);
    for (const id of ["edge", "glow"]) edges.set(id, [1]);
    // An owner removed from the overlap index may still have a resident range at the default level.
    edges.setSteps("untracked", [{ step: 1, instances: new Float32Array([1]) }]);
    // Each block occupies a different physical page. The overlapping label must follow its body.
    for (const id of ["label", "distant", "body"]) blocks.set(id, new Float32Array(1024));
    edges.retainLayout();
    blocks.retainLayout();
    const dense = new InstanceRanges(1);
    dense.set("distant", [4]);
    dense.set("body", [2]);
    dense.set("label", [3]);
    const sources = [{ instances: blocks }, { instances: edges }, { instances: dense }];
    const cache: TTranslucentOrderCache = {};
    const draw = (subBits: number) => {
      levels.update(
        keys,
        (id) => elements[id],
        (id) => elements[id].zIndex
      );
      cache.levelRevision = levels.revision;
      cache.changedLevelIds = levels.changedLevelIds;
      return orderTranslucentChunks(
        sources,
        (id) => levels.orderLevelOf(id),
        keys,
        subBits,
        true,
        cache,
        (id) => levels.levelOf(id)
      ).flatMap((part) => part.runs.slice(part.first, part.end));
    };
    // Original absolute levels equal the size of all preceding bands plus the local overlap level.
    const reference = (absolute: Record<string, number>, bits: number) =>
      orderTranslucent(sources, (id) => absolute[id] ?? 0, keys, bits, false);
    const original = { edge: 0, glow: 1, body: 2, label: 3, distant: 2 };
    for (const id of Object.keys(elements)) levels.set(id, undefined);
    const initial = draw(18);
    expect([...dense.data]).toEqual([2, 4, 3]);
    expect(initial).toEqual(reference(original, 18));
    expect(draw(5)).toEqual(reference(original, 5));

    levels.delete("glow");
    edges.delete("glow");
    const visit = jest.spyOn(blocks, "forEachRange");
    const updated = draw(5);
    expect(visit).not.toHaveBeenCalled();
    visit.mockRestore();
    expect(updated).toEqual(reference({ edge: 0, body: 1, label: 2, distant: 1 }, 5));

    levels.set("glow", undefined);
    edges.setSteps("glow", [{ step: 63, instances: new Float32Array([1]) }]);
    expect(draw(6)).toEqual(reference(original, 6));

    // Move a body to a new middle band, then remove that band by restoring its original depth.
    elements.body.zIndex = -0.25;
    depth.set("body", -0.25, 2);
    levels.reordered("body");
    expect(draw(6)).toEqual(reference({ edge: 0, glow: 1, body: 2, label: 3, distant: 3 }, 6));
    elements.body.zIndex = 0.25;
    depth.set("body", 0.25, 2);
    levels.reordered("body");
    expect(draw(6)).toEqual(reference(original, 6));

    elements.low = placed(0, 0, -8, 5);
    depth.set("low", -8, 5);
    for (let round = 0; round < 2; round++) {
      levels.set("low", undefined);
      edges.set("low", [1]);
      expect(draw(6)).toEqual(reference({ low: 0, edge: 1, glow: 2, body: 3, label: 4, distant: 3 }, 6));
      levels.delete("low");
      edges.delete("low");
      expect(draw(6)).toEqual(reference(original, 6));
    }
  });

  it("keeps exact painter keys and deltas across repeated band insertions, dense fallback and undo", () => {
    const levels = new TranslucentLevels();
    const element = placed(0, 0, 0, 0);
    const update = () => levels.update(Number, () => element, Number);
    const inserted = Array.from({ length: 16 }, (_, i) => String(2 ** -(i + 1)));
    const resident = new Set(["0", "1"]);
    for (const id of resident) levels.set(id, undefined);
    update();
    for (const id of [...inserted, ...[...inserted].reverse()]) {
      const before = new Map([...resident].map((owner) => [owner, levels.orderLevelOf(owner)]));
      if (resident.delete(id)) levels.delete(id);
      else {
        resident.add(id);
        levels.set(id, undefined);
      }
      const changed = update();
      const ordered = [...resident].sort((a, b) => Number(a) - Number(b));
      expect(ordered.map((owner) => levels.levelOf(owner))).toEqual(ordered.map((_, i) => i));
      for (let i = 1; i < ordered.length; i++) {
        expect(levels.orderLevelOf(ordered[i])).toBeGreaterThan(levels.orderLevelOf(ordered[i - 1]));
      }
      const owners = new Set([...before.keys(), ...resident]);
      const delta = [...owners].filter((owner) => before.get(owner) !== levels.orderLevelOf(owner));
      expect(changed).toBe(delta.length > 0);
      if (changed) expect(new Set(levels.changedLevelIds)).toEqual(new Set(delta));
    }
  });

  it("limits a dense fallback to the changed band and reports every dropped transitive level", () => {
    const count = 512;
    const elements: Record<string, TPlaced> = {};
    for (let i = 0; i < count; i++)
      elements[`edge${i}`] = {
        x: 0,
        y: 0,
        zIndex: 100,
        order: i,
        bounds: i ? box(9.5, 0, 19.5, 10) : box(0, 0, 10, 10),
      };
    elements.block = placed(0, 0, 200, count);
    elements.label = placed(0, 0, 200, count + 1);
    const { depth, levels } = scene(elements);
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        (id) => elements[id],
        (id) => elements[id].zIndex
      );
    for (const id of Object.keys(elements)) levels.set(id, undefined);
    update();
    const compute = jest.spyOn(OverlapGrid.prototype, "compute");
    try {
      elements.edge0.bounds = box(1, 1, 9, 9);
      levels.moved("edge0");
      expect(update()).toBe(true);
      expect(compute.mock.calls.map((call) => call[1])).toEqual([count]);
      expect(Array.from({ length: count }, (_, i) => levels.levelOf(`edge${i}`))).toEqual(
        Array.from({ length: count }, (_, i) => Math.max(0, i - 1))
      );
      expect([levels.levelOf("block"), levels.levelOf("label")]).toEqual([count, count + 1]);
      expect(levels.changedLevelIds).toEqual(Array.from({ length: count - 1 }, (_, i) => `edge${i + 1}`));
    } finally {
      compute.mockRestore();
    }
  });

  it("reports exact changed levels across membership, reorder and mode changes", () => {
    const elements: Record<string, TPlaced> = {
      a: placed(0, 0, 100, 0),
      b: placed(50, 0, 100, 1),
      c: placed(120, 0, 100, 2),
    };
    const { depth, levels } = scene(elements);
    const keyOf = (id: string) => depth.keyOf(id);
    const elementOf = (id: string) => elements[id];
    const bandOf = (id: string) => elements[id].zIndex;
    for (const id of Object.keys(elements)) levels.set(id, undefined);
    levels.update(keyOf, elementOf, bandOf);
    expect(["a", "b", "c"].map((id) => levels.levelOf(id))).toEqual([0, 1, 2]);
    elements.a.x = 500;
    levels.moved("a");
    levels.update(keyOf, elementOf, bandOf);
    expect(["a", "b", "c"].map((id) => levels.levelOf(id))).toEqual([0, 0, 1]);
    expect(levels.changedLevelIds).toEqual(["b", "c"]);
    levels.delete("b");
    levels.update(keyOf, elementOf, bandOf);
    expect(levels.changedLevelIds).toEqual(["c"]);
    elements.a.zIndex = 200;
    depth.set("a", 200, 0);
    levels.reordered("a");
    levels.update(keyOf, elementOf, bandOf);
    expect([levels.levelOf("c"), levels.levelOf("a")]).toEqual([0, 1]);
    expect(levels.changedLevelIds).toEqual(["a"]);
    levels.update(keyOf, elementOf);
    expect([levels.levelOf("c"), levels.levelOf("a")]).toEqual([0, 0]);
    expect(levels.changedLevelIds).toEqual(["a"]);
    levels.clear();
    levels.update(keyOf, elementOf, bandOf);
    expect(levels.count).toBe(0);
  });

  it("reports a deleted last owner whose resident ranges now use the default level", () => {
    const elements = { a: placed(0, 0, 100, 0), b: placed(50, 0, 100, 1) };
    const { levels, update } = scene(elements);
    levels.set("a", undefined);
    levels.set("b", undefined);
    update();
    expect(levels.levelOf("b")).toBe(1);
    levels.delete("b");
    expect(update()).toBe(true);
    expect(levels.levelOf("b")).toBe(0);
    expect(levels.changedLevelIds).toEqual(["b"]);
  });

  it("repairs status membership and a selection raise without recomputing resident bands", () => {
    const elements: Record<string, TPlaced> = {
      a: placed(0, 0, 100, 0),
      b: placed(50, 0, 100, 1),
      c: placed(100, 0, 100, 2),
      pulse: placed(0, 0, 200, 3),
      body: placed(40, 0, 200, 4),
    };
    for (let i = 0; i < 512; i++) {
      elements[`edge${i}`] = placed(400 + i * 200, 0, 100, 5 + i);
      elements[`stage${i}`] = placed(400 + i * 200, 0, 200, 5 + i);
    }
    const { depth, levels } = scene(elements);
    const ids = Object.keys(elements);
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        (id) => elements[id],
        (id) => elements[id].zIndex
      );
    for (const id of ids) levels.set(id, undefined);
    update();

    const compute = jest.spyOn(OverlapGrid.prototype, "compute");
    try {
      levels.delete("pulse");
      expect(update()).toBe(true);
      expect(levels.levelOf("body")).toBe(515);
      expect(levels.changedLevelIds).toEqual(expect.arrayContaining(["pulse", "body"]));
      levels.set("pulse", undefined);
      update();
      expect(levels.levelOf("body")).toBe(516);

      elements.a.zIndex = 101;
      depth.set("a", 101, 0);
      levels.reordered("a");
      update();
      expect(["a", "b", "c", "body"].map((id) => levels.levelOf(id))).toEqual([514, 0, 1, 516]);
      expect([...new Set(levels.changedLevelIds)].sort()).toEqual(["a", "b", "c"]);
      expect(compute.mock.calls.map((call) => call[1])).toEqual([1]);
    } finally {
      compute.mockRestore();
    }
  });

  it("rebuilds only the edited band when a membership change exhausts the local scan budget", () => {
    const count = 512;
    const elements: Record<string, TPlaced> = { upper: placed(0, 0, 200, count) };
    for (let i = 0; i < count; i++) elements[`edge${i}`] = placed(0, 0, 100, i);
    const { depth, levels } = scene(elements);
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        (id) => elements[id],
        (id) => elements[id].zIndex
      );
    const ids = Object.keys(elements);
    for (const id of ids) levels.set(id, undefined);
    update();
    const compute = jest.spyOn(OverlapGrid.prototype, "compute");
    try {
      levels.delete("edge0");
      expect(update()).toBe(true);
      expect(compute.mock.calls.map((call) => call[1])).toEqual([count - 1]);
      expect(levels.levelOf(`edge${count - 1}`)).toBe(count - 2);
      expect(levels.levelOf("upper")).toBe(count - 1);
      expect([...(levels.changedLevelIds ?? [])].sort()).toEqual(
        ids.filter((id) => id !== "edge0" && id !== "upper").sort()
      );

      levels.set("edge0", undefined);
      expect(update()).toBe(true);
      expect(levels.levelOf("edge0")).toBe(0);
      expect(levels.levelOf(`edge${count - 1}`)).toBe(count - 1);
      expect(levels.levelOf("upper")).toBe(count);
      expect([...(levels.changedLevelIds ?? [])].sort()).toEqual(ids.filter((id) => id !== "upper").sort());
    } finally {
      compute.mockRestore();
    }
  });

  it("matches fresh grids under repeated mixed additions, removals, moves and painter changes", () => {
    const random = seeded(73);
    const elements: Record<string, TPlaced> = {};
    const resident = new Set<string>();
    for (let n = 0; n < 90; n++) {
      const id = `owner${n}`;
      elements[id] = placed(random() * 900, random() * 500, 100 * Math.floor(n / 30), n);
      if (n % 5 !== 0) resident.add(id);
    }
    const { depth, levels } = scene(elements);
    const keyOf = (id: string) => depth.keyOf(id);
    const elementOf = (id: string) => elements[id];
    const bandOf = (id: string) => elements[id].zIndex;
    const ids = Object.keys(elements);
    const sources = [new InstanceRanges(1), new InstanceRanges(1)].map((instances) => ({ instances }));
    // The ranges stay resident while changes of state add/remove their owners from the overlap index.
    for (const [i, id] of ids.entries()) {
      sources[i % 2].instances.setSteps(id, [{ step: i % 5, instances: new Float32Array([i]) }]);
    }
    for (const { instances } of sources) instances.retainLayout();
    const cache: TTranslucentOrderCache = {};
    for (const id of resident) levels.set(id, undefined);
    levels.update(keyOf, elementOf, bandOf);
    for (let round = 0; round < 120; round++) {
      const oldIds = new Set(resident);
      const before = ids.map((id) => levels.orderLevelOf(id));
      for (let edit = 0; edit < 3; edit++) {
        const id = ids[Math.floor(random() * ids.length)];
        const element = elements[id];
        if (edit === 0) {
          if (resident.delete(id)) levels.delete(id);
          else {
            resident.add(id);
            levels.set(id, undefined);
          }
        } else if (edit === 1) {
          element.zIndex = 100 * Math.floor(random() * 4);
          element.order = round;
          depth.set(id, element.zIndex, element.order);
          levels.reordered(id);
        } else {
          element.x = random() * 1400;
          element.y = random() * 950;
          levels.moved(id);
        }
      }

      const fresh = new TranslucentLevels();
      for (const id of resident) fresh.set(id, undefined);
      fresh.update(keyOf, elementOf, bandOf);
      const changed = levels.update(keyOf, elementOf, bandOf);
      const wanted = ids.map((id) => fresh.levelOf(id));
      expect(ids.map((id) => levels.levelOf(id))).toEqual(wanted);
      expect(levels.count).toBe(fresh.count);
      const orderKeys = ids.map((id) => levels.orderLevelOf(id));
      cache.levelRevision = levels.revision;
      cache.changedLevelIds = levels.changedLevelIds;
      const actual = orderTranslucentChunks(sources, (id) => levels.orderLevelOf(id), keyOf, 5, false, cache);
      expect(actual.flatMap((part) => part.runs.slice(part.first, part.end))).toEqual(
        orderTranslucent(sources, (id) => fresh.levelOf(id), keyOf, 5, false)
      );
      const delta = ids.filter(
        (id, index) => before[index] !== orderKeys[index] || (!oldIds.has(id) && resident.has(id))
      );
      expect(changed).toBe(delta.length > 0);
      if (changed) expect([...(levels.changedLevelIds ?? [])].sort()).toEqual(delta.sort());
    }
  });

  it("matches independent band computations and exact deltas while multiple bands move", () => {
    const random = seeded(31);
    const elements: Record<string, TPlaced> = {};
    for (let i = 0; i < 54; i++) elements[`n${i}`] = placed(random() * 600, random() * 300, Math.floor(i / 18), i);
    const ids = Object.keys(elements);
    const { depth, levels } = scene(elements);
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        (id) => elements[id],
        (id) => elements[id].zIndex
      );
    const expected = () => {
      const values: number[] = [];
      for (let first = 0; first < ids.length; first += 18) {
        const boxes = ids.slice(first, first + 18).map((id) => {
          const { x, y, bounds } = elements[id];
          return box(x + bounds.minX, y + bounds.minY, x + bounds.maxX, y + bounds.maxY);
        });
        values.push(...bruteForce(boxes).map((level) => first + level));
      }
      return values;
    };
    for (const id of ids) levels.set(id, undefined);
    update();
    expect(ids.map((id) => levels.levelOf(id))).toEqual(expected());
    for (let round = 0; round < 40; round++) {
      const before = ids.map((id) => levels.levelOf(id));
      for (let band = 0; band < 3; band++) {
        const id = ids[band * 18 + Math.floor(random() * 18)];
        elements[id].x = random() * 800;
        elements[id].y = random() * 400;
        levels.moved(id);
      }
      const changed = update();
      const after = ids.map((id) => levels.levelOf(id));
      const wanted = expected();
      expect(after).toEqual(wanted);
      const delta = ids.filter((_id, index) => before[index] !== wanted[index]);
      expect(changed).toBe(delta.length > 0);
      if (changed) expect([...(levels.changedLevelIds ?? [])].sort()).toEqual(delta.sort());
    }
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
    // Raise T0 above T1: only the affected neighbors are re-leveled.
    depth.set("T0", 200, 2001);
    flush();
    expect(levels.pending).toBe(true);
    expect(update()).toBe(true);
    expect(rebuild).not.toHaveBeenCalled();
    expect([levels.levelOf("T1"), levels.levelOf("T0")]).toEqual([0, 1]);
  });
});
