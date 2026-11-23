import { bakeElementStyle } from "../../../styles/style";
import type { TScenePrimitive } from "../../../types";
import { InstanceRanges } from "../../instances/InstanceRanges";
import { OverlapGrid } from "../OverlapGrid";
import { TranslucentLevels } from "../TranslucentLevels";
import type { TLevelElement } from "../TranslucentLevels";
import { SceneDepth } from "../depth";
import { geometryBounds } from "../levelBounds";
import { orderTranslucent } from "../translucentBuckets";
import { orderTranslucentChunks } from "../translucentOrder";
import type { TTranslucentOrderCache } from "../translucentOrder";

import { box, bruteForce, seeded } from "./utils/boxes";

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

  it("repairs a dense band from its resident boxes and reports every changed level in both directions", () => {
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
    const read = jest.fn((id: string) => elements[id]);
    const update = () =>
      levels.update(
        (id) => depth.keyOf(id),
        read,
        (id) => elements[id].zIndex
      );
    for (const id of Object.keys(elements)) levels.set(id, undefined);
    update();
    const original = elements.edge0.bounds;
    const edges = Array.from({ length: count }, (_, i) => `edge${i}`);
    for (const bounds of [box(1, 1, 9, 9), box(-Infinity, NaN, Infinity, 10), original]) {
      const before = edges.map((id) => levels.levelOf(id));
      read.mockClear();
      elements.edge0.bounds = bounds;
      levels.moved("edge0");
      const changed = update();
      expect(read.mock.calls).toEqual([["edge0"]]);
      const expected = bruteForce(edges.map((id) => elements[id].bounds));
      expect(edges.map((id) => levels.levelOf(id))).toEqual(expected);
      const delta = edges.filter((_, i) => expected[i] !== before[i]);
      expect(changed).toBe(delta.length > 0);
      if (changed) expect(levels.changedLevelIds).toEqual(delta);
      expect([levels.levelOf("block"), levels.levelOf("label")]).toEqual([count, count + 1]);
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
