import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import type { TPoint } from "../../../utils/types/shapes";

import { BezierMultipointConnection } from "./BezierMultipointConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";
import { TMultipointConnection } from "./types";

const props = {
  id: "c",
  useBezier: false,
  bezierDirection: "horizontal" as const,
  showConnectionArrows: true,
  showConnectionLabels: true,
};

class TestMultipointConnection extends MultipointConnection {
  public refresh(): void {
    this.updatePoints();
  }

  public bounds(): Readonly<[number, number, number, number]> {
    return this.getBBox();
  }
}

class TestBezierMultipointConnection extends BezierMultipointConnection {
  public refresh(): void {
    this.updatePoints();
  }

  public bounds(): Readonly<[number, number, number, number]> {
    return this.getBBox();
  }
}

/** A graph with the connection and its endpoints resolved at its first and last points. */
function createGraph(connection: TMultipointConnection, points: TPoint[]): Graph {
  const resolved: TMultipointConnection = { ...connection, sourcePortId: "s", targetPortId: "t", points };
  const graph = new Graph({ connections: [resolved] });
  const state = graph.connections.getConnectionState(connection.id ?? "c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ ...points[0], lookup: false });
  state.$targetPortState.value.updatePort({ ...points[points.length - 1], lookup: false });
  return graph;
}

test("multipoint bounds include its label before drawing and discard removed labels", () => {
  const connection: TMultipointConnection = {
    id: "c",
    labels: [{ x: 100, y: 100, width: 50, height: 20, text: "label" }],
  };
  const graph = createGraph(connection, [
    { x: 2000, y: 0 },
    { x: 2100, y: 0 },
  ]);
  const view = new TestMultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));

  view.refresh();
  expect(view.bounds()).toEqual([100, 0, 2100, 120]);
  const patch: TMultipointConnection = { id: "c", labels: [] };
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.updateConnection(patch);
  view.refresh();
  expect(view.bounds()).toEqual([2000, 0, 2100, 0]);
  Component.unmount(view);
  graph.unmount();
});

test("offscreen multipoint geometry is available to world hit queries before drawing", () => {
  const graph = createGraph({ id: "c" }, [
    { x: 2000, y: 0 },
    { x: 2100, y: 0 },
  ]);
  const view = new TestMultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));
  view.refresh();
  const hit = jest.spyOn(view.context.ctx, "isPointInStroke");
  view.onHitBox({ x: 2050, y: 0, minX: 2050, maxX: 2050, minY: 0, maxY: 0 });
  const path = hit.mock.calls[0][0] as Path2D;
  expect(path.lineTo).toHaveBeenCalledWith(2100, 0);
  Component.unmount(view);
  graph.unmount();
});

test("bezier multipoint bounds include curve extrema outside its endpoints", () => {
  const graph = createGraph({ id: "c" }, [
    { x: 700, y: 100 },
    { x: 0, y: 350 },
  ]);
  const view = new TestBezierMultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));
  view.refresh();
  const bounds = view.bounds();
  expect(bounds[0]).toBeCloseTo(-56.6633, 3);
  expect(bounds[2]).toBeCloseTo(756.6633, 3);
  Component.unmount(view);
  graph.unmount();
});
