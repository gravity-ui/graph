import { Component } from "../../../../lib/Component";
import { TRect } from "../../../../utils/types/shapes";

import type { TBelowLayerContext } from "./BelowLayer";
import { GridLayerPatterns } from "./GridLayerPatterns";
import { GridLayers } from "./GridLayers";

type TCameraFixture = { x: number; y: number; width: number; height: number; scale: number };

type TGridFixtureOptions = {
  layers: Array<{ step: number; dotSize: number }>;
  rect?: TRect;
  dpr?: number;
  /** Mutable camera state, so tests can move the camera between renders */
  camera?: TCameraFixture;
  /** `constants.system.GRID_DOT_SCALE_LIMIT`; left undefined, no dot size limit is applied */
  dotScaleLimit?: number;
};

type TGridFixture = {
  grid: GridLayers;
  ctx: CanvasRenderingContext2D;
};

/** Camera at scale 1 looking at world rect { x: 0, y: 0, width: 1000, height: 800 } */
function createGridFixture({
  layers,
  rect = { x: -500, y: -500, width: 1000, height: 1000 },
  dpr = 1,
  camera = { x: 0, y: 0, width: 1000, height: 800, scale: 1 },
  dotScaleLimit,
}: TGridFixtureOptions): TGridFixture {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const parent = new Component({}, undefined);
  parent.setContext({
    camera: {
      getCameraState: () => ({ ...camera }),
    },
    constants: {
      system: {
        GRID_SIZE: 16,
        GRID_LAYERS: layers,
        GRID_LAYER_FADE: [6, 18],
        GRID_DOT_SCALE_LIMIT: dotScaleLimit,
      },
    },
    colors: { canvas: { dots: "#000000" } },
    layer: { getDRP: () => dpr },
    ctx,
  } as unknown as TBelowLayerContext);

  return { grid: new GridLayers(rect, parent), ctx };
}

describe("GridLayers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fills dense layers with patterns over the visible part of the rect", () => {
    const { grid, ctx } = createGridFixture({
      layers: [
        { step: 1, dotSize: 2 },
        { step: 5, dotSize: 3 },
      ],
    });
    const alphas: number[] = [];
    const fillRectSpy = jest.spyOn(ctx, "fillRect").mockImplementation(() => {
      alphas.push(ctx.globalAlpha);
    });

    grid.render();

    expect(fillRectSpy.mock.calls).toEqual([
      [0, 0, 500, 500],
      [0, 0, 500, 500],
    ]);
    // step 1 → 16 px on screen → smoothstep(6, 18, 16) ≈ 0.926; step 5 → 80 px → 1
    expect(alphas[0]).toBeCloseTo(0.926, 3);
    expect(alphas[1]).toBe(1);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("draws sparse layers directly inside a clip", () => {
    const { grid, ctx } = createGridFixture({ layers: [{ step: 25, dotSize: 3 }] });
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const clipSpy = jest.spyOn(ctx, "clip");
    const fillSpy = jest.spyOn(ctx, "fill");
    const rectSpy = jest.spyOn(ctx, "rect");

    grid.render();

    expect(createPatternSpy).not.toHaveBeenCalled();
    expect(clipSpy).toHaveBeenCalledTimes(1);
    expect(fillSpy).toHaveBeenCalledTimes(1);
    // The clip region is the visible part of the rect, set before the clip is applied
    expect(rectSpy).toHaveBeenCalledWith(0, 0, 500, 500);
    expect(rectSpy.mock.invocationCallOrder[0]).toBeLessThan(clipSpy.mock.invocationCallOrder[0]);
    // Visible region { 0, 0, 500, 500 } with a 400 world step → nodes at x, y ∈ { 0, 400 }
    const path = fillSpy.mock.calls[0][0] as unknown as Path2D & { arc: jest.Mock };
    expect(path.arc).toHaveBeenCalledTimes(4);
    expect(path.arc).toHaveBeenCalledWith(400, 400, 1.5, 0, Math.PI * 2);
  });

  it("reuses cached patterns while the camera pans", () => {
    const camera = { x: 0, y: 0, width: 1000, height: 800, scale: 1 };
    const { grid, ctx } = createGridFixture({ layers: [{ step: 5, dotSize: 3 }], camera });
    const createPatternSpy = jest.spyOn(ctx, "createPattern");
    const fillRectSpy = jest.spyOn(ctx, "fillRect");

    grid.render();
    expect(createPatternSpy).toHaveBeenCalledTimes(1);
    expect(fillRectSpy).toHaveBeenCalledTimes(1);

    camera.x = -100;
    grid.render();

    expect(createPatternSpy).toHaveBeenCalledTimes(1);
    expect(fillRectSpy).toHaveBeenCalledTimes(2);
    // The visible world rect moved to x ∈ [100, 1100], so the fill region follows the camera
    expect(fillRectSpy.mock.calls[1]).toEqual([100, 0, 400, 500]);
  });

  it("draws nothing when the rect is outside the viewport", () => {
    const { grid, ctx } = createGridFixture({
      layers: [
        { step: 1, dotSize: 2 },
        { step: 25, dotSize: 3 },
      ],
      rect: { x: 2000, y: 2000, width: 100, height: 100 },
    });
    const fillRectSpy = jest.spyOn(ctx, "fillRect");
    const fillSpy = jest.spyOn(ctx, "fill");

    grid.render();

    expect(fillRectSpy).not.toHaveBeenCalled();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it("skips a layer whose pattern cannot be created", () => {
    const { grid, ctx } = createGridFixture({ layers: [{ step: 5, dotSize: 3 }] });
    jest.spyOn(ctx, "createPattern").mockReturnValue(null);
    const fillRectSpy = jest.spyOn(ctx, "fillRect");

    expect(() => grid.render()).not.toThrow();
    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it("applies the device pixel ratio to the tile", () => {
    const { grid, ctx } = createGridFixture({ layers: [{ step: 5, dotSize: 3 }], dpr: 2 });
    const createPatternSpy = jest.spyOn(ctx, "createPattern");

    grid.render();

    // 80 world units × scale 1 × DPR 2 → 160 px tile mapped back onto 80 world units
    const tile = createPatternSpy.mock.calls[0][0] as HTMLCanvasElement;
    expect(tile.width).toBe(160);
    const pattern = createPatternSpy.mock.results[0].value as CanvasPattern;
    expect(pattern.setTransform).toHaveBeenCalledWith({ a: 0.5, b: 0, c: 0, d: 0.5, e: -40, f: -40 });
  });

  it("draws dots at the effective size when the camera is below GRID_DOT_SCALE_LIMIT", () => {
    const camera = { x: 0, y: 0, width: 1000, height: 800, scale: 0.5 };
    const { grid, ctx } = createGridFixture({
      layers: [
        { step: 1, dotSize: 4 },
        { step: 125, dotSize: 4 },
      ],
      camera,
      dpr: 2,
      dotScaleLimit: 1,
    });
    const getPatternSpy = jest.spyOn(GridLayerPatterns.prototype, "get");
    const fillSpy = jest.spyOn(ctx, "fill");

    grid.render();

    // Effective dot = 4 × min(1, 0.5 / 1) = 2 CSS px; step 1 → 16 × 0.5 = 8 px between dots → pattern layer
    expect(getPatternSpy).toHaveBeenCalledTimes(1);
    expect(getPatternSpy.mock.calls[0][1]).toMatchObject({ stepWorld: 16, tilePx: 16, dotSizePx: 2 * 2 });
    // Step 125 → 2000 world units → direct layer, radius = 2 / 2 / scale 0.5 world units
    expect(fillSpy).toHaveBeenCalledTimes(1);
    const path = fillSpy.mock.calls[0][0] as unknown as Path2D & { arc: jest.Mock };
    expect(path.arc).toHaveBeenCalledTimes(1);
    expect(path.arc.mock.calls[0][2]).toBe(2);
  });

  it("clears cached patterns on unmount", () => {
    const clearSpy = jest.spyOn(GridLayerPatterns.prototype, "clear");
    const { grid } = createGridFixture({ layers: [{ step: 1, dotSize: 2 }] });

    grid.render();
    Component.unmount(grid);

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
