import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";

const props = {
  id: "c",
  useBezier: false,
  bezierDirection: "horizontal" as const,
  showConnectionArrows: true,
  showConnectionLabels: true,
};
class TestConnection extends BlockConnection<TConnection> {
  public refresh() {
    this.updatePoints();
  }
  public bounds() {
    return this.getBBox();
  }
}

test("missing endpoint geometry does not create an origin hitbox or visible path", () => {
  const graph = new Graph({ connections: [{ id: "c" }] });
  const parent = new BlockConnections({}, graph.getGraphLayer());
  const view = new TestConnection(props, parent);
  view.refresh();
  expect(view.connectionPoints).toBeUndefined();
  expect(view.bounds()).toEqual([0, 0, 0, 0]);
  expect(view.isPathVisible()).toBe(false);
  Component.unmount(view);
  expect(view.isEntityAvailable()).toBe(false);
});

test.each([{ points: [] }, { points: [{ x: 1, y: 2 }] }])(
  "minimal multipoint geometry %j has finite bounds and empty arrow",
  ({ points }) => {
    const connection = { id: "c", points };
    const graph = new Graph({ connections: [connection] });
    const parent = new BlockConnections({}, graph.getGraphLayer());
    const view = new MultipointConnection(props, parent);
    view.updatePoints();
    expect(view.createArrowPath()).toBeInstanceOf(Path2D);
    expect(view.getBBox().every(Number.isFinite)).toBe(true);
    expect(view.isPathVisible()).toBe(false);
    Component.unmount(view);
  }
);
