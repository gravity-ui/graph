import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";
import type { ConnectionLabel } from "./Label";

class LabeledConnection extends BlockConnection<TConnection> {
  public labels = 0;

  public allowed = true;

  protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
    this.labels++;
    super.renderLabelText(ctx);
  }

  protected override isRenderAllowed(): boolean {
    return this.allowed && super.isRenderAllowed();
  }

  public setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.applyShape();
  }

  public get labelItem(): ConnectionLabel {
    return this.labelShape;
  }
}

function frames(count = 2): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection label pass", () => {
  let graph: Graph;

  function mount(connections: Array<{ id: string; x: number; y: number; label?: string }>, scale = 1): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: connections.map(({ id, label }) => ({
          id,
          label,
          sourcePortId: `${id}-source`,
          targetPortId: `${id}-target`,
        })),
        settings: { connection: LabeledConnection, useBezierConnections: false, showConnectionLabels: true },
      },
      root
    );
    for (const { id, x, y } of connections) {
      const state = graph.connections.getConnectionState(id);
      if (!state) throw new Error(`Expected connection ${id}`);
      state.$sourcePortState.value.updatePort({ x, y, lookup: false });
      state.$targetPortState.value.updatePort({ x: x + 100, y, lookup: false });
    }
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale });
    graph.start();
    frames(3);
  }

  function view(id: string): LabeledConnection {
    const component = graph.connections.getConnectionState(id)?.getViewComponent();
    if (!(component instanceof LabeledConnection)) throw new Error(`Expected connection view ${id}`);
    return component;
  }

  afterEach(() => graph?.unmount());

  it("draws labels after every line and arrow, with selected labels on top", () => {
    mount([
      { id: "selected", x: 100, y: 100, label: "first" },
      { id: "plain", x: 100, y: 300, label: "second" },
    ]);
    graph.api.selectConnections(["selected"], true);
    frames();
    const ctx = view("plain").context.ctx;
    const stroke = jest.mocked(ctx.stroke);
    const fillText = jest.mocked(ctx.fillText);
    stroke.mockClear();
    fillText.mockClear();

    graph.cameraService.set({ x: 1 });
    frames();

    expect(stroke.mock.calls.length).toBeGreaterThan(1);
    expect(Math.max(...stroke.mock.invocationCallOrder)).toBeLessThan(Math.min(...fillText.mock.invocationCallOrder));
    expect(fillText.mock.calls.map(([text]) => text)).toEqual(["second", "first"]);
  });

  it("culls labels by their own rectangle", () => {
    mount([
      { id: "near", x: 100, y: 100, label: "near" },
      { id: "far", x: 50_000, y: 50_000, label: "far" },
      // The line starts right of the viewport; its long label reaches into it.
      { id: "reaching", x: 1010, y: 400, label: "a".repeat(200) },
    ]);
    for (const id of ["near", "far", "reaching"]) view(id).labels = 0;
    graph.cameraService.set({ x: 1 });
    frames();

    expect(view("near").labels).toBeGreaterThan(0);
    expect(view("far").labels).toBe(0);
    expect(view("reaching").labels).toBeGreaterThan(0);
  });

  it("draws no label below the zoom threshold, while hidden or with labels off", () => {
    mount([{ id: "label", x: 100, y: 100, label: "label" }], 0.2);
    const connection = view("label");
    expect(connection.labels).toBe(0);
    expect(connection.context.labels.has(connection.labelItem)).toBe(false);

    graph.cameraService.set({ scale: 1 });
    frames();
    expect(connection.labels).toBeGreaterThan(0);
    expect(connection.context.labels.has(connection.labelItem)).toBe(true);

    connection.setAllowed(false);
    connection.labels = 0;
    graph.cameraService.set({ x: 1 });
    frames();
    expect(connection.labels).toBe(0);

    connection.setAllowed(true);
    graph.updateSettings({ showConnectionLabels: false });
    frames(3);
    connection.labels = 0;
    graph.cameraService.set({ x: 2 });
    frames();
    expect(connection.labels).toBe(0);
    expect(connection.context.labels.has(connection.labelItem)).toBe(false);
  });

  it("draws no labels while the connections component does not walk its children, but still strokes lines", () => {
    mount([{ id: "label", x: 100, y: 100, label: "label" }]);
    const connection = view("label");
    const parent = connection.getParent() as unknown as { shouldRenderChildren: boolean };
    const style = jest.spyOn(connection, "style");
    parent.shouldRenderChildren = false;
    connection.labels = 0;
    graph.cameraService.set({ x: 1 });
    frames();
    expect(connection.labels).toBe(0);
    expect(style).toHaveBeenCalled();

    parent.shouldRenderChildren = true;
    graph.cameraService.set({ x: 2 });
    frames();
    expect(connection.labels).toBeGreaterThan(0);
  });

  it("forgets the label of an unmounted connection", () => {
    mount([{ id: "label", x: 100, y: 100, label: "label" }]);
    const connection = view("label");
    const labels = connection.context.labels;
    const state = graph.connections.getConnectionState("label");
    if (!state) throw new Error("Expected connection");
    graph.rootStore.connectionsList.deleteConnections([state]);
    frames();
    expect(labels.has(connection.labelItem)).toBe(false);
  });

  it("keeps the standard label out of the line's batch bounds but in its hit box and tree bounds", () => {
    mount([{ id: "reaching", x: 1010, y: 100, label: "a".repeat(200) }]);
    const connection = view("reaching");
    const bounds = connection.getPathBounds();
    if (!bounds) throw new Error("Expected bounds");
    expect(bounds[0]).toBeGreaterThan(1000);
    expect(connection.getHitBox()[0]).toBeLessThan(1000);
    expect(connection.isInViewport()).toBe(true);
  });

  it("draws the label of an offscreen line without stroking the line", () => {
    mount([{ id: "reaching", x: 1010, y: 100, label: "a".repeat(200) }]);
    const connection = view("reaching");
    const style = jest.spyOn(connection, "style");
    connection.labels = 0;
    graph.cameraService.set({ x: 1 });
    frames();
    expect(connection.labels).toBeGreaterThan(0);
    expect(style).not.toHaveBeenCalled();
  });

  it("does not rebuild line chunks when zoom resizes labels", () => {
    mount([{ id: "label", x: 100, y: 100, label: "label" }]);
    const connection = view("label");
    const getPath = jest.spyOn(connection, "getPath");
    graph.cameraService.set({ scale: 2 });
    frames();
    graph.cameraService.set({ scale: 1.5 });
    frames();
    expect(getPath).not.toHaveBeenCalled();
    expect(connection.labels).toBeGreaterThan(0);
  });
});
