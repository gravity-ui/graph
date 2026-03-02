import { Page } from "@playwright/test";
import type { GraphPageObject } from "../../page-objects/GraphPageObject";

export interface MiniMapLayerOptions {
  width?: number;
  height?: number;
  classNames?: string[];
  cameraBorderSize?: number;
  cameraBorderColor?: string;
  location?:
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight"
    | { top?: string; left?: string; bottom?: string; right?: string };
}

export interface MinimapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapPositionRelativeToRoot {
  fromLeft: number;
  fromTop: number;
  fromRight: number;
  fromBottom: number;
}

/**
 * Component Object Model for the MiniMap layer.
 * Provides helpers to add, interact with and query the minimap canvas element.
 */
export class MiniMapPageObject {
  constructor(
    private readonly page: Page,
    private readonly graphPO: GraphPageObject
  ) {}

  /**
   * Adds MiniMapLayer to the running graph instance.
   * Waits for the initial render to complete.
   */
  async addLayer(options: MiniMapLayerOptions = {}): Promise<void> {
    await this.page.evaluate((opts) => {
      const { MiniMapLayer } = (window as any).GraphModule;
      (window as any).minimapLayer = window.graph.addLayer(MiniMapLayer, opts);
    }, options as Record<string, unknown>);

    await this.graphPO.waitForFrames(5);
  }

  /**
   * Returns true if the minimap canvas element is present in the DOM.
   */
  async exists(): Promise<boolean> {
    return this.page.evaluate(() => Boolean(document.querySelector(".graph-minimap")));
  }

  /**
   * Returns the minimap canvas bounding rect in viewport coordinates.
   */
  async getCanvasBounds(): Promise<MinimapBounds> {
    return this.page.evaluate(() => {
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      if (!canvas) throw new Error("Minimap canvas not found");
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
  }

  /**
   * Returns the minimap canvas position relative to the #root element.
   * Useful for verifying location props (topLeft, topRight, etc.).
   */
  async getPositionRelativeToRoot(): Promise<MinimapPositionRelativeToRoot> {
    return this.page.evaluate(() => {
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      const root = document.getElementById("root");
      if (!canvas || !root) throw new Error("Canvas or root not found");

      const canvasRect = canvas.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();

      return {
        fromLeft: canvasRect.left - rootRect.left,
        fromTop: canvasRect.top - rootRect.top,
        fromRight: rootRect.right - canvasRect.right,
        fromBottom: rootRect.bottom - canvasRect.bottom,
      };
    });
  }

  /**
   * Returns the rendered CSS size of the minimap canvas (in layout pixels).
   */
  async getCanvasSize(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(() => {
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      if (!canvas) throw new Error("Minimap canvas not found");
      const rect = canvas.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    });
  }

  /**
   * Clicks at a relative position on the minimap canvas.
   * @param relativeX - 0 = left edge, 1 = right edge
   * @param relativeY - 0 = top edge, 1 = bottom edge
   */
  async clickAt(relativeX: number, relativeY: number): Promise<void> {
    const bounds = await this.getCanvasBounds();
    await this.page.mouse.click(
      bounds.x + bounds.width * relativeX,
      bounds.y + bounds.height * relativeY
    );
    await this.graphPO.waitForFrames(3);
  }

  /**
   * Performs a drag gesture within the minimap canvas.
   * Both start and end coordinates are relative (0–1).
   */
  async dragFrom(
    fromRelX: number,
    fromRelY: number,
    toRelX: number,
    toRelY: number
  ): Promise<void> {
    const bounds = await this.getCanvasBounds();
    const fromX = bounds.x + bounds.width * fromRelX;
    const fromY = bounds.y + bounds.height * fromRelY;
    const toX = bounds.x + bounds.width * toRelX;
    const toY = bounds.y + bounds.height * toRelY;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    await this.graphPO.waitForFrames(2);

    await this.page.mouse.move(toX, toY, { steps: 10 });
    await this.graphPO.waitForFrames(3);

    await this.page.mouse.up();
    await this.graphPO.waitForFrames(3);
  }

  /**
   * Checks whether the minimap canvas element has the given CSS class.
   */
  async hasClass(className: string): Promise<boolean> {
    return this.page.evaluate((cls) => {
      const canvas = document.querySelector(".graph-minimap");
      return canvas ? canvas.classList.contains(cls) : false;
    }, className);
  }
}
