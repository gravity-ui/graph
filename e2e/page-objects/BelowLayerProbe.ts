import type { GraphPageObject } from "./GraphPageObject";

export type TWorldPoint = { x: number; y: number };

export type TDarknessWindow = {
  /** Expected device-pixel position of the world point */
  expectedX: number;
  expectedY: number;
  /** Top-left device pixel of the window */
  originX: number;
  originY: number;
  /** Window side in device pixels */
  size: number;
  /** Row-major darkness values in [0, 1]: 0 is white, 1 is black */
  values: number[];
};

type TGraphWithBelowLayer = {
  belowLayer: { getCanvas(): HTMLCanvasElement };
};

/**
 * Repository-only probe that reads BelowLayer canvas pixels.
 * Tests use black dots on a white layer background, so darkness maps to dot coverage × opacity.
 */
export class BelowLayerProbe {
  constructor(private readonly graphPO: GraphPageObject) {}

  /** Puts `center` in the middle of the viewport at the given scale */
  public async setCamera(scale: number, center: TWorldPoint): Promise<void> {
    await this.graphPO.page.evaluate(
      ({ nextScale, worldCenter }) => {
        const { width, height } = window.graph.cameraService.getCameraState();
        window.graph.cameraService.set({
          scale: nextScale,
          x: width / 2 - worldCenter.x * nextScale,
          y: height / 2 - worldCenter.y * nextScale,
        });
      },
      { nextScale: scale, worldCenter: center }
    );
    await this.graphPO.waitForFrames(3);
  }

  /** Viewport position (CSS px) of a world point; the graph root starts at (0, 0) */
  public async worldToScreen(point: TWorldPoint): Promise<TWorldPoint> {
    return this.graphPO.page.evaluate((worldPoint) => {
      const camera = window.graph.cameraService.getCameraState();
      return { x: worldPoint.x * camera.scale + camera.x, y: worldPoint.y * camera.scale + camera.y };
    }, point);
  }

  public async readDarknessWindow(point: TWorldPoint, radius: number): Promise<TDarknessWindow> {
    return this.graphPO.page.evaluate(
      ({ worldPoint, windowRadius }) => {
        const canvas = (window.graph as unknown as TGraphWithBelowLayer).belowLayer.getCanvas();
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("BelowLayer canvas has no 2d context");
        }
        const camera = window.graph.cameraService.getCameraState();
        const dpr = canvas.width / camera.width;
        const expectedX = (worldPoint.x * camera.scale + camera.x) * dpr;
        const expectedY = (worldPoint.y * camera.scale + camera.y) * dpr;
        const size = windowRadius * 2 + 1;
        const originX = Math.round(expectedX) - windowRadius;
        const originY = Math.round(expectedY) - windowRadius;
        // Reads outside the canvas return transparent black, which would look like a fully dark pixel
        if (originX < 0 || originY < 0 || originX + size > canvas.width || originY + size > canvas.height) {
          throw new Error(`Pixel window at (${originX}, ${originY}) of ${size}px is outside the BelowLayer canvas`);
        }
        const data = ctx.getImageData(originX, originY, size, size).data;
        const values: number[] = [];
        for (let index = 0; index < size * size; index += 1) {
          const offset = index * 4;
          values.push(1 - (data[offset] + data[offset + 1] + data[offset + 2]) / (3 * 255));
        }
        return { expectedX, expectedY, originX, originY, size, values };
      },
      { worldPoint: point, windowRadius: radius }
    );
  }

  /** Max darkness in a 3×3 device-px window around the world point */
  public async nodeDarkness(point: TWorldPoint): Promise<number> {
    const { values } = await this.readDarknessWindow(point, 1);
    return Math.max(...values);
  }

  /** Offset in device px of the darkness-weighted dot center from the expected position */
  public async findDotCenter(point: TWorldPoint, radius = 6): Promise<TWorldPoint> {
    const darkness = await this.readDarknessWindow(point, radius);
    let total = 0;
    let sumX = 0;
    let sumY = 0;
    darkness.values.forEach((value, index) => {
      if (value <= 0.1) {
        return;
      }
      const x = darkness.originX + (index % darkness.size) + 0.5;
      const y = darkness.originY + Math.floor(index / darkness.size) + 0.5;
      total += value;
      sumX += x * value;
      sumY += y * value;
    });
    if (total === 0) {
      throw new Error(`No dot found near (${point.x}, ${point.y})`);
    }
    return { x: sumX / total - darkness.expectedX, y: sumY / total - darkness.expectedY };
  }

  /** Widest row run of pixels with darkness ≥ 0.5 around the world point, in device px */
  public async dotDiameter(point: TWorldPoint, radius = 12): Promise<number> {
    const { size, values } = await this.readDarknessWindow(point, radius);
    let widest = 0;
    for (let row = 0; row < size; row += 1) {
      let count = 0;
      for (let column = 0; column < size; column += 1) {
        if (values[row * size + column] >= 0.5) {
          count += 1;
        }
      }
      widest = Math.max(widest, count);
    }
    return widest;
  }

  public async readRgb(point: TWorldPoint): Promise<[number, number, number]> {
    return this.graphPO.page.evaluate((worldPoint) => {
      const canvas = (window.graph as unknown as TGraphWithBelowLayer).belowLayer.getCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("BelowLayer canvas has no 2d context");
      }
      const camera = window.graph.cameraService.getCameraState();
      const dpr = canvas.width / camera.width;
      const x = Math.round((worldPoint.x * camera.scale + camera.x) * dpr);
      const y = Math.round((worldPoint.y * camera.scale + camera.y) * dpr);
      if (x < 0 || y < 0 || x + 1 > canvas.width || y + 1 > canvas.height) {
        throw new Error(`Pixel (${x}, ${y}) is outside the BelowLayer canvas`);
      }
      const [red, green, blue] = ctx.getImageData(x, y, 1, 1).data;
      return [red, green, blue] as [number, number, number];
    }, point);
  }
}
