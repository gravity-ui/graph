import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { ConnectionState, TConnection } from "../../../store/connection/ConnectionState";
import type { TBlock } from "../blocks/Block";

import { BlockConnection } from "./BlockConnection";

/**
 * Task 3y: a connection removed from the store and added back with the same id before a frame. The store made a new
 * connection state and destroyed the old one; the new state gets a component of its own, and the component of the
 * old state unmounts, as with a frame in between.
 */

const block = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 50,
  anchors: [],
});

const CONNECTION: TConnection = { id: "c", sourceBlockId: "a", targetBlockId: "b", label: "first" };

function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

type TConnectionInternals = { connectedState: ConnectionState };

describe("a connection added back in the same frame gets a component of its own", () => {
  let graph: Graph;

  /** Blocks a (x 0..100) and b (x 400..500), y 0..50, and connection c from a to b along y 25, labelled. */
  function start(): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBezierConnections: false, showConnectionLabels: true } }, root);
    graph.setEntities({ blocks: [block("a", 0), block("b", 400)], connections: [CONNECTION] });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames();
  }

  const stateOf = (id = "c"): ConnectionState => {
    const state = graph.rootStore.connectionsList.getConnectionState(id);
    if (!state) throw new Error(`no connection state ${id}`);
    return state;
  };
  const viewOf = (id = "c"): BlockConnection => {
    const view = stateOf(id).getViewComponent();
    if (!(view instanceof BlockConnection)) throw new Error(`no connection component ${id}`);
    return view;
  };
  const internals = (view: BlockConnection): TConnectionInternals => view as unknown as TConnectionInternals;
  const elementOf = (view: BlockConnection) => {
    const key = view.getSceneKey();
    return key && graph.scene.store.get(key.elementId);
  };
  /** Removes connection c and adds it back with the same id and this data, with no frame in between. */
  const readd = (connection: TConnection): void => {
    graph.rootStore.connectionsList.deleteConnections([stateOf()]);
    graph.rootStore.connectionsList.addConnection(connection);
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("mounts a component for the new state and unmounts the old state's one", () => {
    start();
    const oldState = stateOf();
    const oldView = viewOf();
    expect(oldView.isMounted()).toBe(true);
    readd({ ...CONNECTION, label: "second" });
    frames();
    const newState = stateOf();
    expect(newState === oldState).toBe(false);
    const view = viewOf();
    expect(view === oldView).toBe(false);
    expect(internals(view).connectedState === newState).toBe(true);
    expect(view.isMounted()).toBe(true);
    expect(view.isEntityAvailable()).toBe(true);
    expect(oldView.isMounted()).toBe(false);
    expect(elementOf(oldView)).toBeUndefined();
    expect(elementOf(view)?.primitives.find(({ kind }) => kind === "text")).toMatchObject({ text: "second" });
    expect(view.state.label).toBe("second");
    expect(view.connectionPoints).toEqual(oldView.connectionPoints);
    expect(view.isPathVisible()).toBe(true);
  });

  it("makes the new connection the hit target", () => {
    start();
    readd(CONNECTION);
    frames();
    expect(graph.getElementOverPoint({ x: 250, y: 25 }) === viewOf()).toBe(true);
  });

  it("replaces it again on a second re-add, and after a setEntities that replaced it", () => {
    start();
    readd(CONNECTION);
    frames();
    const second = viewOf();
    readd(CONNECTION);
    frames();
    const third = viewOf();
    expect(third === second).toBe(false);
    expect(second.isMounted()).toBe(false);
    expect(internals(third).connectedState === stateOf()).toBe(true);
    graph.setEntities({ blocks: [block("a", 0), block("b", 400)], connections: [] });
    graph.setEntities({ blocks: [block("a", 0), block("b", 400)], connections: [CONNECTION] });
    frames();
    const fourth = viewOf();
    expect(fourth === third).toBe(false);
    expect(third.isMounted()).toBe(false);
    expect(elementOf(fourth)).toBeDefined();
    // Exactly one component per connection: the kept ones are gone from the tree.
    const parent = fourth.getParent() as unknown as { getChildComponents(): readonly unknown[] };
    expect(parent.getChildComponents().filter((child) => child instanceof BlockConnection)).toHaveLength(1);
  });

  it("keys a replacement apart from every connection id, those with control characters included", () => {
    start();
    const errors = jest.spyOn(console, "error");
    // Ids shaped like a key a replacement could take: the id with a separator and a counter, or the counter alone.
    const ids = ["c\u00001", "\u0000r1", "\u00001", "\u0000\u0000c"];
    ids.forEach((id) => graph.rootStore.connectionsList.addConnection({ ...CONNECTION, id }));
    frames();
    const before = new Map(ids.map((id) => [id, viewOf(id)]));
    readd(CONNECTION);
    frames();
    readd(CONNECTION);
    frames();
    // The re-added connection got a component of its own, and none of the others lost or changed theirs.
    const views = ["c", ...ids].map((id) => viewOf(id));
    expect(new Set(views).size).toBe(views.length);
    expect(views.every((view) => view.isMounted() && elementOf(view))).toBe(true);
    expect(ids.every((id) => viewOf(id) === before.get(id))).toBe(true);
    expect(internals(viewOf()).connectedState === stateOf()).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it("keeps the component of a connection whose state is unchanged", () => {
    start();
    const view = viewOf();
    graph.rootStore.connectionsList.addConnection({ id: "d", sourceBlockId: "b", targetBlockId: "a" });
    frames();
    expect(viewOf() === view).toBe(true);
    expect(view.isMounted()).toBe(true);
    expect(elementOf(view)).toBeDefined();
  });
});
