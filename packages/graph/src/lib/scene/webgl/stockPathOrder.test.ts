import { orderResidentPathDraws } from "./stockPathOrder";

function elements(records: readonly (readonly [owner: number, sub: number])[]): Float32Array {
  return new Float32Array(records.flatMap(([owner, sub]) => [owner, sub, 0, 0, 0, 1, 7, 0]));
}

const table = new Float32Array([0, 0, 4, 0, 0, 0, 2, 0, 0, 0, -1, 0, 0, 0, 4, 0, 0, 0, 5, 0]);

describe("strict resident path order", () => {
  it("uses actual root depth, absolute child subs, pass ties and physical piece order", () => {
    const line = {
      tie: 0,
      elements: elements([
        [0, 4],
        [0, 4],
        [2, 0], // Hidden owner.
        [1, 2],
        [3, 6], // A child shares slot 0's depth key and has its own absolute sub.
        [4, 0], // Hidden by its part style.
      ]),
    };
    const curve = {
      tie: 1,
      elements: elements([
        [0, 4],
        [0, 4],
        [0, 4],
      ]),
    };
    const custom = { tie: 2, elements: elements([[3, 5]]) };
    const ordered = orderResidentPathDraws(
      [
        { batch: curve, first: 2, count: 1, curveDetail: 16 },
        { batch: custom, first: 0, count: 1, curveDetail: 8 },
        { batch: line, first: 0, count: 6 },
        { batch: curve, first: 0, count: 2, curveDetail: 8 },
        { batch: line, first: 6, count: 0 },
      ],
      table,
      (batch) => batch,
      (batch, first) => batch !== line || first !== 5
    );
    expect(ordered?.map(({ batch, first, count, curveDetail }) => [batch.tie, first, count, curveDetail])).toEqual([
      [0, 3, 1, undefined],
      [0, 0, 2, undefined],
      [1, 0, 2, 8],
      [1, 2, 1, 16],
      [2, 0, 1, 8],
      [0, 4, 1, undefined],
    ]);
  });

  it("rejects invalid physical bounds and missing companion data", () => {
    const batch = { tie: 0, elements: elements([[0, 0]]) };
    const order = (first: number, count: number, missing = false) =>
      orderResidentPathDraws(
        [{ batch, first, count }],
        table,
        () => (missing ? undefined : batch),
        () => true
      );
    expect(order(0, 0, true)).toEqual([]);
    expect(order(-1, 1)).toBeUndefined();
    expect(order(0.5, 1)).toBeUndefined();
    expect(order(0, -1)).toBeUndefined();
    expect(order(0, 2)).toBeUndefined();
    expect(order(0, 1, true)).toBeUndefined();
  });

  it("joins adjacent physical ranges only across consecutive owners of the same batch and detail", () => {
    const depth = new Float32Array(Array.from({ length: 8 }, (_, key) => [0, 0, key, 0]).flat());
    const stock = {
      tie: 0,
      elements: elements([
        [0, 0],
        [1, 0],
        [3, 0],
        [4, 0],
        [7, 0],
        [6, 0],
      ]),
    };
    const native = { tie: 1, elements: elements([[2, 0]]) };
    const ordered = orderResidentPathDraws(
      [
        { batch: stock, first: 0, count: 3, curveDetail: 8 },
        { batch: stock, first: 3, count: 3, curveDetail: 16 },
        { batch: native, first: 0, count: 1 },
      ],
      depth,
      (batch) => batch,
      () => true
    );
    expect(ordered?.map(({ batch, first, count, curveDetail }) => [batch.tie, first, count, curveDetail])).toEqual([
      [0, 0, 2, 8],
      [1, 0, 1, undefined],
      [0, 2, 1, 8],
      [0, 3, 1, 16],
      [0, 5, 1, 16],
      [0, 4, 1, 16],
    ]);
  });
});
