import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import { entityKey } from "../../../../services/tags/TagStore";
import { TConnection } from "../../../../store/connection/ConnectionState";
import { PortState } from "../../../../store/connection/port/Port";
import { BlockConnection } from "../BlockConnection";
import { MultipointConnection } from "../MultipointConnection";
import type { TMultipointConnection } from "../types";

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

  function mount(
    connection: typeof BlockConnection<TConnection> = CountingConnection,
    points?: TMultipointConnection["points"]
  ): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    const edge: TMultipointConnection = {
      id: "edge",
      label: "Edge",
      sourcePortId: "source",
      targetPortId: "target",
      points,
    };
    graph = new Graph(
      {
        connections: [edge],
        settings: { connection, useBezierConnections: false, showConnectionLabels: true },
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

    graph.cameraService.set({ x: -50, y: -20, scale: 0.75 });
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

  it("keeps delegated geometry live when scene updates are filtered and redraws a custom field on invalidate", () => {
    class MarkedConnection extends BlockConnection {
      private markerX = 10;

      public moveMarker(x: number): void {
        this.markerX = x;
        this.invalidate();
      }

      protected override shouldUpdateScene(): boolean {
        return false;
      }

      public override get zIndex(): number {
        return this.state.label === "raised" ? 250 : super.zIndex;
      }

      protected override isRenderAllowed(): boolean {
        return super.isRenderAllowed() && this.state.label !== "hidden";
      }

      protected override appendSceneLabels(primitives: TScenePrimitive[]): void {
        primitives.push({ kind: "rect", part: "marker", x: this.markerX, y: 20, width: 3, height: 3, fill: "#444" });
      }
    }
    mount(MarkedConnection);
    const state = graph.connections.getConnectionState("edge");
    const edge = state?.getViewComponent();
    if (!state || !(edge instanceof MarkedConnection)) throw new Error("Expected marked connection");
    const element = edge.getSceneElementView();
    if (!element) throw new Error("Expected connection scene element");
    const initial = element.primitives;
    graph.api.updateConnection("edge", { label: "raised", styles: { background: "#8844cc" } });
    frames();
    expect(element.zIndex).toBe(250);
    expect(element.primitives).toBe(initial);

    graph.api.updateConnection("edge", { label: "hidden" });
    frames();
    expect(element.hidden).toBe(true);
    expect(graph.getElementOverPoint({ x: 150, y: 100 })).not.toBe(edge);
    graph.api.updateConnection("edge", { label: "visible" });
    frames();
    expect(element.hidden).toBe(false);
    expect(graph.getElementOverPoint({ x: 150, y: 100 })).toBe(edge);

    edge.moveMarker(30);
    frames();
    expect(element.primitives.find((p) => p.part === "marker")).toMatchObject({ x: 30 });
    expect(element.primitives[0]).toMatchObject({ stroke: { color: "#8844cc" } });

    state.$sourcePortState.value.delegate(new PortState({ id: "delegate", x: 100, y: 300 }));
    frames();
    const shaft = element.primitives[0];
    expect(shaft.kind === "path" && Array.from(shaft.segments.slice(0, 2))).toEqual([100, 300]);
    expect(graph.getElementOverPoint({ x: 150, y: 250 })).toBe(edge);
  });

  it("refreshes a saved polyline when its source delegates without changing port coordinates", () => {
    const points = [
      { x: 150, y: 120 },
      { x: 200, y: 180 },
      { x: 300, y: 120 },
    ];
    class FilteredRoute extends MultipointConnection {
      protected override shouldUpdateScene(): boolean {
        return false;
      }
    }
    mount(FilteredRoute, points);
    const state = graph.connections.getConnectionState("edge");
    const edge = state?.getViewComponent();
    if (!state || !(edge instanceof MultipointConnection)) throw new Error("Expected multipoint connection");
    const source = state.$sourcePortState.value;
    const samePosition = new PortState({ id: "delegate", x: 100, y: 100 });
    const expectRoute = (start: number[], delegated: boolean) => {
      const shaft = graph.scene.store.get(entityKey("connection", "edge"))?.primitives[0];
      expect(Array.from(edge.getGeometry()?.segments.slice(0, 2) ?? [])).toEqual(start);
      expect(shaft?.kind === "path" && Array.from(shaft.segments.slice(0, 2))).toEqual(start);
      expect(graph.getElementOverPoint({ x: 151, y: 121 }) === edge).toBe(!delegated);
      expect(graph.getElementOverPoint({ x: 110, y: 108 }) === edge).toBe(delegated);
    };

    expectRoute([150, 120], false);
    source.delegate(samePosition);
    frames(2);
    expectRoute([100, 100], true);
    expect(state.toJSON()).toMatchObject({
      points: [
        { x: 150, y: 120 },
        { x: 200, y: 180 },
        { x: 300, y: 120 },
      ],
    });
    source.undelegate();
    frames(2);
    expectRoute([150, 120], false);

    const edit: Partial<TMultipointConnection> = { points: [{ x: 120, y: 250 }, ...points.slice(1)] };
    graph.api.updateConnection("edge", edit);
    frames();
    const shaft = edge.getSceneElementView()?.primitives[0];
    expect(shaft?.kind === "path" && Array.from(shaft.segments.slice(0, 2))).toEqual([120, 250]);
    expect(graph.getElementOverPoint({ x: 122, y: 248 })).toBe(edge);
    expect(graph.getElementOverPoint({ x: 151, y: 121 })).not.toBe(edge);
  });
});
