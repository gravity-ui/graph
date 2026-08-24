import type { TConnection, TConnectionId } from "../store/connection/ConnectionState";

import type { GraphPO } from "./GraphPO";
import type { GraphClickOptions, GraphHoverOptions, GraphPoint } from "./types";

export type GraphConnectionActionOptions = GraphClickOptions & {
  curveTime?: number;
};

export class GraphConnectionPO {
  constructor(
    private readonly graph: GraphPO,
    public readonly id: TConnectionId
  ) {}

  public async exists(): Promise<boolean> {
    return this.graph.evaluate(
      (graph, connectionId) => Boolean(graph.connections.getConnectionState(connectionId)),
      this.id
    );
  }

  public async getState(): Promise<TConnection | null> {
    return this.graph.evaluate((graph, connectionId) => graph.connections.getConnection(connectionId) ?? null, this.id);
  }

  public async isSelected(): Promise<boolean> {
    return this.graph.evaluate(
      (graph, connectionId) => graph.connections.getConnectionState(connectionId)?.$selected.value ?? false,
      this.id
    );
  }

  public async getPointOnCurve(time = 0.5): Promise<GraphPoint> {
    if (time < 0 || time > 1) {
      throw new Error("curveTime must be between 0 and 1.");
    }

    const geometry = await this.graph.evaluate((graph, connectionId) => {
      const connection = graph.connections.getConnectionState(connectionId);
      if (!connection) {
        throw new Error(`Connection ${connectionId} was not found.`);
      }

      const view = connection.getViewComponent();
      if (!view?.connectionPoints) {
        throw new Error(`Connection ${connectionId} has no rendered geometry.`);
      }

      return {
        start: view.connectionPoints[0],
        end: view.connectionPoints[1],
        useBezier: graph.rootStore.settings.getConfigFlag("useBezierConnections"),
        direction: graph.rootStore.settings.getConfigFlag("bezierConnectionDirection") ?? "horizontal",
      };
    }, this.id);

    if (!geometry.useBezier) {
      return {
        x: geometry.start.x + (geometry.end.x - geometry.start.x) * time,
        y: geometry.start.y + (geometry.end.y - geometry.start.y) * time,
      };
    }

    const distance = Math.abs(geometry.end.x - geometry.start.x);
    const coefficient = geometry.direction === "horizontal" ? Math.max(distance / 2, 25) : 0;
    const coefficientY = geometry.direction === "vertical" ? Math.max(distance / 2, 25) : 0;
    const p0 = geometry.start;
    const p1 = { x: p0.x + coefficient, y: p0.y + coefficientY };
    const p3 = geometry.end;
    const p2 = { x: p3.x - coefficient, y: p3.y - coefficientY };
    const inverseTime = 1 - time;

    return {
      x:
        inverseTime ** 3 * p0.x +
        3 * inverseTime ** 2 * time * p1.x +
        3 * inverseTime * time ** 2 * p2.x +
        time ** 3 * p3.x,
      y:
        inverseTime ** 3 * p0.y +
        3 * inverseTime ** 2 * time * p1.y +
        3 * inverseTime * time ** 2 * p2.y +
        time ** 3 * p3.y,
    };
  }

  public async click(options: GraphConnectionActionOptions = {}): Promise<void> {
    const { curveTime = 0.5, ...clickOptions } = options;
    await this.graph.clickAt(await this.getPointOnCurve(curveTime), clickOptions);
  }

  public async hover(options: GraphHoverOptions & { curveTime?: number } = {}): Promise<void> {
    const { curveTime = 0.5, ...hoverOptions } = options;
    await this.graph.hoverAt(await this.getPointOnCurve(curveTime), hoverOptions);
  }
}
