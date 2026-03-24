import { Page } from "@playwright/test";
import type { GraphPageObject } from "./GraphPageObject";
import type { WorldCoordinates } from "./GraphBlockComponentObject";

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
      const connState = window.graph.connections.getConnectionState(id);
      if (!connState) return false;
      return connState.$selected.value;
    }, this.connectionId);
  }

  /**
   * Get the world coordinates of a point on the connection's bezier curve at a given time (0..1).
   * Falls back to linear interpolation for non-bezier connections.
   */
  async getPointOnCurve(time: number = 0.5): Promise<WorldCoordinates> {
    return await this.page.evaluate(
      ({ connectionId, curveTime }) => {
        const connState = window.graph.connections.getConnectionState(connectionId);
        if (!connState) {
          throw new Error(`Connection ${connectionId} not found`);
        }
        const view = connState.getViewComponent();
        if (!view || !view.connectionPoints) {
          throw new Error(`Connection ${connectionId} has no rendered view`);
        }
        const start = view.connectionPoints[0];
        const end = view.connectionPoints[1];

        const settings = window.graph.rootStore.settings;
        const useBezier = settings.getConfigFlag("useBezierConnections");

        if (useBezier) {
          const direction = settings.getConfigFlag("bezierConnectionDirection") || "horizontal";
          const { generateBezierParams } = window.GraphModule;
          const [p0, p1, p2, p3] = generateBezierParams(start, end, direction);
          const inverseTime = 1 - curveTime;
          const startWeight = Math.pow(inverseTime, 3);
          const startControlWeight = 3 * Math.pow(inverseTime, 2) * curveTime;
          const endControlWeight = 3 * inverseTime * Math.pow(curveTime, 2);
          const endWeight = Math.pow(curveTime, 3);
          return {
            x: startWeight * p0.x + startControlWeight * p1.x + endControlWeight * p2.x + endWeight * p3.x,
            y: startWeight * p0.y + startControlWeight * p1.y + endControlWeight * p2.y + endWeight * p3.y,
          };
        }

        // Linear fallback
        return {
          x: start.x + (end.x - start.x) * curveTime,
          y: start.y + (end.y - start.y) * curveTime,
        };
      },
      { connectionId: this.connectionId, curveTime: time }
    );
  }

  /**
   * Click on the connection at a point along its curve
   */
  async click(options?: {
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    waitFrames?: number;
    curveTime?: number;
  }): Promise<void> {
    const point = await this.getPointOnCurve(options?.curveTime ?? 0.5);
    await this.graphPO.click(point.x, point.y, options);
  }

  /**
   * Hover over the connection at a point along its curve
   */
  async hover(options?: {
    waitFrames?: number;
    curveTime?: number;
  }): Promise<void> {
    const point = await this.getPointOnCurve(options?.curveTime ?? 0.5);
    await this.graphPO.hover(point.x, point.y, options);
  }
}
