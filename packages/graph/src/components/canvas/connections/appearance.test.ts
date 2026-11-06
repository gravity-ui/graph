import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";
import type { TAppearanceStroke } from "./appearance";

class RunningDashConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TAppearanceStroke {
    return { ...super.getStroke(state), dash: { pattern: [10, 5], speed: 30 } };
  }
}

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

function mount(
  settings: Record<string, unknown>,
  connection: Partial<TConnection> = {}
): { graph: Graph; view: BlockConnection<TConnection> } {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      connections: [{ id: "c", sourcePortId: "s", targetPortId: "t", ...connection }],
      settings: { useBezierConnections: false, ...settings },
    },
    root
  );
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
  state.$targetPortState.value.updatePort({ x: 400, y: 160, lookup: false });
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames();
  const view = state.getViewComponent();
  if (!(view instanceof BlockConnection)) throw new Error("Expected connection view");
  return { graph, view };
}

describe("connection appearance", () => {
  let graph: Graph | undefined;
  afterEach(() => graph?.unmount());

  it("describes a straight line as one cubic with control points on the line", () => {
    const mounted = mount({});
    graph = mounted.graph;
    const appearance = mounted.view.getAppearance();
    expect(appearance?.kind).toBe("curve");
    expect(Array.from(appearance?.segments ?? [])).toEqual([100, 100, 200, 120, 300, 140, 400, 160]);
    expect(appearance?.stroke).toEqual({ color: "#272727", width: 2, dash: undefined });
  });

  it("describes a bezier with the same control points as its Path2D", () => {
    const mounted = mount({ useBezierConnections: true, bezierConnectionDirection: "horizontal" });
    graph = mounted.graph;
    // generateBezierParams: horizontal offset max(dx / 2, 25) = 150.
    expect(Array.from(mounted.view.getAppearance()?.segments ?? [])).toEqual([100, 100, 250, 100, 250, 160, 400, 160]);
  });

  it("takes width and dash from the state and selection", () => {
    const mounted = mount({}, { dashed: true, styles: { dashes: [3, 2] } });
    graph = mounted.graph;
    graph.api.selectConnections(["c"], true);
    frames();
    expect(mounted.view.getStroke()).toEqual({ color: "#ecc113", width: 4, dash: { pattern: [3, 2] } });
  });

  it("describes the arrow as two straight segments of its chevron", () => {
    const mounted = mount({ showConnectionArrows: true });
    graph = mounted.graph;
    const segments = mounted.view.getArrowAppearance()?.segments;
    expect(segments?.length).toBe(16);
  });

  it("has no appearance when the class draws its own path", () => {
    const root = document.createElement("div");
    graph = new Graph(
      {
        connections: [
          {
            id: "m",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          } as TConnection,
        ],
      },
      root
    );
    const view = new MultipointConnection(
      {
        id: "m",
        useBezier: false,
        bezierDirection: "horizontal",
        showConnectionArrows: true,
        showConnectionLabels: false,
      },
      new BlockConnections({}, graph.getGraphLayer())
    );
    view.updatePoints();
    expect(view.getAppearance()).toBeUndefined();
    expect(view.getArrowAppearance()).toBeUndefined();
  });

  it("styles the Path2D batch from the stroke, including a running dash", () => {
    const mounted = mount({ connection: RunningDashConnection });
    graph = mounted.graph;
    const ctx = mounted.view.context.ctx;
    const now = jest.spyOn(performance, "now").mockReturnValue(2000);
    mounted.view.style(ctx);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.getLineDash()).toEqual([10, 5]);
    expect(ctx.lineDashOffset).toBe(-60);
    expect(mounted.view.isAnimated()).toBe(true);
    expect(mounted.view.getClassName()).toContain("/30");
    now.mockRestore();
  });

  it("redraws the layer every frame only while an animated Path2D chunk is in the viewport", () => {
    const mounted = mount({ connection: RunningDashConnection });
    graph = mounted.graph;
    const parent = mounted.view.getParent() as unknown as { performRender(): void };
    const performRender = jest.spyOn(parent, "performRender");
    frames(1);
    expect(performRender).toHaveBeenCalled();

    graph.cameraService.set({ x: -50_000, y: -50_000 });
    frames(3);
    performRender.mockClear();
    frames(2);
    expect(performRender).not.toHaveBeenCalled();
  });
});
