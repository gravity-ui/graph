import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { Tree } from "../../../lib/Tree";
import { TConnection } from "../../../store/connection/ConnectionState";
import type { TBlock } from "../blocks/Block";

import { BlockConnection } from "./BlockConnection";

class CountingConnection extends BlockConnection<TConnection> {
  public pointUpdates = 0;

  public updates = 0;

  protected override updatePoints(...args: Parameters<BlockConnection<TConnection>["updatePoints"]>): void {
    this.pointUpdates++;
    super.updatePoints(...args);
  }

  protected override willIterate(): void {
    super.willIterate();
    this.updates++;
  }
}

/** The same connection kept in the frame walk. */
class WalkedConnection extends CountingConnection {
  public static override readonly detached = false;
}

const block = (id: string, x: number): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 0,
  width: 100,
  height: 100,
  anchors: [],
});

const treeNode = (component: object): Tree => (component as unknown as { __comp: { treeNode: Tree } }).__comp.treeNode;

function frames(count = 1): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

let graph: Graph;

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  return root;
}

function mountPorts(
  Connection: typeof CountingConnection,
  connections: Array<{ id: string; label?: string }>,
  settings: { showConnectionLabels?: boolean } = {}
): void {
  graph = new Graph(
    {
      connections: connections.map(({ id, label }) => ({
        id,
        label,
        sourcePortId: `${id}-source`,
        targetPortId: `${id}-target`,
      })),
      settings: { connection: Connection, useBezierConnections: false, ...settings },
    },
    createRoot()
  );
  for (const { id } of connections) {
    const state = graph.connections.getConnectionState(id);
    state?.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
    state?.$targetPortState.value.updatePort({ x: 300, y: 100, lookup: false });
  }
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames(3);
}

function view(id: string): CountingConnection {
  const component = graph.connections.getConnectionState(id)?.getViewComponent();
  if (!(component instanceof CountingConnection)) throw new Error(`Expected connection view ${id}`);
  return component;
}

afterEach(() => {
  jest.restoreAllMocks();
  graph?.unmount();
});

describe.each([
  ["detached", CountingConnection],
  ["walked", WalkedConnection],
])("%s connection components", (_, Connection) => {
  it("recompute geometry once per frame when both endpoints move", () => {
    mountPorts(Connection, [{ id: "edge" }]);
    const edge = view("edge");
    edge.pointUpdates = 0;
    const state = graph.connections.getConnectionState("edge");
    state?.$sourcePortState.value.updatePort({ x: 120, y: 140, lookup: false });
    state?.$targetPortState.value.updatePort({ x: 320, y: 160, lookup: false });
    expect(edge.pointUpdates).toBe(0);
    frames(1);
    expect(edge.pointUpdates).toBe(1);
    expect(edge.connectionPoints).toEqual([
      { x: 120, y: 140 },
      { x: 320, y: 160 },
    ]);
  });

  it("keep store order for hit testing", () => {
    mountPorts(Connection, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(["a", "b", "c"].map((id) => view(id).renderOrder)).toEqual([0, 1, 2]);
    const first = graph.connections.getConnectionState("a");
    if (!first) throw new Error("Expected connection a");
    graph.connections.deleteConnections([first]);
    frames(3);
    expect(["b", "c"].map((id) => view(id).renderOrder)).toEqual([0, 1]);
  });
});

describe("detached connection components", () => {
  it("are not walked by the frame and stay out of the layer's culling index", () => {
    mountPorts(CountingConnection, [{ id: "edge" }]);
    const edge = view("edge");
    const iterate = jest.spyOn(edge, "iterate");
    graph.getGraphLayer().performRender();
    frames(2);
    expect(iterate).not.toHaveBeenCalled();
    const scope = treeNode(graph.getGraphLayer()).culling;
    expect(scope?.nodes.includes(treeNode(edge))).toBe(false);
  });

  it("do nothing per connection while the camera moves", () => {
    mountPorts(CountingConnection, [{ id: "edge" }]);
    const edge = view("edge");
    edge.updates = 0;
    edge.pointUpdates = 0;
    for (let i = 0; i < 5; i++) {
      graph.cameraService.move(10, 0);
      frames(1);
    }
    expect(edge.updates).toBe(0);
    expect(edge.pointUpdates).toBe(0);
  });

  it("compute geometry once at mount, from ports their blocks positioned", () => {
    graph = new Graph({ settings: { connection: CountingConnection } }, createRoot());
    graph.setEntities({
      blocks: [block("a", 0), block("b", 400)],
      connections: [{ id: "ab", sourceBlockId: "a", targetBlockId: "b" }],
    });
    graph.start();
    frames(3);
    expect(view("ab").pointUpdates).toBe(1);
  });

  it("call afterRender only while their label is shown", () => {
    const afterRender = jest.spyOn(
      BlockConnection.prototype as unknown as { afterRender(ctx: CanvasRenderingContext2D): void },
      "afterRender"
    );
    mountPorts(CountingConnection, [{ id: "labelled", label: "L" }, { id: "plain" }], { showConnectionLabels: true });
    afterRender.mockClear();
    graph.getGraphLayer().performRender();
    frames(1);
    expect(afterRender.mock.contexts).toEqual([view("labelled")]);

    graph.cameraService.set({ scale: 0.1 });
    frames(2);
    afterRender.mockClear();
    graph.getGraphLayer().performRender();
    frames(1);
    expect(afterRender).not.toHaveBeenCalled();
  });

  it("draw the standard label exactly while it is shown", () => {
    class Labelled extends CountingConnection {
      public labelDraws = 0;

      protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
        this.labelDraws++;
        super.renderLabelText(ctx);
      }
    }
    mountPorts(Labelled, [{ id: "edge" }]);
    const edge = view("edge");
    if (!(edge instanceof Labelled)) throw new Error("Expected a labelled connection");
    // Forces one frame after the change settled and returns how many labels it drew.
    const drawn = (): number => {
      frames(2);
      edge.labelDraws = 0;
      graph.getGraphLayer().performRender();
      frames(1);
      return edge.labelDraws;
    };

    expect(drawn()).toBe(0);
    graph.updateSettings({ showConnectionLabels: true });
    expect(drawn()).toBe(0);
    graph.api.updateConnection("edge", { label: "L" });
    expect(drawn()).toBe(1);
    graph.cameraService.set({ scale: 0.1 });
    expect(drawn()).toBe(0);
    graph.cameraService.set({ scale: 1 });
    expect(drawn()).toBe(1);
    graph.api.updateConnection("edge", { label: undefined });
    expect(drawn()).toBe(0);
    graph.api.updateConnection("edge", { label: "L" });
    expect(drawn()).toBe(1);
    graph.updateSettings({ showConnectionLabels: false });
    expect(drawn()).toBe(0);
  });

  it("cull labels by their rectangle against the camera without viewport culling", () => {
    class Labelled extends CountingConnection {
      public labelDraws = 0;

      protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
        this.labelDraws++;
        super.renderLabelText(ctx);
      }
    }
    mountPorts(
      Labelled,
      [
        { id: "near", label: "N" },
        { id: "far", label: "F" },
      ],
      { showConnectionLabels: true }
    );
    graph.updateSettings({ viewportCulling: false });
    graph.getGraphLayer().performRender();
    frames(2);
    // Moved far outside the 1000x800 camera at scale 1.
    const farState = graph.connections.getConnectionState("far");
    farState?.$sourcePortState.value.updatePort({ x: 5100, y: 5100, lookup: false });
    farState?.$targetPortState.value.updatePort({ x: 5300, y: 5100, lookup: false });
    frames(2);
    const near = view("near") as Labelled;
    const far = view("far") as Labelled;
    near.labelDraws = 0;
    far.labelDraws = 0;
    graph.getGraphLayer().performRender();
    frames(1);
    expect(near.labelDraws).toBe(1);
    expect(far.labelDraws).toBe(0);
  });

  it("call an overridden afterRender for every connection in the viewport", () => {
    class Observed extends CountingConnection {
      public calls = 0;

      public override afterRender(ctx: CanvasRenderingContext2D): void {
        this.calls++;
        super.afterRender?.(ctx);
      }
    }
    mountPorts(Observed, [{ id: "plain" }]);
    graph.cameraService.set({ scale: 0.1 });
    frames(2);
    const plain = view("plain");
    if (!(plain instanceof Observed)) throw new Error("Expected an observed connection");
    plain.calls = 0;
    graph.getGraphLayer().performRender();
    frames(1);
    expect(plain.calls).toBe(1);
  });

  it("warn in development about per-frame hooks of a subclass", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    class Painting extends CountingConnection {
      protected override render(): void {
        // draws every frame
      }
    }
    mountPorts(Painting, [{ id: "edge" }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Painting is detached"));
  });
});

describe("walked connection components", () => {
  it("stay in the layer's culling index", () => {
    mountPorts(WalkedConnection, [{ id: "edge" }]);
    const scope = treeNode(graph.getGraphLayer()).culling;
    expect(scope?.nodes.includes(treeNode(view("edge")))).toBe(true);
  });
});
