import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { HitTest } from "../../../services/HitTest";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";

class TestHitTest extends HitTest {
  public flush() {
    this.processQueue.flush();
  }
}

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

test("restoring endpoint geometry at unchanged coordinates restores hit testing", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const hitTest = new TestHitTest(graph);
  graph.hitTest = hitTest;
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  const source = state.$sourcePortState.value;
  source.updatePort({ x: 10, y: 10, lookup: false });
  state.$targetPortState.value.updatePort({ x: 100, y: 100, lookup: false });
  const parent = new BlockConnections({}, graph.getGraphLayer());
  const view = new TestConnection(props, parent);
  const search = { minX: 0, minY: 0, maxX: 110, maxY: 110 };
  view.refresh();
  hitTest.flush();
  expect(graph.hitTest.testBox(search)).toContain(view);
  source.removeOwner();
  view.refresh();
  hitTest.flush();
  expect(graph.hitTest.testBox(search)).not.toContain(view);
  source.updatePort({ lookup: false });
  view.refresh();
  hitTest.flush();
  expect(graph.hitTest.testBox(search)).toContain(view);
  Component.unmount(view);
});
