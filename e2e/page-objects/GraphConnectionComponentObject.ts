import { Page } from "@playwright/test";
import type { GraphPageObject } from "./GraphPageObject";

export interface ConnectionState {
  id: string | number;
  sourceBlockId: string | number;
  sourceAnchorId?: string;
  targetBlockId: string | number;
  targetAnchorId?: string;
}

export interface WorldCoordinates {
  x: number;
  y: number;
}

/**
 * Component Object Model for a specific graph connection
 * Provides methods to interact with and query a single connection
 */
export class GraphConnectionComponentObject {
  constructor(
    private connectionId: string,
    private page: Page,
    private graphPO: GraphPageObject
  ) {}

  /**
   * Get connection state
   */
  async getState(): Promise<ConnectionState | null> {
    return await this.page.evaluate((id) => {
      const conn = window.graph.connections.getConnection(id);
      if (!conn) {
        return null;
      }
      return {
        id: conn.id,
        sourceBlockId: conn.sourceBlockId,
        sourceAnchorId: conn.sourceAnchorId,
        targetBlockId: conn.targetBlockId,
        targetAnchorId: conn.targetAnchorId,
      };
    }, this.connectionId);
  }

  /**
   * Check if connection exists
   */
  async exists(): Promise<boolean> {
    const state = await this.getState();
    return state !== null;
  }

  /**
   * Get connection ID
   */
  getId(): string {
    return this.connectionId;
  }

  /**
   * Check if connection is selected.
   * Uses the reactive selection bucket ($selected signal) for accurate state.
   */
  async isSelected(): Promise<boolean> {
    return await this.page.evaluate((id) => {
      const connState = window.graph.connections.getConnectionState(id);
      return connState?.$selected?.value || false;
    }, this.connectionId);
  }

  /**
   * Get the world-space midpoint of the connection line.
   * Returns null if the connection doesn't exist or ports are not yet resolved.
   */
  async getWorldMidpoint(): Promise<WorldCoordinates | null> {
    return await this.page.evaluate((id) => {
      const connState = window.graph.connections.getConnectionState(id);
      if (!connState) return null;
      const geometry = connState.$geometry?.value;
      if (!geometry) return null;
      const [source, target] = geometry;
      return {
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2,
      };
    }, this.connectionId);
  }

  /**
   * Hover over the midpoint of the connection
   */
  async hover(options?: { waitFrames?: number }): Promise<void> {
    const midpoint = await this.getWorldMidpoint();
    if (!midpoint) {
      throw new Error(`Cannot hover: midpoint for connection "${this.connectionId}" is not available`);
    }
    await this.graphPO.hover(midpoint.x, midpoint.y, options);
  }

  /**
   * Click the midpoint of the connection
   */
  async click(options?: { shift?: boolean; ctrl?: boolean; meta?: boolean; waitFrames?: number }): Promise<void> {
    const midpoint = await this.getWorldMidpoint();
    if (!midpoint) {
      throw new Error(`Cannot click: midpoint for connection "${this.connectionId}" is not available`);
    }
    await this.graphPO.click(midpoint.x, midpoint.y, options);
  }
}
