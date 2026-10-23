import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection, TConnectionProps } from "./BlockConnection";

class SelectedLabelConnection extends BlockConnection<TConnection> {
  protected override updateLabelGeometry(props: TConnectionProps): void {
    super.updateLabelGeometry(props);
    if (!this.state.selected) this.labelGeometry = undefined;
  }

  protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
    if (this.labelGeometry) super.renderLabelText(ctx);
  }
}

function frame() {
  globalScheduler.performUpdate();
}

describe.each([true, false])("selected-only custom labels with traversal culling %s", (enabled) => {
  let graph: Graph;

  function mount(label: string | undefined) {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [{ id: "connection", label, sourcePortId: "source", targetPortId: "target" }],
        settings: {
          connection: SelectedLabelConnection,
          useBezierConnections: false,
          showConnectionArrows: false,
          showConnectionLabels: true,
          EXP_VISIBILITY_CULLING: enabled,
        },
      },
      root
    );
    const state = graph.connections.getConnectionState("connection");
    if (!state) throw new Error("Expected connection state");
    // The line is below the viewport; its label alone can reach y=786.
    state.$sourcePortState.value.updatePort({ x: 100, y: 820, lookup: false });
    state.$targetPortState.value.updatePort({ x: 200, y: 820, lookup: false });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frame();
    frame();
    const view = state.getViewComponent();
    if (!(view instanceof SelectedLabelConnection)) throw new Error("Expected custom connection");
    return { view, text: jest.mocked(view.context.ctx.fillText) };
  }

  afterEach(() => graph?.unmount());

  it("prepares selected-only bounds before the first paint and updates them while the line stays offscreen", () => {
    const { view, text } = mount("label");
    expect(view.isInViewport()).toBe(false);
    expect(text).not.toHaveBeenCalled();
    expect(graph.getElementOverPoint({ x: 180, y: 790 }, [BlockConnection])).toBeUndefined();

    graph.api.selectConnections(["connection"], true);
    frame();

    expect(view.isInViewport()).toBe(true);
    expect(text).toHaveBeenLastCalledWith("label", 178, 786);
    expect(graph.getElementOverPoint({ x: 180, y: 790 }, [BlockConnection])).toBe(view);
    text.mockClear();

    graph.api.selectConnections(["connection"], false);
    frame();

    expect(view.isInViewport()).toBe(false);
    expect(text).not.toHaveBeenCalled();
    expect(graph.getElementOverPoint({ x: 180, y: 790 }, [BlockConnection])).toBeUndefined();
  });

  it("refreshes an offscreen selected connection when its label is added or removed", () => {
    const { view, text } = mount(undefined);
    graph.api.selectConnections(["connection"], true);
    frame();
    expect(view.isInViewport()).toBe(false);
    expect(text).not.toHaveBeenCalled();

    graph.api.updateConnection("connection", { label: "longerlabel" });
    frame();

    expect(view.isInViewport()).toBe(true);
    expect(text).toHaveBeenLastCalledWith("longerlabel", 172, 786);
    expect(graph.getElementOverPoint({ x: 174, y: 790 }, [BlockConnection])).toBe(view);
    text.mockClear();

    graph.api.updateConnection("connection", { label: undefined });
    frame();

    expect(view.isInViewport()).toBe(false);
    expect(text).not.toHaveBeenCalled();
    expect(graph.getElementOverPoint({ x: 174, y: 790 }, [BlockConnection])).toBeUndefined();
  });
});
