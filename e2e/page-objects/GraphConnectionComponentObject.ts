import { Page } from "@playwright/test";
import type { GraphPageObject } from "./GraphPageObject";

export interface ConnectionState {
  id: string | number;
  sourceBlockId: string | number;
  sourceAnchorId?: string;
  targetBlockId: string | number;
  targetAnchorId?: string;
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
   * Check if connection is selected
   */
  async isSelected(): Promise<boolean> {
    return await this.page.evaluate((id) => {
      const conn = window.graph.connections.getConnection(id);
      return conn?.selected || false;
    }, this.connectionId);
  }
}
