import { initGraphConstants } from "../../../../graphConfig";

import {
  PATTERN_MAX_TILE_PX,
  getGridTilePx,
  getVisibleWorldRect,
  intersectRects,
  isPatternLayer,
  resolveGridLayers,
  smoothstep,
} from "./gridLayerMath";

const FADE: [number, number] = [6, 18];

describe("smoothstep", () => {
  it("returns 0 below the window and 1 above it", () => {
    expect(smoothstep(6, 18, 0)).toBe(0);
    expect(smoothstep(6, 18, 6)).toBe(0);
    expect(smoothstep(6, 18, 18)).toBe(1);
    expect(smoothstep(6, 18, 100)).toBe(1);
  });

  it("grows monotonically inside the window", () => {
    let previous = 0;
    for (let value = 6; value <= 18; value += 0.5) {
      const current = smoothstep(6, 18, value);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
    expect(smoothstep(6, 18, 12)).toBeCloseTo(0.5);
  });

  it("falls back to a step function when the window is empty", () => {
    expect(smoothstep(10, 10, 9.99)).toBe(0);
    expect(smoothstep(10, 10, 10)).toBe(1);
    expect(smoothstep(10, 5, 10)).toBe(1);
  });
});

describe("resolveGridLayers", () => {
  it("drops invalid layers", () => {
    const layers = [
      { step: 0, dotSize: 2 },
      { step: -1, dotSize: 2 },
      { step: Number.NaN, dotSize: 2 },
      { step: Number.POSITIVE_INFINITY, dotSize: 2 },
      { step: 5 },
      { step: 1, dotSize: 0 },
      undefined,
      { step: 25, dotSize: 3 },
    ];

    expect(resolveGridLayers(layers, 16, 1, FADE).map((layer) => layer.stepWorld)).toEqual([400]);
    // With the window [-1, 1] every valid layer is opaque, so the opacity filter cannot hide missing validation
    expect(resolveGridLayers(layers, 16, 1, [-1, 1]).map((layer) => layer.stepWorld)).toEqual([400]);
  });

  it("does not let an invalid layer claim its step", () => {
    const layers = [
      { step: 5, dotSize: Number.NaN },
      { step: 5, dotSize: 2 },
    ];

    expect(resolveGridLayers(layers, 16, 1, FADE)).toEqual([{ stepWorld: 80, spacingPx: 80, opacity: 1, dotSize: 2 }]);
  });

  it("returns an empty list for missing layers", () => {
    expect(resolveGridLayers(undefined, 16, 1, FADE)).toEqual([]);
    expect(resolveGridLayers([], 16, 1, FADE)).toEqual([]);
  });

  it("returns an empty list for a missing or non-finite fade window", () => {
    const layers = [{ step: 5, dotSize: 2 }];

    expect(resolveGridLayers(layers, 16, 1, undefined)).toEqual([]);
    expect(resolveGridLayers(layers, 16, 1, [Number.NaN, 18])).toEqual([]);
    expect(resolveGridLayers(layers, 16, 1, [6, Number.POSITIVE_INFINITY])).toEqual([]);
  });

  it("hides a layer whose dots would merge into a fill", () => {
    const layers = [{ step: 1, dotSize: 4 }];

    // 16 × 0.25 = 4 px between dots, which is below dotSize + 1 = 5 px
    expect(resolveGridLayers(layers, 16, 0.25, [0, 1])).toEqual([]);
    expect(resolveGridLayers(layers, 16, 1, [0, 1])).toEqual([
      { stepWorld: 16, spacingPx: 16, opacity: 1, dotSize: 4 },
    ]);
  });

  it("sorts layers by step and keeps the first duplicate", () => {
    const layers = [
      { step: 25, dotSize: 3 },
      { step: 5, dotSize: 2 },
      { step: 25, dotSize: 9 },
    ];

    expect(resolveGridLayers(layers, 16, 1, FADE)).toEqual([
      { stepWorld: 80, spacingPx: 80, opacity: 1, dotSize: 2 },
      { stepWorld: 400, spacingPx: 400, opacity: 1, dotSize: 3 },
    ]);
  });

  it("excludes fully transparent layers and computes partial opacity", () => {
    const layers = [
      { step: 1, dotSize: 1 },
      { step: 5, dotSize: 2 },
    ];

    // step 1 → 16 × 0.25 = 4 px (hidden), step 5 → 80 × 0.25 = 20 px (opaque)
    expect(resolveGridLayers(layers, 16, 0.25, FADE)).toEqual([
      { stepWorld: 80, spacingPx: 20, opacity: 1, dotSize: 2 },
    ]);

    // step 1 → 16 × 0.75 = 12 px, the middle of the window
    const [finest] = resolveGridLayers(layers, 16, 0.75, FADE);
    expect(finest.stepWorld).toBe(16);
    expect(finest.opacity).toBeCloseTo(0.5);
  });
});

describe("default GRID_LAYERS", () => {
  const { GRID_SIZE, GRID_LAYERS, GRID_LAYER_FADE } = initGraphConstants.system;
  const scales = Array.from({ length: 200 }, (_, index) => 0.01 * Math.pow(100, index / 199));

  it("never makes a coarser layer more transparent than a finer one", () => {
    for (const scale of scales) {
      const resolved = resolveGridLayers(GRID_LAYERS, GRID_SIZE, scale, GRID_LAYER_FADE);
      for (let index = 1; index < resolved.length; index += 1) {
        expect(resolved[index].opacity).toBeGreaterThanOrEqual(resolved[index - 1].opacity);
      }
    }
  });

  it("keeps at least one fully opaque layer at every scale", () => {
    for (const scale of scales) {
      const resolved = resolveGridLayers(GRID_LAYERS, GRID_SIZE, scale, GRID_LAYER_FADE);
      expect(resolved.some((layer) => layer.opacity === 1)).toBe(true);
    }
  });

  it("has at most one layer in transition at every scale", () => {
    for (const scale of scales) {
      const resolved = resolveGridLayers(GRID_LAYERS, GRID_SIZE, scale, GRID_LAYER_FADE);
      expect(resolved.filter((layer) => layer.opacity < 1).length).toBeLessThanOrEqual(1);
    }
  });
});

describe("isPatternLayer", () => {
  it.each([
    [128, 2, true],
    [128.5, 2, false],
    [PATTERN_MAX_TILE_PX, 1, true],
    [PATTERN_MAX_TILE_PX + 1, 1, false],
  ])("spacing %p px at DPR %p → %p", (spacingPx, dpr, expected) => {
    expect(isPatternLayer(spacingPx, dpr)).toBe(expected);
  });
});

describe("getGridTilePx", () => {
  it("rounds the device spacing and never returns less than 1", () => {
    expect(getGridTilePx(6.2, 2)).toBe(12);
    expect(getGridTilePx(6.3, 2)).toBe(13);
    expect(getGridTilePx(0.1, 1)).toBe(1);
  });
});

describe("getVisibleWorldRect", () => {
  it("converts the camera viewport to world coordinates", () => {
    expect(getVisibleWorldRect({ x: 100, y: -50, width: 800, height: 600, scale: 2 })).toEqual({
      x: -50,
      y: 25,
      width: 400,
      height: 300,
    });
  });

  it("does not produce negative zero for a zero camera offset", () => {
    const rect = getVisibleWorldRect({ x: 0, y: 0, width: 10, height: 10, scale: 2 });

    expect(Object.is(rect.x, 0)).toBe(true);
    expect(Object.is(rect.y, 0)).toBe(true);
  });
});

describe("intersectRects", () => {
  it("returns the overlapping part", () => {
    expect(intersectRects({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: -20, width: 100, height: 60 })).toEqual({
      x: 50,
      y: 0,
      width: 50,
      height: 40,
    });
  });

  it("returns undefined for disjoint or touching rects", () => {
    expect(
      intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 10 })
    ).toBeUndefined();
    expect(
      intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })
    ).toBeUndefined();
  });

  it("returns undefined when a rect has NaN coordinates", () => {
    expect(
      intersectRects({ x: Number.NaN, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 })
    ).toBeUndefined();
    expect(
      intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: Number.NaN, height: 10 })
    ).toBeUndefined();
  });
});
