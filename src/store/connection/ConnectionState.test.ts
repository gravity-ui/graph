import { batch, computed, effect } from "@preact/signals-core";

import { Graph } from "../../graph";
import { Component } from "../../lib";

import { ConnectionsStore } from "./ConnectionList";
import { TConnection, TConnectionId } from "./ConnectionState";
import { TPortId } from "./port/Port";
import { createAnchorPortId, createBlockPointPortId } from "./port/utils";

class PortOwner extends Component {
  constructor() {
    super({}, null);
  }
}

function connectionIdsOf(store: ConnectionsStore, portId: TPortId): TConnectionId[] {
  return [...(store.getPort(portId)?.$connections.value ?? [])].map((connection) => connection.id);
}

type TEndpointMode = {
  name: string;
  connection: TConnection;
  sourcePortId: TPortId;
  targetPortId: TPortId;
  retargetSource: Partial<TConnection>;
  newSourcePortId: TPortId;
  retargetTarget: Partial<TConnection>;
  newTargetPortId: TPortId;
};

const endpointModes: TEndpointMode[] = [
  {
    name: "block points",
    connection: { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
    sourcePortId: createBlockPointPortId("a", false),
    targetPortId: createBlockPointPortId("b", true),
    retargetSource: { sourceBlockId: "c" },
    newSourcePortId: createBlockPointPortId("c", false),
    retargetTarget: { targetBlockId: "d" },
    newTargetPortId: createBlockPointPortId("d", true),
  },
  {
    name: "anchors",
    connection: { id: "c1", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" },
    sourcePortId: createAnchorPortId("a", "out"),
    targetPortId: createAnchorPortId("b", "in"),
    retargetSource: { sourceAnchorId: "out-2" },
    newSourcePortId: createAnchorPortId("a", "out-2"),
    retargetTarget: { targetBlockId: "c" },
    newTargetPortId: createAnchorPortId("c", "in"),
  },
  {
    name: "custom ports",
    connection: { id: "c1", sourcePortId: "p1", targetPortId: "p2" },
    sourcePortId: "p1",
    targetPortId: "p2",
    retargetSource: { sourcePortId: "p3" },
    newSourcePortId: "p3",
    retargetTarget: { targetPortId: "p4" },
    newTargetPortId: "p4",
  },
];

describe.each(endpointModes)("port connections with $name", (mode) => {
  let store: ConnectionsStore;

  beforeEach(() => {
    store = new Graph({}).rootStore.connectionsList;
    store.setConnections([mode.connection]);
  });

  it("lists a new connection on both of its ports", () => {
    expect(connectionIdsOf(store, mode.sourcePortId)).toEqual(["c1"]);
    expect(connectionIdsOf(store, mode.targetPortId)).toEqual(["c1"]);
  });

  it("moves the connection to the new port when the source is retargeted", () => {
    const oldPort = store.getPort(mode.sourcePortId);

    store.getConnectionState("c1").updateConnection(mode.retargetSource);

    expect(oldPort.$connections.value.size).toBe(0);
    expect(store.getPort(mode.sourcePortId)).toBeUndefined();
    expect(connectionIdsOf(store, mode.newSourcePortId)).toEqual(["c1"]);
    expect(connectionIdsOf(store, mode.targetPortId)).toEqual(["c1"]);
  });

  it("moves the connection to the new port when the target is retargeted", () => {
    const oldPort = store.getPort(mode.targetPortId);

    store.getConnectionState("c1").updateConnection(mode.retargetTarget);

    expect(oldPort.$connections.value.size).toBe(0);
    expect(store.getPort(mode.targetPortId)).toBeUndefined();
    expect(connectionIdsOf(store, mode.newTargetPortId)).toEqual(["c1"]);
    expect(connectionIdsOf(store, mode.sourcePortId)).toEqual(["c1"]);
  });

  it("keeps an owned port in the store after the connection leaves it", () => {
    const port = store.claimPort(mode.sourcePortId, new PortOwner());
    expect(connectionIdsOf(store, mode.sourcePortId)).toEqual(["c1"]);

    store.getConnectionState("c1").updateConnection(mode.retargetSource);

    expect(store.getPort(mode.sourcePortId)).toBe(port);
    expect(port.$connections.value.size).toBe(0);
  });

  it("removes the connection from both ports when it is deleted", () => {
    const sourcePort = store.getPort(mode.sourcePortId);
    const targetPort = store.getPort(mode.targetPortId);

    store.deleteConnections([store.getConnectionState("c1")]);

    expect(sourcePort.$connections.value.size).toBe(0);
    expect(targetPort.$connections.value.size).toBe(0);
  });

  it("keeps the connection on a lazily created port after an owner claims it", () => {
    const lazyPort = store.getPort(mode.sourcePortId);
    expect(lazyPort.owner).toBeUndefined();
    expect(connectionIdsOf(store, mode.sourcePortId)).toEqual(["c1"]);

    const claimedPort = store.claimPort(mode.sourcePortId, new PortOwner());

    expect(claimedPort).toBe(lazyPort);
    expect(connectionIdsOf(store, mode.sourcePortId)).toEqual(["c1"]);
  });
});

describe("ConnectionState port relation", () => {
  let store: ConnectionsStore;

  beforeEach(() => {
    store = new Graph({}).rootStore.connectionsList;
  });

  it("moves the connection when an anchor endpoint becomes a block point", () => {
    store.setConnections([{ id: "c1", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b" }]);

    store.getConnectionState("c1").updateConnection({ sourceAnchorId: undefined });

    expect(store.getPort(createAnchorPortId("a", "out"))).toBeUndefined();
    expect(connectionIdsOf(store, createBlockPointPortId("a", false))).toEqual(["c1"]);
  });

  it("lists a self-loop once and keeps it while one end stays on the port", () => {
    store.setConnections([{ id: "loop", sourcePortId: "p", targetPortId: "p" }]);
    expect(connectionIdsOf(store, "p")).toEqual(["loop"]);

    store.getConnectionState("loop").updateConnection({ targetPortId: "q" });

    expect(connectionIdsOf(store, "p")).toEqual(["loop"]);
    expect(connectionIdsOf(store, "q")).toEqual(["loop"]);
  });

  it("does not notify a port about changes of other ports", () => {
    store.setConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }]);
    const port = store.getPort(createBlockPointPortId("a", false));
    const notifications: ReadonlySet<unknown>[] = [];
    const dispose = effect(() => {
      notifications.push(port.$connections.value);
    });

    store.addConnection({ id: "c2", sourceBlockId: "c", targetBlockId: "d" });
    store.setConnectionsSelection(["c1"], true);

    expect(notifications).toHaveLength(1);
    dispose();
  });

  it("lets a port derive whether any of its connections is selected", () => {
    store.setConnections([
      { id: "c1", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" },
      { id: "c2", sourceBlockId: "c", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" },
    ]);
    const port = store.getPort(createAnchorPortId("b", "in"));
    const hasSelectedConnection = computed(() =>
      [...port.$connections.value].some((connection) => connection.$selected.value)
    );
    expect(hasSelectedConnection.value).toBe(false);

    store.setConnectionsSelection(["c2"], true);
    expect(hasSelectedConnection.value).toBe(true);

    store.setConnectionsSelection(["c2"], false);
    expect(hasSelectedConnection.value).toBe(false);
  });

  it("does not observe its ports again when they are read after deletion", () => {
    store.setConnections([{ id: "c1", sourcePortId: "p1", targetPortId: "p2" }]);
    const state = store.getConnectionState("c1");

    store.deleteConnections([state]);

    expect(state.$sourcePortState.value.id).toBe("p1");
    expect(state.$targetPortState.value.id).toBe("p2");
    expect(store.getPort("p1")).toBeUndefined();
    expect(store.getPort("p2")).toBeUndefined();
  });

  it("reports the new port right away when it is retargeted inside a batch", () => {
    store.setConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }]);
    const state = store.getConnectionState("c1");
    let sourcePortIdInBatch: TPortId | undefined;
    let sourceConnectionsInBatch: TConnectionId[] = [];

    batch(() => {
      state.updateConnection({ sourceBlockId: "c" });
      sourcePortIdInBatch = state.$sourcePortState.value.id;
      sourceConnectionsInBatch = connectionIdsOf(store, createBlockPointPortId("c", false));
    });

    expect(sourcePortIdInBatch).toBe(createBlockPointPortId("c", false));
    expect(sourceConnectionsInBatch).toEqual(["c1"]);
  });
});

describe("Graph operations keep PortState.$connections in sync", () => {
  let graph: Graph;
  let store: ConnectionsStore;

  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.connectionsList;
    graph.setEntities({
      connections: [
        { id: "c1", sourceBlockId: "a", targetBlockId: "b" },
        { id: "c2", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "c", targetAnchorId: "in" },
      ],
    });
  });

  it("moves a connection retargeted through updateEntities", () => {
    graph.updateEntities({ connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "d" }] });

    expect(store.getPort(createBlockPointPortId("b", true))).toBeUndefined();
    expect(connectionIdsOf(store, createBlockPointPortId("d", true))).toEqual(["c1"]);
  });

  it("detaches the connections of a block deleted with its connections", () => {
    const blockPointPort = store.getPort(createBlockPointPortId("a", false));
    const anchorPort = store.getPort(createAnchorPortId("a", "out"));

    graph.rootStore.blocksList.deleteAllBlockConnections("a");

    expect(blockPointPort.$connections.value.size).toBe(0);
    expect(anchorPort.$connections.value.size).toBe(0);
  });
});
