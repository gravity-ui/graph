import { INSTANCE_FLOATS } from "../../../../../components/canvas/connections/webgl/encode";
import { InstanceRanges } from "../../instances/InstanceRanges";
import { appendPathPlanInputs, pathPlanResizes, visiblePathResize } from "../pathPlanInputs";
import type { TPathPlanInput } from "../pathPlanInputs";
import { PATH_ELEMENT_FLOATS } from "../pathRecords";

function fixture(opaque = true) {
  const batch = {
    ranges: new InstanceRanges(INSTANCE_FLOATS),
    companion: { ranges: new InstanceRanges(PATH_ELEMENT_FLOATS) },
  };
  function write(id: string, count: number, x: number, sub = 1, width = 1, mode = 0, minimum = 0) {
    const paths = new Float32Array(count * INSTANCE_FLOATS);
    const elements = new Float32Array(count * PATH_ELEMENT_FLOATS);
    for (let i = 0; i < count; i++) {
      paths[i * INSTANCE_FLOATS] = x;
      paths[i * INSTANCE_FLOATS + 12] = width;
      elements.set([7, sub, 1, minimum, 0, 1000, mode * 8 + 7, -i], i * PATH_ELEMENT_FLOATS);
    }
    batch.ranges.set(id, paths);
    batch.companion.ranges.set(id, elements);
  }
  function read() {
    const inputs: TPathPlanInput<typeof batch>[] = [];
    appendPathPlanInputs(inputs, batch, "edge", opaque);
    return inputs;
  }
  return { batch, read, write };
}

describe("encoded inputs to a mixed path plan", () => {
  it("keeps painter order for new control points but checks primitive order and subpixel widths", () => {
    const { read, write } = fixture();
    write("edge", 6, 0);
    const before = read();
    write("edge", 6, 30);
    expect(pathPlanResizes(before, read())).toEqual([]);
    write("edge", 6, 30, 2);
    expect(pathPlanResizes(before, read())).toBeUndefined();
    write("edge", 6, 30, 1, 2);
    expect(pathPlanResizes(before, read())).toBeUndefined();
    write("edge", 6, 30, 1, 1, 1, 0.75);
    expect(pathPlanResizes(before, read())).toBeUndefined();
  });

  it("certifies a dense tail resize and rejects an interior compaction or different sub", () => {
    const { batch, read, write } = fixture();
    write("neighbor", 3, 0);
    write("edge", 14, 10);
    const before = read();
    write("edge", 17, 20);
    expect(pathPlanResizes(before, read())).toEqual([
      expect.objectContaining({ batch, first: 3, before: 14, after: 17 }),
    ]);
    write("other", 6, 5);
    const interior = read();
    write("edge", 12, 30);
    expect(pathPlanResizes(interior, read())).toBeUndefined();
    const moved = read();
    write("edge", 7, 20, 5);
    expect(pathPlanResizes(moved, read())).toBeUndefined();
  });

  it("rebuilds when two primitive runs trade pieces without changing the batch layout", () => {
    const { batch, read, write } = fixture();
    batch.ranges.retainLayout();
    batch.companion.ranges.retainLayout();
    write("edge", 5, 0);
    batch.companion.ranges.edit("edge", (data) => {
      for (const i of [3, 4]) data[i * PATH_ELEMENT_FLOATS + 1] = 2;
    });
    const before = read();
    batch.companion.ranges.edit("edge", (data) => {
      data[2 * PATH_ELEMENT_FLOATS + 1] = 2;
    });
    const after = read();
    expect(after[0].companionLayout).toBe(before[0].companionLayout);
    expect(pathPlanResizes(before, after)).toBeUndefined();
  });

  it("describes a new curve bin and its removal while the original bin relocates", () => {
    const curves = fixture();
    const coarse = fixture();
    for (const { batch } of [curves, coarse]) {
      batch.ranges.retainLayout();
      batch.companion.ranges.retainLayout();
    }
    curves.write("edge", 4, 0);
    curves.write("neighbor", 10, 0);
    const before = curves.read();
    curves.write("edge", 10, 0);
    coarse.write("edge", 16, 0);
    const added = coarse.read()[0];
    const after = [added, ...curves.read()];
    const entering = pathPlanResizes(before, after, "edge");
    expect(entering).toEqual([
      expect.objectContaining({ batch: curves.batch, first: 0, before: 4, after: 10, nextFirst: 14 }),
      expect.objectContaining({
        batch: coarse.batch,
        before: 0,
        after: 16,
        layoutBefore: undefined,
        layoutAfter: added.layout,
        membership: { id: "edge", sibling: before[0] },
      }),
    ]);
    expect(pathPlanResizes(before, [{ ...added, width: 4 }, after[1]], "edge")).toBeUndefined();

    coarse.write("edge", 0, 0);
    const restored = curves.read();
    expect(pathPlanResizes(after, restored, "edge")).toEqual([
      expect.objectContaining({
        batch: coarse.batch,
        before: 16,
        after: 0,
        layoutBefore: added.layout,
        layoutAfter: coarse.batch.ranges.layoutRevision,
        membership: { id: "edge", sibling: restored[0] },
      }),
    ]);
  });

  it("keeps translucent widths outside the opaque subpixel check and rejects a changed owner", () => {
    const { batch, read, write } = fixture(false);
    write("edge", 3, 0);
    const before = read();
    write("edge", 3, 2, 1, 8, 1, 5);
    expect(pathPlanResizes(before, read())).toEqual([]);
    batch.companion.ranges.edit("edge", (data) => {
      data[0] = 11;
    });
    expect(pathPlanResizes(before, read())).toBeUndefined();
  });
});

describe("visible pieces of a relocated path", () => {
  const batch = {};
  const edit = {
    batch,
    first: 4,
    before: 4,
    nextFirst: 18,
    after: 5,
    layoutBefore: 1,
    layoutAfter: 2,
    companionBefore: 1,
    companionAfter: 2,
  };
  const draw = (first: number, count: number, curveDetail = 16) => ({ batch, first, count, curveDetail });
  it("keeps a clipped replacement and verifies both unaffected sides of the hole", () => {
    expect(visiblePathResize([draw(0, 7), draw(8, 10)], [draw(0, 4), draw(8, 13)], edit, 16)).toEqual({
      first: 4,
      before: 3,
      nextFirst: 18,
      after: 3,
      chords: 16,
    });
    expect(visiblePathResize([draw(0, 7), draw(8, 10)], [draw(0, 4), draw(9, 12)], edit, 16)).toBeUndefined();
    expect(
      visiblePathResize([draw(0, 7), draw(8, 10)], [draw(0, 4), draw(8, 10), draw(18, 3, 8)], edit, 16)
    ).toBeUndefined();
  });
  it("takes visible pieces of entering and leaving bins and verifies neighboring draws", () => {
    const insert = { ...edit, first: 18, before: 0 };
    const previous = [draw(0, 6)];
    const current = [...previous, draw(19, 3, 8)];
    expect(visiblePathResize(previous, current, insert, 16)).toEqual({
      first: 19,
      before: 0,
      nextFirst: 19,
      after: 3,
      chords: 8,
    });
    expect(visiblePathResize(current, previous, { ...insert, before: 5, after: 0 }, 16)).toEqual({
      first: 19,
      before: 3,
      nextFirst: 19,
      after: 0,
      chords: 8,
    });
    expect(visiblePathResize(previous, [draw(0, 7), current[1]], insert, 16)).toBeUndefined();
    expect(visiblePathResize(previous, [...previous, draw(19, 1), draw(21, 2, 8)], insert, 16)).toBeUndefined();
  });

  it("distinguishes fully culled, newly visible and split owner ranges", () => {
    expect(visiblePathResize([draw(0, 2)], [draw(0, 2)], edit, 16)).toBe("hidden");
    expect(visiblePathResize([draw(0, 2)], [draw(0, 2), draw(18, 3)], edit, 16)).toBeUndefined();
    expect(visiblePathResize([draw(4, 1), draw(6, 2)], [draw(18, 5)], edit, 16)).toBeUndefined();
  });
});
