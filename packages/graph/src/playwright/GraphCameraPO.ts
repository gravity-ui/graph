import type { TBlockId } from "../store/block/Block";

import type { GraphPO } from "./GraphPO";
import type { GraphPoint, GraphRect } from "./types";

export type GraphCameraState = {
  x: number;
  y: number;
  scale: number;
};

export class GraphCameraPO {
  constructor(private readonly graph: GraphPO) {}

  public async getState(): Promise<GraphCameraState> {
    return this.graph.evaluate((graph) => {
      const camera = graph.cameraService.getCameraState();
      return { x: camera.x, y: camera.y, scale: camera.scale };
    });
  }

  public async getBounds(): Promise<GraphRect> {
    return this.graph.getBounds();
  }

  public async zoomToScale(scale: number): Promise<void> {
    await this.graph.evaluate((graph, nextScale) => graph.zoom({ scale: nextScale }), scale);
    await this.graph.waitForFrames(3);
  }

  public async zoomToCenter(): Promise<void> {
    await this.graph.evaluate((graph) => graph.zoomTo("center"));
    await this.graph.waitForFrames(3);
  }

  public async zoomToBlocks(blockIds: TBlockId[]): Promise<void> {
    await this.graph.evaluate((graph, ids) => graph.api.zoomToBlocks(ids), blockIds);
    await this.graph.waitForFrames(3);
  }

  public async panBy(dx: number, dy: number): Promise<void> {
    await this.graph.evaluate((graph, offset) => graph.cameraService.move(offset.dx, offset.dy), { dx, dy });
    await this.graph.waitForFrames(2);
  }

  /**
   * Emulates a user wheel gesture over the graph.
   * `position` is expressed in viewport coordinates and defaults to the graph center.
   */
  public async wheel(deltaX: number, deltaY: number, position?: GraphPoint): Promise<void> {
    const bounds = await this.getBounds();
    const x = position?.x ?? bounds.x + bounds.width / 2;
    const y = position?.y ?? bounds.y + bounds.height / 2;

    await this.graph.page.mouse.move(x, y);
    await this.graph.page.mouse.wheel(deltaX, deltaY);
    await this.graph.waitForFrames(3);
  }
}
