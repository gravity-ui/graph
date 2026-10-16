import { TBlock } from "../../components/canvas/blocks/Block";
import { BlockConnection } from "../../components/canvas/connections/BlockConnection";
import { Graph } from "../../graph";
import { globalScheduler } from "../../lib/Scheduler";

import { ConnectionState, TConnection } from "./ConnectionState";

const createBlock = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 50,
  selected: false,
  anchors: [],
});

const blocks = [createBlock("a", 0), createBlock("b", 300)];

function tick(frames = 5): void {
  for (let i = 0; i < frames; i++) {
    globalScheduler.performUpdate();
  }
}

describe("ConnectionsStore.updateConnections", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("publishes a new connection added through updateEntities", () => {
    const graph = new Graph({ blocks });
    const store = graph.rootStore.connectionsList;
    const listener = jest.fn();
    const unsubscribe = store.$connections.subscribe(listener);
    listener.mockClear();

    graph.updateEntities({ connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }] });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.$connections.value.map((c) => c.id)).toEqual(["c1"]);
    expect(store.getConnections().map((c) => c.id)).toEqual(["c1"]);
    expect(store.toJSON()).toEqual([expect.objectContaining({ id: "c1", sourceBlockId: "a", targetBlockId: "b" })]);
    unsubscribe();
  });

  it("renders a BlockConnection for a connection added through updateEntities", () => {
    const graph = new Graph({ blocks }, document.createElement("div"));
    graph.start();
    try {
      tick();
      graph.updateEntities({ connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }] });
      tick();

      const view = graph.connections.getConnectionState("c1")?.getViewComponent();
      expect(view).toBeInstanceOf(BlockConnection);
    } finally {
      graph.stop();
      graph.unmount();
    }
  });

  it("keeps the last entry for duplicate ids in one batch and notifies once", () => {
    const graph = new Graph({ blocks });
    const store = graph.rootStore.connectionsList;
    const listener = jest.fn();
    const unsubscribe = store.$connections.subscribe(listener);
    listener.mockClear();
    const updateSpy = jest.spyOn(ConnectionState.prototype, "updateConnection");

    store.updateConnections([
      { id: "c1", sourceBlockId: "a", targetBlockId: "b", label: "first" },
      { id: "c1", sourceBlockId: "b", targetBlockId: "a", label: "second" },
    ]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.$connectionsMap.value.size).toBe(1);
    expect(store.toJSON()).toEqual([
      expect.objectContaining({ id: "c1", sourceBlockId: "b", targetBlockId: "a", label: "second" }),
    ]);
    // The second entry reuses the state created by the first instead of creating an orphan.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify for an empty update", () => {
    const graph = new Graph({ blocks });
    const store = graph.rootStore.connectionsList;
    const listener = jest.fn();
    const unsubscribe = store.$connections.subscribe(listener);
    listener.mockClear();

    store.updateConnections([]);
    store.updateConnections(new Array<TConnection>(2));

    expect(listener).not.toHaveBeenCalled();
    expect(store.$connectionsMap.value.size).toBe(0);
    unsubscribe();
  });

  it("publishes entries applied before an invalid entry throws", () => {
    const graph = new Graph({ blocks });
    const store = graph.rootStore.connectionsList;
    const listener = jest.fn();
    const unsubscribe = store.$connections.subscribe(listener);
    listener.mockClear();
    // Simulates untyped JS input: a null entry makes ConnectionState.getConnectionId throw.
    const invalid = null as unknown as TConnection;

    expect(() => store.updateConnections([{ id: "c1", sourceBlockId: "a", targetBlockId: "b" }, invalid])).toThrow(
      TypeError
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.toJSON()).toEqual([expect.objectContaining({ id: "c1" })]);
    unsubscribe();
  });

  it("updates existing connections in place and appends new ones", () => {
    const graph = new Graph({
      blocks,
      connections: [{ id: "c1", sourceBlockId: "a", targetBlockId: "b", label: "old" }],
    });
    const store = graph.rootStore.connectionsList;
    const existing = store.getConnectionState("c1");
    // Read the computed list first so a stale cached value would be observable.
    expect(store.toJSON()).toHaveLength(1);

    graph.updateEntities({
      connections: [
        { id: "c1", sourceBlockId: "a", targetBlockId: "b", label: "new" },
        { id: "c2", sourceBlockId: "b", targetBlockId: "a" },
      ],
    });

    expect(store.getConnectionState("c1")).toBe(existing);
    expect(store.toJSON()).toEqual([
      expect.objectContaining({ id: "c1", label: "new" }),
      expect.objectContaining({ id: "c2", sourceBlockId: "b", targetBlockId: "a" }),
    ]);
  });
});
