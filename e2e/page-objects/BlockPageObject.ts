import { Page } from "@playwright/test";
import {
  CoordinateTransformer,
  ScreenCoordinates,
  WorldCoordinates,
  Rect,
} from "../utils/CoordinateTransformer";
import { CameraPageObject } from "./CameraPageObject";

export class BlockPageObject {
  constructor(
    private page: Page,
    private camera: CameraPageObject,
    private getGraphPO?: () => { waitForFrames: (count: number) => Promise<void> }
  ) {}

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
   * Get block geometry by ID
   */
  async getGeometry(blockId: string): Promise<Rect> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      if (!blockState) {
        throw new Error(`Block ${id} not found`);
      }
      return blockState.$geometry.value;
    }, blockId);
  }

  /**
   * Get screen coordinates for a block center
   * Returns coordinates relative to canvas element (not viewport)
   */
  async getScreenCenter(blockId: string): Promise<ScreenCoordinates> {
    const geometry = await this.getGeometry(blockId);
    const cameraState = await this.camera.getState();

    const worldCenter = CoordinateTransformer.getRectCenter(geometry);
    return CoordinateTransformer.worldToScreen(worldCenter, cameraState);
  }

  /**
   * Click on block by ID
   */
  async click(
    blockId: string,
    options?: { shift?: boolean; ctrl?: boolean; meta?: boolean }
  ): Promise<void> {
    // Get screen position relative to canvas (not viewport)
    const canvasPos = await this.getScreenCenter(blockId);

    // Get canvas bounds to convert to viewport coordinates
    const canvasBounds = await this.page.evaluate(() => {
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
      };
    });

    // Calculate viewport coordinates
    const viewportX = canvasPos.x + canvasBounds.left;
    const viewportY = canvasPos.y + canvasBounds.top;

    // Emulate full click sequence with correct coordinates and modifiers
    await this.page.evaluate(
      ({ canvasX, canvasY, viewportX, viewportY, modifiers }) => {
        const canvas = window.graph.getGraphCanvas();

        const createMouseEvent = (type: string) => {
          return new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: viewportX,
            clientY: viewportY,
            screenX: viewportX,
            screenY: viewportY,
            pageX: viewportX + window.scrollX,
            pageY: viewportY + window.scrollY,
            button: 0,
            shiftKey: modifiers.shift || false,
            ctrlKey: modifiers.ctrl || false,
            metaKey: modifiers.meta || false,
          });
        };

        // Full sequence for proper click emulation
        canvas.dispatchEvent(createMouseEvent("mousemove"));
        canvas.dispatchEvent(createMouseEvent("mousedown"));
        canvas.dispatchEvent(createMouseEvent("mouseup"));
        canvas.dispatchEvent(createMouseEvent("click"));
      },
      {
        canvasX: canvasPos.x,
        canvasY: canvasPos.y,
        viewportX,
        viewportY,
        modifiers: options || {},
      }
    );

    // Wait for scheduler to process the click
    await this.waitForFrames(2);
  }

  /**
   * Double click on block by ID
   */
  async doubleClick(blockId: string): Promise<void> {
    const screenPos = await this.getScreenCenter(blockId);
    await this.page.mouse.dblclick(screenPos.x, screenPos.y);
  }

  /**
   * Drag block to new world position
   */
  async dragTo(blockId: string, toWorldPos: WorldCoordinates): Promise<void> {
    const fromScreen = await this.getScreenCenter(blockId);
    const cameraState = await this.camera.getState();
    const toScreen = CoordinateTransformer.worldToScreen(
      toWorldPos,
      cameraState
    );

    await this.page.mouse.move(fromScreen.x, fromScreen.y);
    await this.waitForFrames(1);
    
    await this.page.mouse.down();
    await this.waitForFrames(1);
    
    await this.page.mouse.move(toScreen.x, toScreen.y, { steps: 10 });
    await this.waitForFrames(2);
    
    await this.page.mouse.up();
    await this.waitForFrames(2);
  }

  /**
   * Check if block is selected
   */
  async isSelected(blockId: string): Promise<boolean> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      return blockState?.selected || false;
    }, blockId);
  }

  /**
   * Get all selected block IDs
   */
  async getSelected(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const selection = window.graph.selectionService.$selection.value;
      const blockSelection = selection.get("block");
      return blockSelection ? Array.from(blockSelection) : [];
    });
  }
}
