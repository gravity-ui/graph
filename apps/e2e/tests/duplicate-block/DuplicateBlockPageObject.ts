import type { Page } from "@playwright/test";
import type { TBlockId, TConnection } from "@gravity-ui/graph";
import type { GraphPoint } from "@gravity-ui/graph-playwright";

import type { GraphPageObject } from "../../page-objects/GraphPageObject";

export interface DuplicateBlockLayerOptions {
  ghostBackground?: string;
  /** Builds `isDuplicateAllowed` in the browser: these blocks cannot be duplicated. */
  notDuplicableIds?: TBlockId[];
}

declare global {
  interface Window {
    duplicateBlockLayer?: InstanceType<Window["GraphModule"]["DuplicateBlockLayer"]>;
  }
}

/**
 * Drives `DuplicateBlockLayer` from `@gravity-ui/graph-duplicate-block` the way a user does: Alt + mouse drag.
 */
export class DuplicateBlockPageObject {
  constructor(
    private readonly page: Page,
    private readonly graphPO: GraphPageObject
  ) {}

  public async addLayer(options: DuplicateBlockLayerOptions = {}): Promise<void> {
    await this.page.evaluate(({ ghostBackground, notDuplicableIds }) => {
      const { DuplicateBlockLayer } = window.GraphModule;
      window.duplicateBlockLayer = window.graph.addLayer(DuplicateBlockLayer, {
        ghostBackground,
        isDuplicateAllowed: notDuplicableIds
          ? (block) => !notDuplicableIds.includes(block.connectedState.id)
          : undefined,
      });
    }, options);
    await this.graphPO.waitForFrames(2);
  }

  public async disable(): Promise<void> {
    await this.page.evaluate(() => window.duplicateBlockLayer?.disable());
  }

  /** Holds Alt while dragging from one world point to another with the public page object. */
  public async altDrag(from: GraphPoint, to: GraphPoint): Promise<void> {
    await this.page.keyboard.down("Alt");
    try {
      await this.graphPO.drag(from, to);
    } finally {
      await this.page.keyboard.up("Alt");
    }
  }

  /**
   * Presses Alt + mouse on a world point and moves to another one without releasing.
   * GraphPO has no press-and-hold drag or modifier option, so this drives `page.mouse` directly.
   */
  public async startAltDrag(from: GraphPoint, to: GraphPoint): Promise<void> {
    const [start, end] = await Promise.all([this.toViewport(from), this.toViewport(to)]);
    await this.page.keyboard.down("Alt");
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, { steps: 10 });
    await this.graphPO.waitForFrames(2);
  }

  public async finishAltDrag(): Promise<void> {
    await this.page.mouse.up();
    await this.page.keyboard.up("Alt");
    await this.graphPO.waitForFrames(2);
  }

  /** Returns the alpha of the layer's preview canvas at a world point. */
  public async getPreviewAlphaAt(point: GraphPoint): Promise<number> {
    return this.page.evaluate((worldPoint) => {
      const layer = window.duplicateBlockLayer;
      const canvas = layer?.getCanvas();
      const ctx = canvas?.getContext("2d");
      if (!layer || !canvas || !ctx) {
        throw new Error("DuplicateBlockLayer canvas is not available.");
      }
      const [x, y] = window.graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y);
      const dpr = layer.getDRP();
      return ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data[3];
    }, point);
  }

  public async getBlockIds(): Promise<TBlockId[]> {
    return this.graphPO.evaluate((graph) => graph.blocks.toJSON().map((block) => block.id));
  }

  public async getConnections(): Promise<TConnection[]> {
    return this.graphPO.evaluate((graph) => graph.connections.toJSON());
  }

  private async toViewport(point: GraphPoint): Promise<GraphPoint> {
    const [position, bounds] = await Promise.all([
      this.graphPO.evaluate((graph, worldPoint) => {
        const [x, y] = graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y);
        return { x, y };
      }, point),
      this.graphPO.getBounds(),
    ]);
    return { x: bounds.x + position.x, y: bounds.y + position.y };
  }
}
