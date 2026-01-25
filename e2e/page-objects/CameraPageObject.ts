import { Page } from "@playwright/test";
import { CameraState } from "../utils/CoordinateTransformer";

export class CameraPageObject {
  constructor(private page: Page) {}

  /**
   * Wait for animation frames
   */
  private async waitForFrames(count: number = 1): Promise<void> {
    await this.page.evaluate((frameCount) => {
      return new Promise<void>((resolve) => {
        let remaining = frameCount;
        const tick = () => {
          remaining--;
          if (remaining <= 0) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      });
    }, count);
  }

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
    await this.waitForFrames(3);
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
    await this.waitForFrames(2);
  }

  /**
   * Zoom to center
   */
  async zoomToCenter(): Promise<void> {
    await this.page.evaluate(() => {
      window.graph.zoomTo("center");
    });
    
    // Wait for zoom animation
    await this.waitForFrames(3);
  }

  /**
   * Zoom to specific blocks
   */
  async zoomToBlocks(blockIds: string[]): Promise<void> {
    await this.page.evaluate((ids) => {
      window.graph.zoomTo(ids);
    }, blockIds);
    
    // Wait for zoom animation
    await this.waitForFrames(3);
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
    await this.waitForFrames(3);
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
    const canvasBounds = await this.getCanvasBounds();

    // Use provided position or default to canvas center
    const startX = startPosition?.x ?? canvasBounds.x + canvasBounds.width / 2;
    const startY = startPosition?.y ?? canvasBounds.y + canvasBounds.height / 2;

    // Perform drag operation
    await this.page.mouse.move(startX, startY);
    await this.waitForFrames(1);

    await this.page.mouse.down();
    await this.waitForFrames(1);

    await this.page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await this.waitForFrames(2);

    await this.page.mouse.up();
    await this.waitForFrames(2);
  }
}
