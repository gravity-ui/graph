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
  "unresolved minimal multipoint geometry %j stays finite and invisible",
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

test("multipoint without points falls back to resolved endpoint geometry without viewport culling", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ x: 10, y: 10, lookup: false });
  state.$targetPortState.value.updatePort({ x: 100, y: 100, lookup: false });
  const parent = new BlockConnections({}, graph.getGraphLayer());
  const view = new MultipointConnection(props, parent);
  view.updatePoints();
  const cameraCheck = jest.spyOn(graph.cameraService, "isRectVisible").mockReturnValue(false);
  expect(view.isPathVisible()).toBe(true);
  expect(cameraCheck).not.toHaveBeenCalled();
  expect(view.getBBox()).toEqual([10, 10, 100, 100]);
  expect(view.createPath().lineTo).toHaveBeenCalled();
  expect(view.createArrowPath().lineTo).toHaveBeenCalled();
  Component.unmount(view);
});
