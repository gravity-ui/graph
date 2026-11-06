import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection, TConnectionProps } from "./BlockConnection";

class ObservedConnection extends BlockConnection<TConnection> {
  public labelUpdates = 0;
  public boundsUpdates = 0;
  public pathUpdates = 0;
  public labelDraws = 0;

  public labelBounds() {
    return this.labelGeometry;
  }

  public linePath() {
    return this.path2d;
  }

  public resetCounts() {
    this.labelUpdates = this.boundsUpdates = this.pathUpdates = this.labelDraws = 0;
  }

  protected override updateLabelGeometry(props: TConnectionProps) {
    this.labelUpdates++;
    super.updateLabelGeometry(props);
  }

  protected override setCullingBounds(minX: number, minY: number, maxX: number, maxY: number) {
    this.boundsUpdates++;
    super.setCullingBounds(minX, minY, maxX, maxY);
  }

  protected override createPath() {
    this.pathUpdates++;
    return super.createPath();
  }

  protected override renderLabelText(ctx: CanvasRenderingContext2D) {
    this.labelDraws++;
    super.renderLabelText(ctx);
  }
}

function frames(count = 3) {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection label scale updates", () => {
  let graph: Graph;
  let view: ObservedConnection;

  function mount(options: { label?: string; enabled?: boolean; scale?: number; y?: number; useBezier?: boolean } = {}) {
    const { label, enabled, scale, y, useBezier } = {
      label: "label",
      enabled: true,
      scale: 0.4,
      y: 100,
      useBezier: false,
      ...options,
    };
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [{ id: "connection", label, sourcePortId: "source", targetPortId: "target" }],
        settings: {
          connection: ObservedConnection,
          useBezierConnections: useBezier,
          showConnectionLabels: enabled,
        },
      },
      root
    );
    const state = graph.connections.getConnectionState("connection");
    if (!state) throw new Error("Expected connection state");
    state.$sourcePortState.value.updatePort({ x: 100, y, lookup: false });
    state.$targetPortState.value.updatePort({ x: 200, y, lookup: false });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale });
    graph.start();
    frames();
    const component = state.getViewComponent();
    if (!(component instanceof ObservedConnection)) throw new Error("Expected connection view");
    view = component;
    view.resetCounts();
  }

  function expectNoGeometryWork() {
    expect(view.labelUpdates).toBe(0);
    expect(view.boundsUpdates).toBe(0);
    expect(view.pathUpdates).toBe(0);
  }

  function labelHeight() {
    const height = view.labelBounds()?.height;
    if (height === undefined) throw new Error("Expected visible label geometry");
    return height;
  }

  afterEach(() => graph?.unmount());

  it.each(["disabled", "missing"])("starts tracking zoom after an initially %s label is enabled", (initial) => {
    mount({ label: initial === "missing" ? undefined : "label", enabled: initial !== "disabled" });
    expect(view.labelBounds()).toBeUndefined();

    graph.cameraService.set({ scale: 0.3 });
    frames();
    expectNoGeometryWork();

    if (initial === "disabled") graph.updateSettings({ showConnectionLabels: true });
    else graph.api.updateConnection("connection", { label: "label" });
    frames();
    const height = labelHeight();
    view.resetCounts();

    graph.cameraService.set({ scale: 0.25 });
    frames();
    expect(labelHeight()).toBeGreaterThan(height);
    expect(view.labelDraws).toBeGreaterThan(0);
  });

  it.each(["disabled", "removed"])("stops tracking a %s label and resumes at the current zoom", (change) => {
    mount();
    if (change === "disabled") graph.updateSettings({ showConnectionLabels: false });
    else graph.api.updateConnection("connection", { label: undefined });
    frames();
    expect(view.labelBounds()).toBeUndefined();
    view.resetCounts();

    graph.cameraService.set({ scale: 0.3 });
    frames();
    expectNoGeometryWork();

    if (change === "disabled") graph.updateSettings({ showConnectionLabels: true });
    else graph.api.updateConnection("connection", { label: "restored" });
    frames();
    const height = labelHeight();
    view.resetCounts();

    graph.cameraService.set({ scale: 0.25 });
    frames();
    expect(labelHeight()).toBeGreaterThan(height);
    expect(view.labelDraws).toBeGreaterThan(0);
  });

  it.each([false, true])("updates label bounds without recreating the line path on zoom (Bezier: %s)", (useBezier) => {
    mount({ useBezier });
    const path = view.linePath();
    const height = labelHeight();

    graph.cameraService.set({ scale: 0.3 });
    frames();

    expect(labelHeight()).toBeGreaterThan(height);
    expect(view.pathUpdates).toBe(0);
    expect(view.linePath()).toBe(path);
    expect(view.labelDraws).toBeGreaterThan(0);
  });

  it.each([
    [1, 0.9],
    [0.4, 0.405],
    [0.1, 0.12],
  ])("skips geometry and index updates when zoom %s to %s keeps the same label size or visibility", (from, to) => {
    mount({ scale: from });
    const bounds = view.labelBounds();

    graph.cameraService.set({ scale: to });
    frames();

    expectNoGeometryWork();
    expect(view.labelBounds()).toBe(bounds);
  });

  it("does not recompute label geometry or bounds during pan", () => {
    mount();
    const bounds = view.labelBounds();

    graph.cameraService.set({ x: 10, y: 20 });
    frames();

    expectNoGeometryWork();
    expect(view.labelBounds()).toBe(bounds);
  });

  it("updates offscreen bounds before culling as a label grows, shrinks and crosses the visibility threshold", () => {
    mount({ y: 850, scale: 1 });
    expect(view.isInViewport()).toBe(false);

    // Keep the visible world's bottom at y=800; only the label reaches the viewport.
    graph.cameraService.set({ scale: 0.25, y: 600 });
    frames();
    expect(view.labelBounds()?.y).toBeLessThan(800);
    expect(view.isInViewport()).toBe(true);
    expect(view.labelDraws).toBeGreaterThan(0);
    view.resetCounts();

    graph.cameraService.set({ scale: 1, y: 0 });
    frames();
    expect(view.labelBounds()?.y).toBeGreaterThan(800);
    expect(view.isInViewport()).toBe(false);
    expect(view.labelDraws).toBe(0);

    graph.cameraService.set({ scale: 0.24, y: 608 });
    frames();
    expect(view.labelBounds()).toBeUndefined();
    expect(view.isInViewport()).toBe(false);
    view.resetCounts();

    graph.cameraService.set({ scale: 0.25, y: 600 });
    frames();
    expect(view.isInViewport()).toBe(true);
    expect(view.labelDraws).toBeGreaterThan(0);
  });

  it("does not update a removed connection when the camera changes", () => {
    mount();
    const state = graph.connections.getConnectionState("connection");
    if (!state) throw new Error("Expected connection state");
    graph.connections.deleteConnections([state]);
    frames();
    expect(view.isEntityAvailable()).toBe(false);
    view.resetCounts();

    graph.cameraService.set({ scale: 0.3 });
    frames();

    expectNoGeometryWork();
    expect(view.labelDraws).toBe(0);
  });

  it("refreshes label visibility when the zoom threshold changes without moving the camera", () => {
    mount({ scale: 0.2 });
    expect(view.labelBounds()).toBeUndefined();

    graph.setConstants({ connection: { MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.1 } });
    frames();
    expect(view.labelBounds()).toBeDefined();
    expect(view.labelDraws).toBeGreaterThan(0);
    view.resetCounts();

    graph.setConstants({ connection: { MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.3 } });
    frames();
    expect(view.labelBounds()).toBeUndefined();
    expect(view.labelDraws).toBe(0);
    view.resetCounts();

    graph.cameraService.set({ scale: 0.35 });
    frames();
    expect(view.labelBounds()).toBeDefined();
    expect(view.labelDraws).toBeGreaterThan(0);
  });
});
