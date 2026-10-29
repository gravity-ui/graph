import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";
import type { TPoint } from "../../../utils/types/shapes";

import { BlockConnection } from "./BlockConnection";
import type { TConnectionProps } from "./BlockConnection";

type TRecordedPath = Path2D & { _path: Array<{ type: string; props: { x: number; y: number } }> };

/** Draws its line, arrow and bounds shifted by data the connection does not own. */
class ExternalGeometryConnection extends BlockConnection<TConnection> {
  public static shift = { dy: 0 };

  public allowed = true;

  public afterRenders = 0;

  protected override createPath(): Path2D {
    const path = new Path2D();
    const { dy } = ExternalGeometryConnection.shift;
    path.moveTo(this.geometry.x1, this.geometry.y1 + dy);
    path.lineTo(this.geometry.x2, this.geometry.y2 + dy);
    return path;
  }

  public override createArrowPath(): Path2D {
    const path = new Path2D();
    const { dy } = ExternalGeometryConnection.shift;
    path.moveTo(this.geometry.x2, this.geometry.y2 + dy);
    path.lineTo(this.geometry.x2 - 5, this.geometry.y2 + dy - 5);
    return path;
  }

  // Culling bounds come from the box points and the arrow points: shift them like the paths.
  protected override collectBBoxPoints(props: TConnectionProps = this.props): TPoint[] {
    const { dy } = ExternalGeometryConnection.shift;
    return super.collectBBoxPoints(props).map((point) => ({ x: point.x, y: point.y + dy }));
  }

  protected override getArrowPoints(props: TConnectionProps = this.props): TPoint[] {
    const { dy } = ExternalGeometryConnection.shift;
    return super.getArrowPoints(props).map((point) => ({ x: point.x, y: point.y + dy }));
  }

  protected override isRenderAllowed(): boolean {
    return this.allowed && super.isRenderAllowed();
  }

  /** An external switch for the semantic veto; the batch re-evaluates it through applyShape(). */
  public setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.applyShape();
  }

  public override afterRender(ctx: CanvasRenderingContext2D): void {
    this.afterRenders++;
    super.afterRender?.(ctx);
  }
}

function frames(count = 1): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection geometry and semantic visibility contract", () => {
  let graph: Graph;
  let stroke: jest.SpyInstance;

  function mount(connections: Array<{ id: string; x: number; y: number }>): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: connections.map(({ id }) => ({
          id,
          sourcePortId: `${id}-source`,
          targetPortId: `${id}-target`,
        })),
        settings: {
          connection: ExternalGeometryConnection,
          useBezierConnections: false,
          showConnectionArrows: true,
        },
      },
      root
    );
    for (const { id, x, y } of connections) {
      const state = graph.connections.getConnectionState(id);
      if (!state) throw new Error(`Expected connection ${id}`);
      state.$sourcePortState.value.updatePort({ x, y, lookup: false });
      state.$targetPortState.value.updatePort({ x: x + 100, y, lookup: false });
    }
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames(3);
  }

  function view(id: string): ExternalGeometryConnection {
    const component = graph.connections.getConnectionState(id)?.getViewComponent();
    if (!(component instanceof ExternalGeometryConnection)) throw new Error(`Expected connection view ${id}`);
    return component;
  }

  /** The y of every line point stroked in the next frame. */
  function drawnYs(): number[] {
    stroke.mockClear();
    view("a").performRender();
    frames();
    return stroke.mock.calls.flatMap(([path]) =>
      path ? (path as TRecordedPath)._path.filter((event) => event.type === "lineTo").map((event) => event.props.y) : []
    );
  }

  beforeEach(() => {
    ExternalGeometryConnection.shift = { dy: 0 };
    stroke = jest.spyOn(CanvasRenderingContext2D.prototype, "stroke");
  });

  afterEach(() => {
    stroke.mockRestore();
    graph?.unmount();
  });

  it("updateGeometry() rebuilds the line, arrow, bounds and hit path from external data", () => {
    mount([{ id: "a", x: 100, y: 100 }]);
    const connection = view("a");
    const before = connection.getPath();
    expect(connection.getPathBounds()?.[1]).toBeLessThan(100);

    ExternalGeometryConnection.shift = { dy: 300 };
    connection.updateGeometry();
    frames();
    // The line ends at y 400 and the arrow's second point at 395, both in the next batch build.
    const ys = drawnYs();
    expect(ys).toContain(400);
    expect(ys).toContain(395);
    // Hit testing reads the same rebuilt path.
    expect(connection.getPath()).not.toBe(before);
    expect(connection.getPathBounds()?.[1]).toBeGreaterThan(300);
    expect(connection.isInViewport()).toBe(true);

    // Tree culling follows the new bounds as well.
    ExternalGeometryConnection.shift = { dy: 2000 };
    connection.updateGeometry();
    frames();
    expect(connection.isInViewport()).toBe(false);
  });

  it("isRenderAllowed() hides the batched line and arrow and their afterRender", () => {
    mount([{ id: "a", x: 100, y: 100 }]);
    const connection = view("a");
    expect(drawnYs()).toContain(100);

    connection.setAllowed(false);
    connection.afterRenders = 0;
    expect(drawnYs()).toEqual([]);
    expect(connection.afterRenders).toBe(0);

    connection.setAllowed(true);
    expect(drawnYs()).toContain(100);
    expect(connection.afterRenders).toBeGreaterThan(0);
  });

  it("runs afterRender only for connections in the viewport, even in a drawn chunk", () => {
    mount([
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 100, y: 5000 },
    ]);
    const visible = view("a");
    const offscreen = view("b");
    visible.afterRenders = 0;
    offscreen.afterRenders = 0;
    // Both share one chunk, which is drawn because "a" is inside the viewport.
    expect(drawnYs()).toEqual(expect.arrayContaining([100, 5000]));
    expect(visible.afterRenders).toBeGreaterThan(0);
    expect(offscreen.afterRenders).toBe(0);
  });

  it("ignores updateGeometry() after the connection unmounts", () => {
    mount([{ id: "a", x: 100, y: 100 }]);
    const connection = view("a");
    const batch = connection["context"].batch as unknown as { itemParams: Map<unknown, unknown> };
    const state = graph.connections.getConnectionState("a");
    if (!state) throw new Error("Expected connection a");
    graph.rootStore.connectionsList.deleteConnections([state]);
    frames();
    expect(batch.itemParams.has(connection)).toBe(false);
    connection.updateGeometry();
    expect(batch.itemParams.has(connection)).toBe(false);
  });
});
