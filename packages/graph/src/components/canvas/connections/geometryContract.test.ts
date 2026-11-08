import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection } from "./BlockConnection";
import { lineSegment } from "./geometry";
import type { TConnectionGeometryFn } from "./geometry";
import type { ConnectionLine } from "./lines";

type TRecordedPath = Path2D & { _path: Array<{ type: string; props: { x: number; y: number } }> };

/** Data the connection does not own: a vertical shift of its line and arrow. */
const shift = { dy: 0 };

/** A straight line and a short arrow at the target; the bounds and the arrow's culling points follow the shift. */
const externalGeometry: TConnectionGeometryFn = ({ source, target }) => {
  const { dy } = shift;
  return {
    segments: new Float32Array(lineSegment({ x: source.x, y: source.y + dy }, { x: target.x, y: target.y + dy })),
    arrow: { points: new Float32Array([target.x, target.y + dy, target.x - 5, target.y + dy - 5]), closed: false },
  };
};

/** Draws its line, arrow and bounds shifted by data the connection does not own. */
class ExternalGeometryConnection extends BlockConnection<TConnection> {
  public static override geometry: TConnectionGeometryFn = externalGeometry;

  public allowed = true;

  public afterRenders = 0;

  public get lineItem(): ConnectionLine {
    return this.line;
  }

  protected override isRenderAllowed(): boolean {
    return this.allowed && super.isRenderAllowed();
  }

  /** An external switch for the semantic veto; the batch re-evaluates it through invalidateLine(). */
  public setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.invalidateLine();
  }

  public afterRender(_ctx: CanvasRenderingContext2D): void {
    this.afterRenders++;
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
    shift.dy = 0;
    stroke = jest.spyOn(CanvasRenderingContext2D.prototype, "stroke");
  });

  afterEach(() => {
    stroke.mockRestore();
    graph?.unmount();
  });

  it("updateGeometry() rebuilds the line, arrow, bounds and hit path from external data", () => {
    mount([{ id: "a", x: 100, y: 100 }]);
    const connection = view("a");
    const before = connection.lineItem.getPath();
    expect(connection.getPathBounds()?.[1]).toBeLessThan(100);

    shift.dy = 300;
    connection.updateGeometry();
    frames();
    // The line ends at y 400 and the arrow's second point at 395, both in the next batch build.
    const ys = drawnYs();
    expect(ys).toContain(400);
    expect(ys).toContain(395);
    // Hit testing reads the same rebuilt path.
    expect(connection.lineItem.getPath()).not.toBe(before);
    expect(connection.getPathBounds()?.[1]).toBeGreaterThan(300);
    expect(connection.isInViewport()).toBe(true);

    // Hit testing finds it at its new place and no longer at the old one.
    const near = (y: number) =>
      graph.getElementsOverRect({ x: 140, y: y - 2, width: 20, height: 4 }).includes(connection);
    expect(near(400)).toBe(true);
    expect(near(100)).toBe(false);

    // Tree culling follows the new bounds as well.
    shift.dy = 2000;
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
      { id: "b", x: 100, y: 900 },
    ]);
    const visible = view("a");
    const offscreen = view("b");
    visible.afterRenders = 0;
    offscreen.afterRenders = 0;
    // Both share one cell's chunk, which is drawn because "a" is inside the viewport.
    expect(drawnYs()).toEqual(expect.arrayContaining([100, 900]));
    expect(visible.afterRenders).toBeGreaterThan(0);
    expect(offscreen.afterRenders).toBe(0);
  });

  it("ignores updateGeometry() and invalidateLine() after the connection unmounts", () => {
    mount([{ id: "a", x: 100, y: 100 }]);
    const connection = view("a");
    const batch = connection["context"].batch;
    const state = graph.connections.getConnectionState("a");
    if (!state) throw new Error("Expected connection a");
    const line = connection.lineItem;
    expect(batch.has(line)).toBe(true);
    graph.rootStore.connectionsList.deleteConnections([state]);
    frames();
    expect(batch.has(line)).toBe(false);
    expect(batch.has(line.arrow)).toBe(false);
    connection.updateGeometry();
    connection.invalidateLine();
    expect(batch.has(line)).toBe(false);
    expect(batch.has(line.arrow)).toBe(false);
  });
});
