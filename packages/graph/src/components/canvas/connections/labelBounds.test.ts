import { Graph } from "../../../graph";
import { Component } from "../../../lib";

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

test("multipoint bounds include its label before drawing and discard removed labels", () => {
  const connection: TMultipointConnection = {
    id: "c",
    points: [
      { x: 2000, y: 0 },
      { x: 2100, y: 0 },
    ],
    labels: [{ x: 100, y: 100, width: 50, height: 20, text: "label" }],
  };
  const graph = new Graph({
    connections: [connection],
  });
  const view = new MultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));

  view.updatePoints();
  expect(view.getBBox()).toEqual([100, 0, 2100, 120]);
  const patch: TMultipointConnection = { id: "c", labels: [] };
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.updateConnection(patch);
  view.updatePoints();
  expect(view.getBBox()).toEqual([2000, 0, 2100, 0]);
  Component.unmount(view);
  graph.unmount();
});

test("offscreen multipoint geometry is available to world hit queries before drawing", () => {
  const connection: TMultipointConnection = {
    id: "c",
    points: [
      { x: 2000, y: 0 },
      { x: 2100, y: 0 },
    ],
  };
  const graph = new Graph({
    connections: [connection],
  });
  const view = new MultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));
  view.updatePoints();
  const hit = jest.spyOn(view.context.ctx, "isPointInStroke");
  view.onHitBox({ x: 2050, y: 0, minX: 2050, maxX: 2050, minY: 0, maxY: 0 });
  const path = hit.mock.calls[0][0] as Path2D;
  expect(path.lineTo).toHaveBeenCalledWith(2100, 0);
  Component.unmount(view);
  graph.unmount();
});

test("bezier multipoint bounds include curve extrema outside its endpoints", () => {
  const connection: TMultipointConnection = {
    id: "c",
    points: [
      { x: 700, y: 100 },
      { x: 0, y: 350 },
    ],
  };
  const graph = new Graph({ connections: [connection] });
  const view = new BezierMultipointConnection(props, new BlockConnections({}, graph.getGraphLayer()));
  view.updatePoints();
  const bounds = view.getBBox();
  expect(bounds[0]).toBeCloseTo(-56.6633, 3);
  expect(bounds[2]).toBeCloseTo(756.6633, 3);
  Component.unmount(view);
  graph.unmount();
});
