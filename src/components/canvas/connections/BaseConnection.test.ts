import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { ConnectionsStore } from "../../../store/connection/ConnectionList";
import { ConnectionState, TConnection } from "../../../store/connection/ConnectionState";
import { PortState } from "../../../store/connection/port/Port";

import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";

const props: TConnectionProps = {
  id: "c",
  useBezier: false,
  bezierDirection: "horizontal",
  showConnectionArrows: false,
  showConnectionLabels: false,
};

type TSetup = {
  store: ConnectionsStore;
  state: ConnectionState;
  view: BlockConnection<TConnection>;
};

function setup(): TSetup {
  // Ports "s" and "t" have no owner: they exist only while someone observes them.
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const store = graph.rootStore.connectionsList;
  const state = store.getConnectionState("c");
  if (!state) throw new Error("Expected connection");

  const view = new BlockConnection<TConnection>(props, new BlockConnections({}, graph.getGraphLayer()));
  // The first iteration runs willMount(), which subscribes the view to its ports.
  view.iterate();

  return { store, state, view };
}

function getPort(store: ConnectionsStore, id: string): PortState {
  const port = store.getPort(id);
  if (!port) throw new Error(`Expected port ${id}`);
  return port;
}

describe("BaseConnection port observers", () => {
  it("moves its observer to the new port when the connection is retargeted", () => {
    const { store, state, view } = setup();
    const oldPort = getPort(store, "t");
    expect(oldPort.observers.has(view)).toBe(true);

    state.updateConnection({ targetPortId: "t2" });

    expect(getPort(store, "t2").observers.has(view)).toBe(true);
    expect(oldPort.observers.has(view)).toBe(false);
    expect(getPort(store, "s").observers.has(view)).toBe(true);

    Component.unmount(view);
  });

  it("does not keep the old ownerless port alive after retargeting", () => {
    const { store, state, view } = setup();

    state.updateConnection({ targetPortId: "t2" });
    // The connection state's own observation of the old port is not the view's concern;
    // release it so that only the view could still be holding the port.
    store.unobservePort("t", state);

    expect(store.hasPort("t")).toBe(false);

    Component.unmount(view);
  });

  it("keeps observing a port that the other end still uses", () => {
    const { store, state, view } = setup();

    state.updateConnection({ targetPortId: "s" });
    state.updateConnection({ targetPortId: "t2" });

    expect(getPort(store, "s").observers.has(view)).toBe(true);
    expect(getPort(store, "t2").observers.has(view)).toBe(true);

    Component.unmount(view);
  });

  it("releases the ports it observes on unmount and deletes the ownerless ones", () => {
    const { store, state, view } = setup();
    state.updateConnection({ targetPortId: "t2" });
    const oldPort = getPort(store, "t");
    const newPort = getPort(store, "t2");

    store.deleteConnections([state]);
    Component.unmount(view);

    expect(newPort.observers.has(view)).toBe(false);
    expect(oldPort.observers.has(view)).toBe(false);
    expect(store.hasPort("s")).toBe(false);
    expect(store.hasPort("t2")).toBe(false);
  });
});
