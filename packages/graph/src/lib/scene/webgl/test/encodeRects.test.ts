import type { TScenePrimitive } from "../../types";
import { InstanceRanges } from "../InstanceRanges";
import { InstanceList, MAX_SUB, RECT_FLOATS, encodeRects } from "../encodeRects";
import { USE_BASE_ALPHA } from "../tables";

const slotOf = (part: string | undefined): number => (part === "border" ? 3 : Number(part !== undefined) * 2);

describe("encodeRects", () => {
  it("writes the level mask of a primitive", () => {
    const rect: TScenePrimitive = {
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: "#f00",
      levelMask: 2,
    };
    expect(encodeRects([rect], 0, slotOf).opaque[27]).toBe(2);
  });

  it("encodes a rect with a camera-aware border", () => {
    const rect: TScenePrimitive = {
      kind: "rect",
      x: 1,
      y: 2,
      width: 30,
      height: 20,
      radius: 4,
      fill: "#ff0000",
      border: { color: "#000", width: { px: 3, minWorld: 3, maxWorld: 10 }, align: "inside" },
      part: "border",
    };
    const { opaque, translucent } = encodeRects([rect], 5, slotOf);
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(RECT_FLOATS);
    expect(Array.from(opaque)).toEqual([
      5, 0, 0, 3, 1, 2, 30, 20, 4, 4, 4, 4, 1, 0, 0, 1, 0, 0, 0, 1, 1, 3, 3, 10, 0, 0, 1e9, 7,
    ]);
  });

  it("puts a translucent fill into translucent", () => {
    const { opaque, translucent } = encodeRects(
      [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "rgba(0,0,0,0.5)" }],
      0,
      slotOf
    );
    expect(opaque).toHaveLength(0);
    expect(translucent).toHaveLength(RECT_FLOATS);
  });

  it("encodes an unset fill and an unset border colour as the base paint, in the opaque pass", () => {
    const { opaque, translucent } = encodeRects(
      [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, border: { width: 2 }, part: "body" }],
      0,
      slotOf
    );
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(RECT_FLOATS);
    expect(Array.from(opaque.slice(12, 16))).toEqual([0, 0, 0, USE_BASE_ALPHA]);
    expect(Array.from(opaque.slice(16, 20))).toEqual([0, 0, 0, USE_BASE_ALPHA]);
  });

  it("encodes a rect without a border as no border paint", () => {
    const { opaque } = encodeRects([{ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#fff" }], 0, slotOf);
    expect(Array.from(opaque.slice(16, 20))).toEqual([0, 0, 0, 0]);
  });

  it("encodes a border whose width is unset as no border, in the pass of its fill", () => {
    const { opaque, translucent } = encodeRects(
      [
        {
          kind: "rect",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          fill: "#fff",
          border: { color: "rgba(255,0,0,0.5)", align: "inside" },
        },
      ],
      0,
      slotOf
    );
    expect(translucent).toHaveLength(0);
    expect(Array.from(opaque.slice(16, 24))).toEqual([0, 0, 0, 0, 0, 0, 0, 1e9]);
    expect(opaque[24]).toBe(1);
  });

  it("puts a rect with a translucent border and an unset fill into translucent", () => {
    const { opaque, translucent } = encodeRects(
      [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, border: { color: "rgba(255,0,0,0.5)", width: 2 } }],
      0,
      slotOf
    );
    expect(opaque).toHaveLength(0);
    expect(Array.from(translucent.slice(12, 16))).toEqual([0, 0, 0, USE_BASE_ALPHA]);
    expect(Array.from(translucent.slice(16, 20))).toEqual([1, 0, 0, 0.5]);
  });

  it("encodes a circle as a rect with equal radii", () => {
    const { opaque } = encodeRects([{ kind: "circle", cx: 10, cy: 10, r: 4, fill: "#fff" }], 0, slotOf);
    expect(Array.from(opaque.slice(4, 12))).toEqual([6, 6, 8, 8, 4, 4, 4, 4]);
  });

  it("uses the sub index of the primitive in the element and the fill slot of a part", () => {
    const { opaque } = encodeRects(
      [
        { kind: "text", text: "a", family: "x", size: 1, lineHeight: 1, color: "#000", x: 0, y: 0, width: 1 },
        { kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#fff", part: "body", minScale: 0.5 },
      ],
      0,
      slotOf
    );
    expect(Array.from(opaque.slice(0, 4))).toEqual([0, 1, 2, 0]);
    expect(Array.from(opaque.slice(24, 28))).toEqual([1, 0.5, 1e9, 7]);
  });

  it("offsets the depth sub-order by the sub base and checks the budget", () => {
    const rect: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#f00" };
    expect(encodeRects([rect], 0, slotOf, 5).opaque[1]).toBe(5);
    expect(() => encodeRects([rect, rect], 0, slotOf, 31, 31)).toThrow(RangeError);
  });

  it("encodes past 32 primitives and throws only past the largest sub the depth keys leave room for", () => {
    const primitives = Array.from(
      { length: 100 },
      (): TScenePrimitive => ({ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#fff" })
    );
    const { opaque } = encodeRects(primitives, 0, slotOf);
    expect(opaque[99 * RECT_FLOATS + 1]).toBe(99);
    expect(encodeRects(primitives, 0, slotOf, 0, 99).opaque).toHaveLength(100 * RECT_FLOATS);
    expect(() => encodeRects(primitives, 0, slotOf, 0, 98)).toThrow(RangeError);
    expect(MAX_SUB).toBe(2 ** 23 - 1);
  });

  it("returns its opaque instances as a view of the encoder's list until the next encode, the translucent as a copy", () => {
    const first = encodeRects([fill("#f00"), fill("#0f0"), fill("rgba(0, 0, 255, 0.5)")], 1, slotOf);
    expect(first.opaque).toHaveLength(2 * RECT_FLOATS);
    expect(first.opaque[0]).toBe(1);
    const translucent = Array.from(first.translucent);
    const second = encodeRects([fill("#fff"), fill("rgba(255, 0, 0, 0.5)")], 2, slotOf);
    expect(second.opaque).toHaveLength(RECT_FLOATS);
    expect(second.opaque[0]).toBe(2);
    // Read in place, not copied: the next encode, which reuses the encoder's list, wrote over the first one's view.
    expect(first.opaque[0]).toBe(2);
    // The translucent instances are a copy of their own (the backend keeps them): unchanged.
    expect(Array.from(first.translucent)).toEqual(translucent);
    expect(first.translucent[0]).toBe(1);
  });

  it("leaves InstanceRanges a copy of each opaque view: later encodes do not change what the ranges hold", () => {
    const ranges = new InstanceRanges(RECT_FLOATS);
    /** What the ranges hold per element. */
    const held = (): Record<string, number[]> => {
      const out: Record<string, number[]> = {};
      const { data } = ranges;
      ranges.forEachRange((id, offset, count) => {
        out[id] = Array.from(data.subarray(offset * RECT_FLOATS, (offset + count) * RECT_FLOATS));
      });
      return out;
    };
    const a = encodeRects([fill("#f00"), fill("#0f0")], 1, slotOf);
    const aFloats = Array.from(a.opaque);
    ranges.set("a", a.opaque);
    const b = encodeRects([fill("#00f")], 2, slotOf);
    const bFloats = Array.from(b.opaque);
    ranges.set("b", b.opaque);
    // Another encode with the same list, wider than both: it writes over every float their views showed.
    encodeRects([fill("#fff"), fill("#fff"), fill("#fff")], 3, slotOf);
    expect(held()).toEqual({ a: aFloats, b: bFloats });
    // A rewrite in place (the same count) copies too.
    const again = encodeRects([fill("#ff0"), fill("#0ff")], 1, slotOf);
    const againFloats = Array.from(again.opaque);
    expect(againFloats).not.toEqual(aFloats);
    ranges.set("a", again.opaque);
    encodeRects([fill("#fff"), fill("#fff")], 4, slotOf);
    expect(held()).toEqual({ a: againFloats, b: bFloats });
  });
});

function fill(color: string): TScenePrimitive {
  return { kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: color };
}

describe("InstanceList", () => {
  it("hands out zeroed instances after a reset, grows past its first room and copies out", () => {
    const list = new InstanceList(4);
    for (let i = 0; i < 20; i++) list.next().fill(i + 1);
    expect(list.toArray()).toHaveLength(80);
    expect(list.toArray()[79]).toBe(20);
    list.reset();
    expect(list.toArray()).toHaveLength(0);
    const instance = list.next();
    expect(Array.from(instance)).toEqual([0, 0, 0, 0]);
    instance[1] = 7;
    const out = list.toArray();
    instance[1] = 8;
    expect(Array.from(out)).toEqual([0, 7, 0, 0]);
  });

  it("pushes the instances of a one-float list past its first room, and refuses wider lists", () => {
    const list = new InstanceList(1);
    for (let i = 0; i < 40; i++) list.push(i);
    expect(Array.from(list.toArray())).toEqual(Array.from({ length: 40 }, (_, i) => i));
    list.reset();
    list.push(5);
    list.next()[0] = 6;
    expect(Array.from(list.toArray())).toEqual([5, 6]);
    expect(() => new InstanceList(2).push(1)).toThrow();
  });

  it("shows its instances in place until the next reset or append, and a view is no array to keep", () => {
    const list = new InstanceList(2);
    list.next().set([1, 2]);
    const view = list.view();
    expect(Array.from(view)).toEqual([1, 2]);
    list.reset();
    list.next().set([3, 4]);
    // The reused list wrote over it: a view is read before the list's next reset or append, or not at all.
    expect(Array.from(view)).toEqual([3, 4]);
    expect(Array.from(list.view())).toEqual([3, 4]);
    list.reset();
    expect(list.view()).toHaveLength(0);
    // @ts-expect-error A view is no Float32Array: code that keeps arrays cannot keep one.
    const kept: Float32Array = list.view();
    expect(kept).toHaveLength(0);
  });
});
