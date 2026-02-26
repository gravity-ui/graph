import { Page } from "@playwright/test";
import type { GraphPageObject } from "./GraphPageObject";
import { ECanDrag } from "../entry";

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

/**
 * Component Object Model for graph camera
 * Provides methods to control and query the camera state
 */
export class GraphCameraComponentObject {
  constructor(
    private page: Page,
    private graphPO: GraphPageObject
  ) {}

  /**
   * Get camera state from the graph
   */
  async getState(): Promise<CameraState> {
    return await this.page.evaluate(() => {
      const camera = window.graph.cameraService.getCameraState();
      return {
        x: camera.x,
        y: camera.y,
        scale: camera.scale,
      };
    });
  }

  /**
   * Zoom camera to a specific scale
   */
  async zoomToScale(scale: number): Promise<void> {
    await this.page.evaluate((s) => {
      window.graph.zoom({ scale: s });
    }, scale);

    // Wait for zoom animation to complete
    await this.graphPO.waitForFrames(3);
  }

  /**
   * Pan camera by offset (in screen pixels)
   */
  async pan(dx: number, dy: number): Promise<void> {
    await this.page.evaluate(
      ({ dx, dy }) => {
        window.graph.cameraService.move(dx, dy);
      },
      { dx, dy }
    );

    // Wait for pan to be processed
    await this.graphPO.waitForFrames(2);
  }

  /**
   * Zoom to center
   */
  async zoomToCenter(): Promise<void> {
    await this.page.evaluate(() => {
      window.graph.zoomTo("center");
    });

    // Wait for zoom animation
    await this.graphPO.waitForFrames(20);
  }

  /**
   * Zoom to specific blocks
   */
  async zoomToBlocks(blockIds: string[]): Promise<void> {
    await this.page.evaluate((ids) => {
      window.graph.zoomTo(ids);
    }, blockIds);

    // Wait for zoom animation
    await this.graphPO.waitForFrames(20);
  }

  /**
   * Get canvas bounding box
   */
  async getCanvasBounds(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    return await this.page.evaluate(() => {
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    });
  }

  /**
   * Emulate zoom with mouse wheel
   * @param deltaY - Positive = zoom out, Negative = zoom in
   * @param position - Optional position to zoom at (defaults to canvas center)
   */
  async emulateZoom(
    deltaY: number,
    position?: { x: number; y: number }
  ): Promise<void> {
    const canvasBounds = await this.getCanvasBounds();

    // Use provided position or default to canvas center
    const mouseX = position?.x ?? canvasBounds.x + canvasBounds.width / 2;
    const mouseY = position?.y ?? canvasBounds.y + canvasBounds.height / 2;

    // Move mouse to position and perform wheel event
    await this.page.mouse.move(mouseX, mouseY);
    await this.page.mouse.wheel(0, deltaY);

    // Wait for zoom to be processed
    await this.graphPO.waitForFrames(3);
  }

  /**
   * Pan the camera via trackpad wheel events so that the given world point ends up
   * under the mouse cursor.
   *
   * handleTrackpadMove does camera.move(-deltaX, -deltaY), so to shift the camera by
   * (dx, dy) screen pixels we pass wheel(dx, dy) directly. A non-zero deltaX triggers
   * trackpad detection in isTrackpadWheelEvent() (horizontal scroll → trackpad).
   *
   * Fires multiple small steps (≤8 px) to stay within Camera's edge-guard limits.
   *
   * @param worldX - Target world X coordinate to bring under cursor
   * @param worldY - Target world Y coordinate to bring under cursor
   * @param viewportX - Cursor viewport X (defaults to canvas center)
   * @param viewportY - Cursor viewport Y (defaults to canvas center)
   */
  async panWorldPointUnderCursor(
    worldX: number,
    worldY: number,
    viewportX?: number,
    viewportY?: number
  ): Promise<void> {
    const canvasBounds = await this.getCanvasBounds();
    const vx = viewportX ?? canvasBounds.x + canvasBounds.width / 2;
    const vy = viewportY ?? canvasBounds.y + canvasBounds.height / 2;

    const delta = await this.page.evaluate(
      ({ wx, wy, vx, vy }) => {
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        const [currentWX, currentWY] = window.graph.cameraService.getRelativeXY(
          vx - rect.left,
          vy - rect.top
        );
        const { scale } = window.graph.cameraService.getCameraState();
        return {
          dx: (wx - currentWX) * scale,
          dy: (wy - currentWY) * scale,
        };
      },
      { wx: worldX, wy: worldY, vx, vy }
    );

    await this.page.mouse.move(vx, vy);

    const STEP = 8;
    const steps = Math.ceil(Math.max(Math.abs(delta.dx), Math.abs(delta.dy)) / STEP);
    const stepDx = steps > 0 ? delta.dx / steps : 0;
    const stepDy = steps > 0 ? delta.dy / steps : 0;

    for (let i = 0; i < steps; i++) {
      const wheelDx = stepDx !== 0 ? stepDx : 0.1;
      await this.page.mouse.wheel(wheelDx, stepDy);
      await this.graphPO.waitForFrames(1);
    }
  }

  /**
   * Pan the camera via trackpad wheel events by the given screen-pixel amount.
   * Positive dx moves content to the left (camera right), positive dy moves content up.
   * Mouse must already be positioned on the canvas before calling.
   *
   * @param dx - Horizontal pan amount in screen pixels
   * @param dy - Vertical pan amount in screen pixels
   */
  async trackpadPan(dx: number, dy: number): Promise<void> {
    const STEP = 8;
    const totalSteps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / STEP);
    const stepDx = totalSteps > 0 ? dx / totalSteps : 0;
    const stepDy = totalSteps > 0 ? dy / totalSteps : 0;

    for (let moved = 0; moved < totalSteps; moved++) {
      const wheelDx = stepDx !== 0 ? -stepDx : -0.1;
      await this.page.mouse.wheel(wheelDx, -stepDy);
      await this.graphPO.waitForFrames(1);
    }
  }

  /**
   * Emulate camera pan with mouse drag
   * @param deltaX - Horizontal drag distance in pixels
   * @param deltaY - Vertical drag distance in pixels
   * @param startPosition - Optional start position (defaults to canvas center)
   */
  async emulatePan(
    deltaX: number,
    deltaY: number,
    startPosition?: { x: number; y: number }
  ): Promise<void> {
    // Temporarily disable block dragging to prevent accidentally dragging blocks
    const previousCanDrag = await this.page.evaluate(() => {
      const currentSetting = window.graph.rootStore.settings.$canDrag.value;
      window.graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.NONE });
      return currentSetting;
    });

    const canvasBounds = await this.getCanvasBounds();

    // Use provided position or default to canvas center
    const startX = startPosition?.x ?? canvasBounds.x + canvasBounds.width / 2;
    const startY = startPosition?.y ?? canvasBounds.y + canvasBounds.height / 2;

    // Perform drag operation
    await this.page.mouse.move(startX, startY);
    await this.graphPO.waitForFrames(1);

    await this.page.mouse.down();
    await this.graphPO.waitForFrames(1);

    await this.page.mouse.move(startX + deltaX, startY + deltaY, {
      steps: 10,
    });
    await this.graphPO.waitForFrames(2);

    await this.page.mouse.up();
    await this.graphPO.waitForFrames(2);

    // Restore previous canDrag setting
    await this.page.evaluate((canDrag) => {
      window.graph.updateSettings({ canDrag });
    }, previousCanDrag);
  }
}
