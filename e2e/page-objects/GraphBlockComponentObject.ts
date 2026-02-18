import { Page } from "@playwright/test";
import type { GraphPageObject } from "./GraphPageObject";

export interface WorldCoordinates {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Component Object Model for a specific graph block
 * Provides methods to interact with and query a single block
 */
export class GraphBlockComponentObject {
  constructor(
    private blockId: string,
    private page: Page,
    private graphPO: GraphPageObject
  ) {}

  /**
   * Get block geometry (position and size in world coordinates)
   */
  async getGeometry(): Promise<Rect> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      if (!blockState) {
        throw new Error(`Block ${id} not found`);
      }
      return blockState.$geometry.value;
    }, this.blockId);
  }

  /**
   * Get block state
   */
  async getState(): Promise<any> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      if (!blockState) {
        throw new Error(`Block ${id} not found`);
      }
      return {
        id: blockState.id,
        x: blockState.x,
        y: blockState.y,
        width: blockState.width,
        height: blockState.height,
        selected: blockState.selected,
      };
    }, this.blockId);
  }

  /**
   * Get world coordinates of block center
   */
  async getWorldCenter(): Promise<WorldCoordinates> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      if (!blockState) {
        throw new Error(`Block ${id} not found`);
      }
      const geometry = blockState.$geometry.value;

      return {
        x: geometry.x + geometry.width / 2,
        y: geometry.y + geometry.height / 2,
      };
    }, this.blockId);
  }

  /**
   * Click on the block
   */
  async click(options?: {
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    waitFrames?: number;
  }): Promise<void> {
    const worldCenter = await this.getWorldCenter();
    await this.graphPO.click(worldCenter.x, worldCenter.y, options);
  }

  /**
   * Double click on the block
   */
  async doubleClick(options?: { waitFrames?: number }): Promise<void> {
    const worldCenter = await this.getWorldCenter();
    await this.graphPO.doubleClick(worldCenter.x, worldCenter.y, options);
  }

  /**
   * Hover over the block
   */
  async hover(options?: { waitFrames?: number }): Promise<void> {
    const worldCenter = await this.getWorldCenter();
    await this.graphPO.hover(worldCenter.x, worldCenter.y, options);
  }

  /**
   * Drag block to new world position
   */
  async dragTo(
    toWorldPos: WorldCoordinates,
    options?: { waitFrames?: number }
  ): Promise<void> {
    const fromWorldPos = await this.getWorldCenter();
    await this.graphPO.dragTo(
      fromWorldPos.x,
      fromWorldPos.y,
      toWorldPos.x,
      toWorldPos.y,
      options
    );
  }

  /**
   * Check if block is selected
   */
  async isSelected(): Promise<boolean> {
    return await this.page.evaluate((id) => {
      const blockState = window.graph.blocks.getBlockState(id);
      return blockState?.selected || false;
    }, this.blockId);
  }

  /**
   * Get block ID
   */
  getId(): string {
    return this.blockId;
  }
}
