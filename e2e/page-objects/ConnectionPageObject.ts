import { Page } from "@playwright/test";

export interface ConnectionData {
  id: string | number;
  sourceBlockId: string;
  sourceAnchorId?: string;
  targetBlockId: string;
  targetAnchorId?: string;
}

export class ConnectionPageObject {
  constructor(private page: Page) {}

  /**
   * Get all connections
   */
  async getAll(): Promise<any[]> {
    return await this.page.evaluate(() => {
      return window.graph.connections.toJSON();
    });
  }

  /**
   * Get connection by ID
   */
  async getById(connectionId: string): Promise<any | undefined> {
    return await this.page.evaluate((id) => {
      const conn = window.graph.connections.getConnection(id);
      return conn || undefined;
    }, connectionId);
  }

  /**
   * Check if connection exists between two blocks
   */
  async existsBetween(
    sourceBlockId: string,
    targetBlockId: string
  ): Promise<boolean> {
    return await this.page.evaluate(
      ({ sourceBlockId, targetBlockId }) => {
        const connections = window.graph.connections.toJSON();
        return connections.some(
          (conn: any) =>
            conn.sourceBlockId === sourceBlockId &&
            conn.targetBlockId === targetBlockId
        );
      },
      { sourceBlockId, targetBlockId }
    );
  }

  /**
   * Get number of connections
   */
  async getCount(): Promise<number> {
    return await this.page.evaluate(() => {
      return window.graph.connections.toJSON().length;
    });
  }
}
