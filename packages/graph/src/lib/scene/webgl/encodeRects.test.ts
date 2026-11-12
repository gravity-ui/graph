import type { TScenePrimitive } from "../types";

import { RECT_FLOATS, encodeRects } from "./encodeRects";
import { USE_BASE_ALPHA } from "./tables";

const slotOf = (part: string | undefined): number => (part === "border" ? 3 : Number(part !== undefined) * 2);

describe("encodeRects", () => {
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
      5, 0, 0, 3, 1, 2, 30, 20, 4, 4, 4, 4, 1, 0, 0, 1, 0, 0, 0, 1, 1, 3, 3, 10, 0, 0, 1e9, 0,
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
    expect(Array.from(opaque.slice(24, 28))).toEqual([1, 0.5, 1e9, 0]);
  });

  it("throws past 31 primitives", () => {
    const primitives = Array.from(
      { length: 33 },
      (): TScenePrimitive => ({ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#fff" })
    );
    expect(() => encodeRects(primitives, 0, slotOf)).toThrow(RangeError);
  });
});
