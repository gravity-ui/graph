import type { TTileRect } from "../../../../culling/TileIndex";
import { defineSceneEffect } from "../../../effects/defineSceneEffect";
import { bakeElementStyle } from "../../../styles/style";
import type { TScenePrimitive } from "../../../types";
import { CachedGeometryBounds, geometryBounds, largestSize, paintedGeometryBounds } from "../levelBounds";

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
  it("includes closed joins in the overlap bounds and the device-dependent AA fringe", () => {
    const path: TScenePrimitive = {
      kind: "path",
      closed: true,
      segments: new Float32Array([0, 0, 3, 0, 6, 0, 9, 0, 9, 0, 6, 0, 3, 0, 0, 0]),
      stroke: { width: 2 },
    };
    const bounds = new CachedGeometryBounds([path]);
    expect(geometryBounds([path])).toEqual(box(-10, -10, 19, 10));
    expect(bounds.at(() => 1)).toEqual(geometryBounds([path]));
    expect(bounds.at(() => 1, 2)).toEqual(box(-15, -15, 24, 15));
  });

  it("keeps cached hulls identical to geometry bounds as camera-aware widths and halos change", () => {
    const glow = defineSceneEffect({
      kind: "path",
      extraWidth: 6,
      fragment: "vec4 effect(PathFragment f, vec4 c) { return c; }",
    });
    const primitives: TScenePrimitive[] = [
      {
        kind: "path",
        segments: new Float32Array([0, 0, 10, 20, 20, -10, 30, 10]),
        stroke: { width: { px: 2, minWorld: 3, maxWorld: 30 } },
        effect: glow.use([]),
      },
      {
        kind: "rect",
        x: 20,
        y: 50,
        width: 30,
        height: 20,
        border: { width: { world: 2, minPx: 1 }, align: "outside" },
      },
      { kind: "circle", cx: 80, cy: 30, r: 12, border: { width: { px: 3 }, align: "center" } },
      { kind: "polygon", points: new Float32Array([100, 0, 120, 10, 110, 20]), stroke: { width: 3 } },
    ];
    const cache = new CachedGeometryBounds(primitives);
    for (const scale of [0.001, 0.01, 0.1, 1, 10])
      expect(cache.at(() => scale)).toEqual(geometryBounds(primitives, scale));
    expect(cache.at((primitive) => (primitive.kind === "circle" ? 1 : undefined))).toEqual(
      geometryBounds([primitives[2]], 1)
    );
  });

  it("bounds the WebGL hairline and the first active halo at their own scales", () => {
    const glow = defineSceneEffect({
      kind: "path",
      extraWidth: 6,
      fragment: "vec4 effect(PathFragment f, vec4 c) { return c; }",
    });
    const path: TScenePrimitive = {
      kind: "path",
      segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
      stroke: { width: { px: 2, maxWorld: 4 } },
      effect: glow.use([], { minScale: 0.5 }),
    };
    const cache = new CachedGeometryBounds([path]);
    expect(cache.pathsOnly).toBe(true);
    // At 0.05 the hairline and AA reach 15 world units. At 0.5 the stroke, AA and halo also reach 15.
    expect(cache.at(() => 0.05, 2)).toEqual(box(-15, -15, 45, 15));
    expect(cache.at(() => 0.05, 1)).toEqual(box(-30, -30, 60, 30));
    expect(cache.at(() => 1, 2)).toEqual(box(-7.5, -7.5, 37.5, 7.5));
    expect(cache.at(() => undefined, 2)).toBeUndefined();
  });

  it("includes the tagged glow's reach in the WebGL overlap geometry", () => {
    const glow = defineSceneEffect({
      kind: "path",
      extraWidth: 6,
      fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
    });
    const path: TScenePrimitive = {
      kind: "path",
      part: "line",
      minScale: 0.5,
      segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
      stroke: { color: "#000", width: 2 },
    };
    const styled = bakeElementStyle([path], { parts: { line: { effect: glow.use([]) } } });
    expect(geometryBounds(styled)).toEqual(box(-14, -14, 44, 14));
    expect(paintedGeometryBounds(styled)).toEqual(paintedGeometryBounds([path]));
  });

  it.each([{ minScale: 0.1 }, { minScale: 0.1 - 1e-12, maxScale: 0.1 + 1e-12 }])(
    "pads a cached halo from the earliest scale where its effect can run (%j)",
    (range) => {
      const glow = defineSceneEffect({
        kind: "path",
        extraWidth: 6,
        fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
      });
      const path: TScenePrimitive = {
        kind: "path",
        segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
        stroke: { width: { px: 2, maxWorld: 30 } },
        effect: glow.use([], range),
      };
      const cache = new CachedGeometryBounds([path]);
      // Stroke reach starts at the interval's floor, even when the halo first appears at a later scale.
      // The narrow range still activates in JS when both endpoints round to the same shader float.
      const pad = 30 + 6 / Math.fround(0.1);
      expect(cache.at(() => 0.025)).toEqual(box(-pad, -pad, 30 + pad, pad));
      const shownPad = 2 / Math.fround(0.1) + 6 / Math.fround(0.1);
      expect(cache.at(() => Math.fround(0.1))).toEqual(box(-shownPad, -shownPad, 30 + shownPad, shownPad));
    }
  );

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

describe("paintedGeometryBounds", () => {
  const circle = (align: "inside" | "center" | "outside"): TScenePrimitive => ({
    kind: "circle",
    cx: 0,
    cy: 0,
    r: 9,
    border: { width: 8, align },
  });
  const rect = (width: number): TScenePrimitive => ({
    kind: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 10,
    border: { width, align: "inside" },
  });

  it("bounds a circle border by the reach of its alignment", () => {
    expect(paintedGeometryBounds([circle("inside")])).toEqual(box(-9, -9, 9, 9));
    expect(paintedGeometryBounds([circle("center")])).toEqual(box(-13, -13, 13, 13));
    expect(paintedGeometryBounds([circle("outside")])).toEqual(box(-17, -17, 17, 17));
  });

  it("keeps an inside rect border within the rect until it is wider than the rect's shorter side", () => {
    expect(paintedGeometryBounds([rect(10)])).toEqual(box(0, 0, 100, 10));
    expect(paintedGeometryBounds([rect(16)])).toEqual(box(-6, -6, 106, 16));
    expect(geometryBounds([rect(16)])).toEqual(box(0, 0, 100, 10));
  });

  it("pads stroked paths and polygons by the reach of a miter join at Canvas's default limit, 10: 5 x the width", () => {
    const path: TScenePrimitive = {
      kind: "path",
      segments: new Float32Array([0, 100, 10, 100, 20, 120, 30, 100]),
      stroke: { width: 6 },
    };
    const polygon: TScenePrimitive = {
      kind: "polygon",
      points: new Float32Array([200, 0, 210, 10, 200, 20]),
      stroke: { width: 2 },
    };
    expect(geometryBounds([path])).toEqual(box(-6, 94, 36, 126));
    expect(paintedGeometryBounds([path])).toEqual(box(-30, 70, 60, 150));
    expect(geometryBounds([polygon])).toEqual(box(198, -2, 212, 22));
    expect(paintedGeometryBounds([polygon])).toEqual(box(190, -10, 220, 30));
    // The miter limit is a ratio to half the width: a px width takes its largest extent first.
    const wide: TScenePrimitive = { ...polygon, stroke: { width: { px: 1, maxWorld: 4 } } };
    expect(paintedGeometryBounds([wide])).toEqual(box(180, -20, 230, 40));
  });

  it("equals geometryBounds for the other shapes and alignments, and for an unstroked polygon", () => {
    const primitives: TScenePrimitive[] = [
      { kind: "rect", x: 0, y: 0, width: 100, height: 50, border: { width: 4, align: "outside" } },
      { kind: "rect", x: 0, y: 0, width: 100, height: 50, border: { width: 6 } },
      { kind: "circle", cx: 10, cy: 10, r: 5, fill: "#000" },
      { kind: "polygon", points: new Float32Array([200, 0, 210, 10, 200, 20]), fill: "#000" },
    ];
    expect(paintedGeometryBounds(primitives)).toEqual(geometryBounds(primitives));
  });
});
