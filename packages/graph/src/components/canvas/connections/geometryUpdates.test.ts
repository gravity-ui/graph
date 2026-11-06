import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";

class CountingConnection extends BlockConnection<TConnection> {
  public pointUpdates = 0;

  protected override updatePoints(...args: Parameters<BlockConnection<TConnection>["updatePoints"]>): void {
    this.pointUpdates++;
    super.updatePoints(...args);
  }
}

function frames(count = 1) {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection geometry updates", () => {
  let graph: Graph;

  function view(id: string): CountingConnection {
    const component = graph.connections.getConnectionState(id)?.getViewComponent();
    if (!(component instanceof CountingConnection)) throw new Error(`Expected connection view ${id}`);
    return component;
  }

  function mount() {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [{ id: "edge", label: "Edge", sourcePortId: "source", targetPortId: "target" }],
        settings: { connection: CountingConnection, useBezierConnections: false, showConnectionLabels: true },
      },
      root
    );
    const state = graph.connections.getConnectionState("edge");
    if (!state) throw new Error("Expected connection edge");
    state.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
    state.$targetPortState.value.updatePort({ x: 300, y: 100, lookup: false });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames(3);
  }

  afterEach(() => graph?.unmount());

  it("computes a mounted connection's geometry once", () => {
    mount();
    expect(view("edge").pointUpdates).toBe(1);
  });

  it("recomputes geometry once per real data change and never for camera moves", () => {
    mount();
    const edge = view("edge");
    edge.pointUpdates = 0;

    graph.cameraService.set({ x: -50, y: -20 });
    frames(2);
    expect(edge.pointUpdates).toBe(0);

    graph.updateSettings({ useBezierConnections: true });
    frames(2);
    expect(edge.pointUpdates).toBe(1);

    const state = graph.connections.getConnectionState("edge");
    state?.$sourcePortState.value.updatePort({ x: 120, y: 140, lookup: false });
    frames(2);
    expect(edge.pointUpdates).toBe(2);
  });
});
