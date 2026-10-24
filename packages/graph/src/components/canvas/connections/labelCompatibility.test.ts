import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection, TConnectionProps } from "./BlockConnection";

class BadgeConnection extends BlockConnection<TConnection> {
  protected badge = { x: 100, y: 50, width: 40, height: 18 };

  public labelBounds() {
    return this.labelGeometry;
  }

  protected includeBadgeBounds() {
    const label = this.labelGeometry;
    if (!label) return;
    const x = Math.min(label.x, this.badge.x);
    const y = Math.min(label.y, this.badge.y);
    this.labelGeometry = {
      x,
      y,
      width: Math.max(label.x + label.width, this.badge.x + this.badge.width) - x,
      height: Math.max(label.y + label.height, this.badge.y + this.badge.height) - y,
    };
  }

  protected override renderLabelText(ctx: CanvasRenderingContext2D) {
    this.includeBadgeBounds();
    ctx.fillRect(this.badge.x, this.badge.y, this.badge.width, this.badge.height);
    super.renderLabelText(ctx);
  }
}

class PreparedBadgeConnection extends BadgeConnection {
  protected override badge = { x: 990, y: 50, width: 40, height: 18 };

  protected override updateLabelGeometry(props: TConnectionProps) {
    super.updateLabelGeometry(props);
    this.includeBadgeBounds();
  }
}

class MutatingBadgeConnection extends BadgeConnection {
  protected override includeBadgeBounds() {
    const label = this.labelGeometry;
    super.includeBadgeBounds();
    if (label && this.labelGeometry) this.labelGeometry = Object.assign(label, this.labelGeometry);
  }
}

function frames(count = 3) {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("custom connection label geometry", () => {
  let graph: Graph;

  function mount(Connection = BadgeConnection, x = 100) {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [{ id: "connection", label: "label", sourcePortId: "source", targetPortId: "target" }],
        settings: { connection: Connection, useBezierConnections: false, showConnectionLabels: true },
      },
      root
    );
    const state = graph.connections.getConnectionState("connection");
    if (!state) throw new Error("Expected connection state");
    state.$sourcePortState.value.updatePort({ x, y: 100, lookup: false });
    state.$targetPortState.value.updatePort({ x: x + 100, y: 100, lookup: false });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames();
    const view = state.getViewComponent();
    if (!(view instanceof BadgeConnection)) throw new Error("Expected badge connection");
    const fill = jest.spyOn(view.context.ctx, "fillRect");
    fill.mockClear();
    return { view, fill };
  }

  afterEach(() => graph?.unmount());

  it.each([
    { change: "replaces", Connection: BadgeConnection },
    { change: "mutates", Connection: MutatingBadgeConnection },
  ])(
    "does not paint the standard label over a badge when a subclass $change protected labelGeometry",
    ({ Connection }) => {
      const { view, fill } = mount(Connection);
      view.performRender();
      frames(1);

      // Canvas text metrics in this environment give 'label' width 6 and height 18.
      expect(fill.mock.calls).toEqual([
        [100, 50, 40, 18],
        [178, 66, 6, 18],
      ]);
      expect(view.labelBounds()).toEqual({ x: 100, y: 50, width: 84, height: 34 });
      expect(view.onHitBox({ x: 120, y: 59, minX: 120, minY: 59, maxX: 120, maxY: 59 })).toBe(true);
    }
  );

  it("uses custom bounds prepared before painting when only the badge intersects the viewport", () => {
    const { view, fill } = mount(PreparedBadgeConnection, 1100);
    view.performRender();
    frames(1);

    expect(view.isInViewport()).toBe(true);
    expect(fill.mock.calls).toEqual([
      [990, 50, 40, 18],
      [1178, 66, 6, 18],
    ]);
    expect(graph.getElementOverPoint({ x: 995, y: 59 }, [BlockConnection])).toBe(view);
  });

  it("refreshes the standard label after labels are disabled, changed and enabled at a new scale", () => {
    const { view, fill } = mount();
    graph.updateSettings({ showConnectionLabels: false });
    frames();
    expect(fill).not.toHaveBeenCalled();
    expect(view.labelBounds()).toBeUndefined();

    graph.api.updateConnection("connection", { label: "longerlabel" });
    graph.cameraService.set({ scale: 0.25 });
    graph.updateSettings({ showConnectionLabels: true });
    frames();

    expect(fill.mock.calls.slice(-2)).toEqual([
      [100, 50, 40, 18],
      [172, 38, 12, 46],
    ]);
  });
});
