import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";

class ObservedConnection extends BlockConnection<TConnection> {
  public draws: string[] = [];

  public override getPath() {
    this.draws.push("path");
    return super.getPath();
  }

  public override createArrowPath() {
    this.draws.push("arrow");
    return super.createArrowPath();
  }

  public override style(ctx: CanvasRenderingContext2D) {
    this.draws.push("style");
    return super.style(ctx);
  }

  public override styleArrow(ctx: CanvasRenderingContext2D) {
    this.draws.push("arrowStyle");
    return super.styleArrow(ctx);
  }

  public override afterRender(ctx: CanvasRenderingContext2D) {
    this.draws.push("afterRender");
    super.afterRender?.(ctx);
  }

  public labelBounds() {
    return this.labelGeometry;
  }
}

function frames(count = 1) {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection batch viewport visibility", () => {
  let graph: Graph;

  function connectionState(id: string) {
    const state = graph.connections.getConnectionState(id);
    if (!state) throw new Error(`Expected connection ${id}`);
    return state;
  }

  function mount(connections: Array<{ id: string; x: number; y: number; label?: string }>) {
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
        settings: { connection: ObservedConnection, useBezierConnections: false, showConnectionLabels: true },
      },
      root
    );
    for (const { id, x, y } of connections) {
      const state = connectionState(id);
      state.$sourcePortState.value.updatePort({ x, y, lookup: false });
      state.$targetPortState.value.updatePort({ x: x + 100, y, lookup: false });
    }
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames(3);
  }

  function view(id: string) {
    const component = connectionState(id).getViewComponent();
    if (!(component instanceof ObservedConnection)) throw new Error(`Expected connection view ${id}`);
    return component;
  }

  afterEach(() => graph?.unmount());

  it("omits offscreen paths, arrows and after-render hooks from the first batch draw", () => {
    mount([
      { id: "near", x: 100, y: 100 },
      { id: "far", x: 50_000, y: 50_000 },
    ]);

    expect(view("near").draws).toContain("path");
    expect(view("far").draws).toEqual([]);
  });

  it("reuses line and arrow geometry when the camera leaves and reenters", () => {
    mount([
      { id: "near", x: 100, y: 100 },
      { id: "far", x: 50_000, y: 50_000 },
    ]);
    view("near").draws = [];
    view("far").draws = [];

    graph.cameraService.set({ x: -49_800, y: -49_800 });
    frames(2);
    expect(view("near").draws).toEqual([]);
    expect(view("far").draws).toEqual(expect.arrayContaining(["path", "arrow", "afterRender"]));

    view("near").draws = [];
    view("far").draws = [];
    graph.cameraService.set({ x: 0, y: 0 });
    frames(2);
    expect(view("near").draws).toEqual(expect.arrayContaining(["style", "arrowStyle", "afterRender"]));
    expect(view("near").draws).not.toContain("path");
    expect(view("near").draws).not.toContain("arrow");
    expect(view("far").draws).toEqual([]);
  });

  it.each([true, false])("keeps custom line and arrow geometry cached across pan with Tree culling %s", (culling) => {
    mount(Array.from({ length: 100 }, (_, index) => ({ id: String(index), x: 100 + index * 10, y: 100 })));
    graph.updateSettings({ EXP_VISIBILITY_CULLING: culling });
    frames(2);
    for (let index = 0; index < 100; index++) view(String(index)).draws = [];

    // One previously visible connection exits; all its visible neighbors share the draw chunk.
    graph.cameraService.set({ x: -210 });
    frames(2);
    expect(view("0").draws).toEqual([]);
    expect(view("20").draws).toContain("afterRender");
    for (let index = 1; index < 80; index++) {
      expect(view(String(index)).draws).not.toContain("path");
      expect(view(String(index)).draws).not.toContain("arrow");
    }

    for (let index = 0; index < 100; index++) view(String(index)).draws = [];
    graph.cameraService.set({ x: 0 });
    frames(2);
    expect(view("0").draws).toContain("afterRender");
    expect(view("0").draws).not.toContain("path");
    expect(view("0").draws).not.toContain("arrow");

    connectionState("20").$targetPortState.value.updatePort({ x: 450, y: 150, lookup: false });
    frames(2);
    expect(view("20").draws).toContain("path");
    expect(view("20").draws).toContain("arrow");
    expect(view("21").draws).not.toContain("path");
    expect(view("21").draws).not.toContain("arrow");
  });

  it("finds a label intersecting the viewport before its outside line ever draws", () => {
    mount([{ id: "label", x: 1010, y: 100, label: "a".repeat(200) }]);

    expect(view("label").draws).toContain("afterRender");
    expect(view("label").getHitBox()[0]).toBeLessThan(1000);
    expect(view("label").labelBounds()?.x).toBeLessThan(1000);
  });

  it("refreshes label bounds while an offscreen connection receives a longer label", () => {
    mount([{ id: "label", x: 1010, y: 100, label: "a" }]);
    view("label").draws = [];

    graph.api.updateConnection("label", { label: "b".repeat(200) });
    frames(2);

    expect(view("label").draws).toContain("afterRender");
    expect(view("label").getHitBox()[0]).toBeLessThan(1000);
  });

  it("lets an offscreen label enter when zoom increases its world-space height", () => {
    mount([{ id: "label", x: 100, y: 850, label: "label" }]);
    view("label").draws = [];

    // Keep the bottom of the visible world at y=800 while the label grows upwards.
    graph.cameraService.set({ scale: 0.25, y: 600 });
    frames(2);

    expect(view("label").labelBounds()?.y).toBeLessThan(800);
    expect(view("label").draws).toContain("afterRender");
  });

  it("removes stale label bounds before the batch when labels are disabled", () => {
    mount([{ id: "label", x: 1010, y: 100, label: "a".repeat(200) }]);
    view("label").draws = [];
    graph.updateSettings({ showConnectionLabels: false });
    frames(3);

    expect(view("label").labelBounds()).toBeUndefined();
    expect(view("label").getHitBox()[0]).toBeGreaterThan(1000);
    expect(view("label").draws).toEqual([]);

    graph.updateSettings({ showConnectionLabels: true });
    frames(3);
    expect(view("label").draws).toContain("afterRender");
  });

  it("refreshes an offscreen label when its padding constants change", () => {
    mount([{ id: "label", x: 1010, y: 100, label: "a" }]);
    view("label").draws = [];

    graph.setConstants({ connection: { LABEL: { INNER_PADDINGS: [0, 0, 0, 200] } } });
    frames(2);

    expect(view("label").getHitBox()[0]).toBeLessThan(1000);
    expect(view("label").draws).toContain("afterRender");
  });

  it("keeps a connection hidden while both endpoint owners are hidden", () => {
    mount([{ id: "connection", x: 100, y: 100 }]);
    graph.rootStore.blocksList.setBlocks(
      ["source", "target"].map((id) => ({
        id,
        is: "Block",
        name: id,
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        anchors: [],
      }))
    );
    frames(2);
    const source = graph.rootStore.blocksList.getBlockState("source");
    const target = graph.rootStore.blocksList.getBlockState("target");
    const sourceView = source?.getViewComponent();
    const targetView = target?.getViewComponent();
    if (!source || !target || !sourceView || !targetView) throw new Error("Expected endpoint owners");
    const connection = connectionState("connection");
    connection.$sourcePortState.value.setOwner(sourceView);
    connection.$targetPortState.value.setOwner(targetView);
    source.requestHidden(true);
    target.requestHidden(true);
    view("connection").draws = [];
    frames(2);
    graph.cameraService.set({ x: 10 });
    frames(2);
    expect(view("connection").draws).toEqual([]);

    source.requestHidden(false);
    frames(2);
    expect(view("connection").draws).toContain("afterRender");
  });

  it("keeps delegated connections out of batches across camera changes", () => {
    mount([{ id: "connection", x: 100, y: 100 }]);
    view("connection").setRenderDelegated(true);
    frames(2);
    view("connection").draws = [];

    graph.cameraService.set({ x: -50_000, y: -50_000 });
    frames(2);
    graph.cameraService.set({ x: 0, y: 0 });
    frames(2);
    expect(view("connection").draws).toEqual([]);
    expect(graph.getElementsOverRect({ x: 90, y: 90, width: 120, height: 20 }, [BlockConnection])).toContain(
      view("connection")
    );

    view("connection").setRenderDelegated(false);
    frames(2);
    expect(view("connection").draws).toEqual(expect.arrayContaining(["path", "arrow", "afterRender"]));
  });

  it("keeps offscreen line geometry in world rectangle and point hit queries", () => {
    mount([{ id: "far", x: 50_000, y: 50_000 }]);
    expect(graph.getElementsOverRect({ x: 49_990, y: 49_990, width: 120, height: 20 }, [BlockConnection])).toContain(
      view("far")
    );
    // jsdom cannot intersect Path2D; inspect the real path passed to the canvas hit-test boundary.
    const hit = jest.spyOn(view("far").context.ctx, "isPointInStroke").mockReturnValue(true);
    expect(graph.getElementOverPoint({ x: 50_050, y: 50_000 }, [BlockConnection])).toBe(view("far"));
    const path = hit.mock.calls[0][0] as Path2D;
    expect(path.lineTo).toHaveBeenCalledWith(50_100, 50_000);
    hit.mockRestore();
  });
});
