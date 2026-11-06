import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TBatchParams } from "../../../lib/batch/types";
import type { TConnection } from "../../../store/connection/ConnectionState";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection } from "./BlockConnection";
import type { BlockConnections } from "./BlockConnections";
import type { IConnectionBatch, IConnectionBatchItem } from "./batch";
import { WebGLConnections } from "./webgl/WebGLConnections";

/** Records registrations, like a WebGL batch would, without a graphics API. */
class FakeBatch implements IConnectionBatch {
  public readonly items = new Map<IConnectionBatchItem, TBatchParams>();

  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.items.set(item, { ...params });
  }

  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    this.items.set(item, { ...params });
  }

  public delete(item: IConnectionBatchItem): void {
    this.items.delete(item);
  }

  public has(item: IConnectionBatchItem): boolean {
    return this.items.has(item);
  }

  public markDirty(): void {}

  public markBoundsDirty(): void {}

  public forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void {
    for (const [item, params] of this.items) visit(item, params);
  }
}

type TBlockConnectionsInternals = {
  batch: IConnectionBatch;
  path2d: BatchPath2DRenderer | undefined;
  switchBatch(next: IConnectionBatch): void;
};

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

function mount(settings: Record<string, unknown> = {}, root = document.createElement("div")): Graph {
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      connections: [
        { id: "a", sourcePortId: "a-source", targetPortId: "a-target" },
        { id: "b", sourcePortId: "b-source", targetPortId: "b-target" },
      ],
      settings: { useBezierConnections: false, showConnectionArrows: true, ...settings },
    },
    root
  );
  for (const [id, y] of [
    ["a", 100],
    ["b", 300],
  ] as const) {
    const state = graph.connections.getConnectionState(id);
    if (!state) throw new Error(`Expected connection ${id}`);
    state.$sourcePortState.value.updatePort({ x: 100, y, lookup: false });
    state.$targetPortState.value.updatePort({ x: 400, y, lookup: false });
  }
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames();
  return graph;
}

function view(graph: Graph, id: string): BlockConnection<TConnection> {
  const component = graph.connections.getConnectionState(id)?.getViewComponent();
  if (!(component instanceof BlockConnection)) throw new Error(`Expected connection view ${id}`);
  return component;
}

function internals(graph: Graph): TBlockConnectionsInternals {
  return view(graph, "a").getParent() as unknown as BlockConnections & TBlockConnectionsInternals;
}

describe("BlockConnections WebGL batch choice", () => {
  let graph: Graph | undefined;
  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  it("chooses the WebGL batch before children compute geometry, so mounting builds each connection once", () => {
    class FakeWebGL extends FakeBatch {
      public render(): void {}

      public setEffects(): void {}

      public dispose(): void {}
    }
    jest.spyOn(WebGLConnections, "create").mockImplementation(() => new FakeWebGL() as unknown as WebGLConnections);
    const updatePoints = jest.spyOn(BlockConnection.prototype as unknown as { updatePoints(): void }, "updatePoints");
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph = mount({ connectionsRenderer: "webgl" }, root);
    const counts: number[] = [updatePoints.mock.calls.length];
    for (let i = 0; i < 3; i++) {
      frames(1);
      counts.push(updatePoints.mock.calls.length);
    }

    expect(internals(graph).batch).toBeInstanceOf(FakeWebGL);
    // Two connections: both build once at mount and nothing rebuilds on the next frames.
    expect(counts).toEqual([2, 2, 2, 2]);
  });
});

describe("BlockConnections batch switching", () => {
  let graph: Graph | undefined;
  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    document.body.innerHTML = "";
  });

  it("moves every line and arrow into the next batch, which every connection then uses", () => {
    graph = mount();
    const connections = internals(graph);
    const registered = new Map<IConnectionBatchItem, TBatchParams>();
    connections.batch.forEachItem((item, params) => registered.set(item, { ...params }));
    // A line and an arrow per connection.
    expect(registered.size).toBe(4);

    const fake = new FakeBatch();
    connections.switchBatch(fake);

    expect(fake.items).toEqual(registered);
    expect(connections.batch).toBe(fake);
    expect(view(graph, "a").context.batch).toBe(fake);
    expect(view(graph, "b").context.batch).toBe(fake);

    // Later changes reach the new batch: hiding arrows deletes them from it.
    graph.updateSettings({ showConnectionArrows: false });
    frames();
    expect(fake.items.size).toBe(2);
    expect(fake.has(view(graph, "a"))).toBe(true);
    expect(fake.has(view(graph, "b"))).toBe(true);
  });

  it("keeps the Path2D batch when WebGL2 is unavailable", () => {
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext");
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph = mount({ connectionsRenderer: "webgl" }, root);
    const connections = internals(graph);
    const canvases = root.querySelectorAll("canvas").length;
    frames();

    // jsdom has no WebGL2: the attempt is made once and the graph stays on canvas.
    expect(getContext.mock.calls.filter(([type]) => type === "webgl2")).toHaveLength(1);
    getContext.mockRestore();
    expect(connections.batch).toBeInstanceOf(BatchPath2DRenderer);
    expect(connections.path2d).toBe(connections.batch);
    expect(view(graph, "a").context.batch).toBe(connections.batch);
    expect(root.querySelectorAll("canvas").length).toBe(canvases);
  });
});
