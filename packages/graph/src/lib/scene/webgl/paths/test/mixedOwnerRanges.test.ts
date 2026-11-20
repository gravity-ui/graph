import { InstanceRanges } from "../../instances/InstanceRanges";
import { updateMixedOwnerRanges } from "../mixedOwnerRanges";
import type { TMixedOwnerRange } from "../mixedOwnerRanges";

function reference(source: InstanceRanges, connection: (id: string) => boolean): TMixedOwnerRange[] {
  const slots: (boolean | undefined)[] = new Array(source.count);
  source.forEachRange((id, first, count) => slots.fill(connection(id), first, first + count));
  const ranges: TMixedOwnerRange[] = [];
  for (let first = 0; first < slots.length; ) {
    const ownerType = slots[first];
    let end = first + 1;
    while (end < slots.length && slots[end] === ownerType) end++;
    if (ownerType !== undefined) ranges.push({ first, count: end - first, connection: ownerType });
    first = end;
  }
  return ranges;
}

describe("mixed draw ownership", () => {
  it("resizes a dense homogeneous batch without visiting its owners", () => {
    const source = new InstanceRanges(1);
    for (let i = 0; i < 50; i++) source.set(String(i), [1, 1]);
    const connection = jest.fn(() => true);
    const initial = updateMixedOwnerRanges(source, 1, undefined, connection);
    const membership = source.membershipRevision;
    source.setSteps("13", [
      { step: 0, instances: [1] },
      { step: 1, instances: [1, 1, 1] },
    ]);
    expect(source.membershipRevision).toBe(membership);
    connection.mockClear();
    const scan = jest.spyOn(source, "forEachRange");
    const next = updateMixedOwnerRanges(source, 1, initial, connection);
    expect(scan).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
    expect(next.ranges).toEqual([{ first: 0, count: 102, connection: true }]);
    expect(initial.ranges[0].count).toBe(100);
    expect(updateMixedOwnerRanges(source, 1, next, connection)).toBe(next);
    source.delete("13");
    source.set("block", [1, 1, 1, 1]);
    expect(source.membershipRevision).not.toBe(membership);
    const classify = (id: string) => id !== "block";
    expect(updateMixedOwnerRanges(source, 1, next, classify).ranges).toEqual(reference(source, classify));
  });

  it("preserves holes and the old snapshot when a freed slot is reused", () => {
    const source = new InstanceRanges(1);
    source.retainLayout();
    for (const id of ["edge0", "edge1", "block0", "edge2", "block1"]) source.set(id, [1, 1, 1]);
    const connection = jest.fn((id: string) => id.startsWith("edge"));
    const initial = updateMixedOwnerRanges(source, 1, undefined, connection);
    const original = reference(source, connection);
    expect(initial.ranges).toEqual(original);
    connection.mockClear();
    const scan = jest.spyOn(source, "forEachRange");
    source.delete("edge1");
    source.set("block2", [1, 1]);
    source.delete("block2");
    source.set("edge3", [1]);
    const next = updateMixedOwnerRanges(source, 1, initial, connection);
    expect(scan).not.toHaveBeenCalled();
    expect(connection.mock.calls.flat()).toEqual(["edge3"]);
    expect(next.ranges).toEqual(reference(source, connection));
    expect(initial.ranges).toEqual(original);
    expect(updateMixedOwnerRanges(source, 1, next, connection)).toBe(next);
  });

  it("joins a reused slot to its new class on both sides without touching other owners", () => {
    const source = new InstanceRanges(1);
    source.retainLayout();
    for (const id of ["a", "b", "c", "d", "e"]) source.set(id, [1, 1]);
    const classify = jest.fn((id: string) => id !== "b" && id !== "d");
    const before = updateMixedOwnerRanges(source, 0, undefined, classify);
    source.delete("b");
    source.set("f", [1, 1]);
    classify.mockClear();
    const scan = jest.spyOn(source, "forEachRange");
    const after = updateMixedOwnerRanges(source, 0, before, classify);
    expect(scan).not.toHaveBeenCalled();
    expect(classify.mock.calls.flat()).toEqual(["f"]);
    expect(after.ranges).toEqual(reference(source, classify));
    expect(after.ranges[0]).toEqual({ first: 0, count: 6, connection: true });
    expect(after.ranges[1]).toBe(before.ranges[3]);
    expect(after.ranges[2]).toBe(before.ranges[4]);
  });

  it("keeps a new internal hole even when a homogeneous retained batch has the same owners", () => {
    const source = new InstanceRanges(1);
    source.retainLayout();
    source.set("left", [1, 1]);
    source.set("middle", [1, 1, 1]);
    source.set("right", [1, 1]);
    const blockOwned = () => false;
    const before = updateMixedOwnerRanges(source, 0, undefined, blockOwned);
    source.set("middle", [1]);
    expect(source.membershipRevision).toBe(before.membership);
    expect(updateMixedOwnerRanges(source, 0, before, blockOwned).ranges).toEqual([
      { first: 0, count: 3, connection: false },
      { first: 5, count: 2, connection: false },
    ]);
  });

  it("rechecks mixed owners and invalidates the homogeneous cache on reparenting", () => {
    for (const retained of [false, true]) {
      const source = new InstanceRanges(1);
      if (retained) source.retainLayout();
      source.set("move", [1, 1, 1]);
      source.set("child", [1]);
      let childIsConnection = false;
      const connection = (id: string) => id === "move" || childIsConnection;
      const old = updateMixedOwnerRanges(source, 0, undefined, connection);
      source.delete("move");
      for (let i = 0; i < 70; i++) source.set("move", new Float32Array(2 + (i % 2)));
      const scan = jest.spyOn(source, "forEachRange");
      const missed = updateMixedOwnerRanges(source, 0, old, connection);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(missed.ranges).toEqual(reference(source, connection));
      childIsConnection = true;
      const reparented = updateMixedOwnerRanges(source, 1, missed, connection);
      expect(reparented.ranges).toEqual(reference(source, connection));
    }
  });

  it("matches physical ownership through retained shape edits, deletions and multiple updates between frames", () => {
    const source = new InstanceRanges(1);
    source.retainLayout();
    const connection = (id: string) => Number(id) % 3 === 0;
    let previous = updateMixedOwnerRanges(source, 1, undefined, connection);
    let seed = 111;
    const random = (max: number) => (seed = (seed * 16807) % 2147483647) % max;
    for (let frame = 0; frame < 320; frame++) {
      const edits = 1 + random(9);
      for (let edit = 0; edit < edits; edit++) {
        const id = String(random(32));
        const steps = Array.from({ length: random(5) }, (_, step) => ({
          step,
          instances: new Float32Array(1 + random(5)),
        }));
        source.setSteps(id, steps);
      }
      previous = updateMixedOwnerRanges(source, 1, previous, connection);
      expect(previous.ranges).toEqual(reference(source, connection));
    }
  });
});
