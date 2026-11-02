import { effect } from "@preact/signals-core";

import { Graph } from "../../graph";

import { ConnectionsStore } from "./ConnectionList";
import { ConnectionState, TConnectionId } from "./ConnectionState";
import { TPortId } from "./port/Port";
import { createAnchorPortId, createBlockPointPortId } from "./port/utils";

function connectionsOf(store: ConnectionsStore, portId: TPortId): ConnectionState[] {
  return [...(store.getPort(portId)?.$connections.value ?? [])];
}

describe("ConnectionsStore keeps PortState.$connections in sync", () => {
  let store: ConnectionsStore;

  beforeEach(() => {
    store = new Graph({}).rootStore.connectionsList;
  });

  it("detaches connections that setConnections drops", () => {
    store.setConnections([
      { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
      { id: "c2", sourceBlockId: "a", targetBlockId: "c" },
    ]);
    const droppedTargetPort = store.getPort(createBlockPointPortId("c", true));

    store.setConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }]);

    expect(connectionsOf(store, createBlockPointPortId("a", false)).map((c) => c.id)).toEqual(["c1"]);
    expect(droppedTargetPort.$connections.value.size).toBe(0);
    expect(store.getPort(createBlockPointPortId("c", true))).toBeUndefined();
  });

  it("keeps one state on the port when setConnections gets the same id twice", () => {
    store.setConnections([
      { sourceBlockId: "a", targetBlockId: "b" },
      { sourceBlockId: "a", targetBlockId: "b", label: "second" },
    ]);

    const connections = connectionsOf(store, createBlockPointPortId("a", false));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toBe(store.getConnectionState("a:b"));
  });

  it("keeps one state on the port when addConnection reuses an id", () => {
    const firstId = store.addConnection({ id: "c1", sourceBlockId: "a", targetBlockId: "b" });
    const secondId = store.addConnection({ id: "c1", sourceBlockId: "a", targetBlockId: "b", label: "updated" });

    const connections = connectionsOf(store, createBlockPointPortId("a", false));
    expect(secondId).toBe(firstId);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toBe(store.getConnectionState("c1"));
    expect(store.getConnection("c1").label).toBe("updated");
  });

  it("detaches every connection on reset", () => {
    store.setConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }]);
    const port = store.getPort(createBlockPointPortId("a", false));

    store.reset();

    expect(port.$connections.value.size).toBe(0);
  });

  it("replaces the data of a connection that addConnection gets again", () => {
    store.addConnection({ id: "x", sourcePortId: "custom", targetPortId: "t", label: "first" });

    store.addConnection({
      id: "x",
      sourceBlockId: "A",
      sourceAnchorId: "out",
      targetBlockId: "B",
      targetAnchorId: "in",
    });

    expect(connectionsOf(store, createAnchorPortId("A", "out")).map((c) => c.id)).toEqual(["x"]);
    expect(store.getPort("custom")).toBeUndefined();
    expect(store.getConnection("x").label).toBeUndefined();
  });
});

describe("ConnectionsStore notifies port subscribers once per operation", () => {
  let store: ConnectionsStore;

  beforeEach(() => {
    store = new Graph({}).rootStore.connectionsList;
    store.setConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }]);
  });

  function watchPort(portId: TPortId): { runs: () => number; unresolved: TConnectionId[]; dispose: () => void } {
    const port = store.getPort(portId);
    const unresolved: TConnectionId[] = [];
    let runs = 0;
    const dispose = effect(() => {
      runs++;
      port.$connections.value.forEach((connection) => {
        if (store.getConnectionState(connection.id) !== connection) {
          unresolved.push(connection.id);
        }
      });
    });
    return { runs: () => runs, unresolved, dispose };
  }

  it("setConnections", () => {
    const watcher = watchPort(createBlockPointPortId("a", false));

    store.setConnections([
      { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
      { id: "c2", sourceBlockId: "a", targetBlockId: "c" },
      { id: "c3", sourceBlockId: "a", targetBlockId: "d" },
    ]);

    expect(watcher.runs()).toBe(2);
    expect(watcher.unresolved).toEqual([]);
    watcher.dispose();
  });

  it("deleteConnections", () => {
    store.setConnections([
      { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
      { id: "c2", sourceBlockId: "a", targetBlockId: "c" },
      { id: "c3", sourceBlockId: "a", targetBlockId: "d" },
    ]);
    const watcher = watchPort(createBlockPointPortId("a", false));

    store.deleteConnections(store.getConnectionStates(["c2", "c3"]));

    expect(watcher.runs()).toBe(2);
    expect(watcher.unresolved).toEqual([]);
    watcher.dispose();
  });

  it("deleteSelectedConnections", () => {
    store.setConnections([
      { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
      { id: "c2", sourceBlockId: "a", targetBlockId: "c" },
    ]);
    store.setConnectionsSelection(["c1", "c2"], true);
    const watcher = watchPort(createBlockPointPortId("a", false));

    store.deleteSelectedConnections();

    expect(watcher.runs()).toBe(2);
    watcher.dispose();
  });
});
