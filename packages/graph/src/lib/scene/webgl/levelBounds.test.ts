import type { TTileRect } from "../../culling/TileIndex";
import { bakeElementStyle } from "../style";
import type { TScenePrimitive } from "../types";

import { geometryBounds, largestSize } from "./levelBounds";

const box = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

describe("largestSize", () => {
  it("takes a camera-aware size at the minimum camera scale, clamped by its world bounds", () => {
    expect(largestSize(4)).toBe(4);
    expect(largestSize({ px: 3 })).toBeCloseTo(300);
    expect(largestSize({ px: 3, minWorld: 3, maxWorld: 10 })).toBe(10);
    expect(largestSize({ world: 2, minPx: 1, maxPx: 4 })).toBeCloseTo(100);
    expect(largestSize({ world: 2 })).toBe(2);
  });

  it("takes it at the primitive's minScale when that is higher: a size shown only when zoomed in is not padded for 0.01", () => {
    expect(largestSize({ px: 4 }, 0.5)).toBe(8);
    expect(largestSize({ px: 4 }, 0.001)).toBeCloseTo(400);
    expect(largestSize({ px: 4 }, Number.NaN)).toBeCloseTo(400);
    expect(largestSize({ world: 2, minPx: 1 }, 0.25)).toBe(4);
    expect(largestSize(3, 0.5)).toBe(3);
  });
});

describe("geometryBounds", () => {
  it("pads a rect by its border: outside by the width, center by half, inside by nothing", () => {
    const rect = (align: "inside" | "center" | "outside"): TScenePrimitive => ({
      kind: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      border: { width: 4, align },
    });
    expect(geometryBounds([rect("outside")])).toEqual(box(-4, -4, 104, 54));
    expect(geometryBounds([rect("center")])).toEqual(box(-2, -2, 102, 52));
    expect(geometryBounds([rect("inside")])).toEqual(box(0, 0, 100, 50));
  });

  it("joins circles, paths padded by their stroke width at its largest extent, and polygons", () => {
    const primitives: TScenePrimitive[] = [
      { kind: "circle", cx: 10, cy: 10, r: 5, fill: "#000" },
      {
        kind: "path",
        segments: new Float32Array([0, 100, 10, 100, 20, 120, 30, 100]),
        stroke: { width: { px: 1, maxWorld: 6 } },
      },
      { kind: "polygon", points: new Float32Array([200, 0, 210, 10, 200, 20]), fill: "#000" },
    ];
    expect(geometryBounds(primitives)).toEqual(box(-6, 0, 210, 126));
  });

  it("leaves text and icons to the store's bounds, and skips a path without a stroke width (it draws nothing)", () => {
    expect(
      geometryBounds([
        { kind: "text", text: "a", family: "sans-serif", size: 12, lineHeight: 14, x: 0, y: 0, width: 50 },
        { kind: "path", segments: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]), stroke: {} },
      ])
    ).toBeUndefined();
  });

  it("pads a border shown only from a camera scale at that scale", () => {
    const border = (minScale?: number): TScenePrimitive => ({
      kind: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      border: { width: { px: 4 }, align: "outside" },
      minScale,
    });
    expect(geometryBounds([border(0.5)])).toEqual(box(-8, -8, 108, 58));
    const everywhere = geometryBounds([border()]);
    expect(everywhere?.minX).toBeCloseTo(-400);
    expect(everywhere?.maxY).toBeCloseTo(450);
    const path: TScenePrimitive = {
      kind: "path",
      segments: new Float32Array([0, 0, 1, 0, 2, 0, 3, 0]),
      stroke: { width: { px: 2 } },
      minScale: 1,
    };
    expect(geometryBounds([path])).toEqual(box(-2, -2, 5, 2));
  });

  it("covers a stroke widened by a style beyond the store's bounds", () => {
    const primitives: TScenePrimitive[] = [
      { kind: "rect", x: 0, y: 0, width: 100, height: 50, border: { width: 2, align: "outside" }, part: "border" },
      { kind: "circle", cx: 100, cy: 25, r: 4, fill: "#000", part: "anchor" },
    ];
    expect(geometryBounds(primitives)).toEqual(box(-2, -2, 104, 52));
    const baked = bakeElementStyle(primitives, {
      opacity: 0.5,
      parts: { border: { width: 20 }, anchor: { scale: 5 } },
    });
    expect(geometryBounds(baked)).toEqual(box(-20, -20, 120, 70));
  });
});
