import { Page } from "@playwright/test";
import {
  CoordinateTransformer,
  ScreenCoordinates,
  WorldCoordinates,
  Rect,
} from "../utils/CoordinateTransformer";
import { CameraPageObject } from "./CameraPageObject";
import type { GraphPageObject } from "./GraphPageObject";

export class BlockPageObject {
  private get camera(): CameraPageObject {
    return this.graphPO.camera;
  }
  constructor(
    private page: Page,
    private graphPO: GraphPageObject
  ) {
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

    // Determine modifier key based on platform
    // On macOS, Cmd (Meta) is used for multi-selection, not Ctrl
    let modifierKey: "Shift" | "Control" | "Meta" | null = null;
    if (options?.shift) {
      modifierKey = "Shift";
    } else if (options?.ctrl || options?.meta) {
      const isMac = await this.page.evaluate(() =>
        navigator.platform.toLowerCase().includes("mac")
      );
      modifierKey = isMac ? "Meta" : "Control";
    }

    // Press modifier key before click (Playwright's modifiers array doesn't work properly)
    if (modifierKey) {
      await this.page.keyboard.down(modifierKey);
    }

    // Perform the click
    await this.page.mouse.click(viewportX, viewportY);

    // Release modifier key after click
    if (modifierKey) {
      await this.page.keyboard.up(modifierKey);
    }

    // Wait for scheduler to process the click
    await this.graphPO.waitForFrames(2);
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
    // Get block geometry in world coordinates
    const geometry = await this.getGeometry(blockId);
    const fromWorldPos = CoordinateTransformer.getRectCenter(geometry);

    // Get camera state for coordinate transformation
    const cameraState = await this.camera.getState();

    // Transform both positions to screen coordinates (canvas-relative)
    const fromScreen = CoordinateTransformer.worldToScreen(
      fromWorldPos,
      cameraState
    );
    const toScreen = CoordinateTransformer.worldToScreen(
      toWorldPos,
      cameraState
    );

    // Get canvas bounds to convert to viewport coordinates
    const canvasBounds = await this.page.evaluate(() => {
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
      };
    });

    // Convert canvas-relative to viewport coordinates
    const fromViewportX = fromScreen.x + canvasBounds.left;
    const fromViewportY = fromScreen.y + canvasBounds.top;
    const toViewportX = toScreen.x + canvasBounds.left;
    const toViewportY = toScreen.y + canvasBounds.top;

    // Perform drag using Playwright's mouse API
    // Step 1: Move to start position
    await this.page.mouse.move(fromViewportX, fromViewportY);
    // Step 2: Press mouse button
    await this.page.mouse.down();
    await this.graphPO.waitForFrames(5);
    
    // Step 3: Move to end position with steps for smooth drag
    await this.page.mouse.move(toViewportX, toViewportY, { steps: 10 });

    await this.graphPO.waitForFrames(5);
    
    // Step 4: Release mouse button
    await this.page.mouse.up();

    // Wait for drag to be processed and changes to be applied
    await this.graphPO.waitForFrames(20);
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
