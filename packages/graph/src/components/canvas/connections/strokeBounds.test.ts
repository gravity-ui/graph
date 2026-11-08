import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { Tree } from "../../../lib/Tree";
import type { TConnection } from "../../../store/connection/ConnectionState";

import type { TBaseConnectionState } from "./BaseConnection";
import { BlockConnection } from "./BlockConnection";
import { Path2DLine, WebGLLine } from "./lines";
import type { TLineStroke } from "./lines";

const THRESHOLD_LINE_HIT = 8;
const SOURCE = { x: 100, y: 100 };
const TARGET = { x: 400, y: 100 };

/** Stroke widths by connection id, outside the store. */
const widths = new Map<string, number>();

function widthOf(state: TBaseConnectionState, stroke: TLineStroke): number {
  return widths.get(String(state.id)) ?? stroke.width;
}

class WidePath2DLine extends Path2DLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const stroke = super.getStroke(state);
    return { ...stroke, width: widthOf(state, stroke) };
  }
}

class WidePath2DConnection extends BlockConnection<TConnection> {
  public static override line = WidePath2DLine;
}

class WideWebGLLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const stroke = super.getStroke(state);
    return { ...stroke, width: widthOf(state, stroke) };
  }
}

class WideWebGLConnection extends BlockConnection<TConnection> {
  public static override line = WideWebGLLine;
}

const treeNode = (component: object): Tree => (component as unknown as { __comp: { treeNode: Tree } }).__comp.treeNode;

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

/** Distance from a point to the straight connection's segment. */
function distanceToLine(x: number, y: number): number {
  const t = Math.max(0, Math.min(1, (x - SOURCE.x) / (TARGET.x - SOURCE.x)));
  return Math.hypot(x - (SOURCE.x + t * (TARGET.x - SOURCE.x)), y - SOURCE.y);
}

describe("connection bounds and hit box follow the stroke width", () => {
  let graph: Graph | undefined;

  function mount(Connection: typeof BlockConnection<TConnection>, showConnectionArrows = false): BlockConnection {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [{ id: "c", sourcePortId: "c-source", targetPortId: "c-target" }],
        settings: { connection: Connection, useBezierConnections: false, showConnectionArrows },
      },
      root
    );
    const state = graph.connections.getConnectionState("c");
    if (!state) throw new Error("Expected connection c");
    state.$sourcePortState.value.updatePort({ ...SOURCE, lookup: false });
    state.$targetPortState.value.updatePort({ ...TARGET, lookup: false });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames();
    const view = state.getViewComponent();
    if (!(view instanceof BlockConnection)) throw new Error("Expected connection view c");
    // A Path2D stroke hit within half the line width the hit test sets (round caps), like Canvas2D.
    jest
      .spyOn(view.context.ctx, "isPointInStroke")
      .mockImplementation(
        (_path: Path2D | number, x: number, y?: number) =>
          y !== undefined && distanceToLine(x, y) <= view.context.ctx.lineWidth / 2
      );
    return view;
  }

  function cullingBounds(view: BlockConnection): number[] {
    const node = treeNode(view);
    return [node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY];
  }

  function hits(x: number, y: number): boolean {
    return graph?.getElementsOverPoint({ x, y }).some((item) => item instanceof BlockConnection) ?? false;
  }

  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    widths.clear();
    jest.restoreAllMocks();
  });

  it("keeps the default bounds: half the width 2, or 4 once hovered or selected", () => {
    const view = mount(BlockConnection);
    expect(view.getPathBounds()).toEqual([99, 99, 401, 101]);
    expect(cullingBounds(view)).toEqual([99, 99, 401, 101]);
    // THRESHOLD_LINE_HIT plus half the width: [x, y, width, height].
    expect(view.getHitBox()).toEqual([91, 91, 318, 18]);

    // A state change recomputes the geometry, so the wider selected stroke widens the bounds and the hit box.
    graph?.api.selectConnections(["c"], true);
    frames();
    expect(view.getPathBounds()).toEqual([98, 98, 402, 102]);
    expect(cullingBounds(view)).toEqual([98, 98, 402, 102]);
    expect(view.getHitBox()).toEqual([90, 90, 320, 20]);
  });

  it("keeps the default arrow padding: half the width times the miter limit, and covers the arrow in the hit box", () => {
    const view = mount(BlockConnection, true);
    const arrow = view.getGeometry()?.arrow?.points;
    if (!arrow) throw new Error("Expected the chevron");
    const ys = [arrow[1], arrow[3], arrow[5]];
    const xs = [arrow[0], arrow[2], arrow[4]];
    const miter = view.context.ctx.miterLimit;
    expect(view.getPathBounds()).toEqual([99, Math.min(...ys) - miter, 401, Math.max(...ys) + miter]);
    const pad = THRESHOLD_LINE_HIT + 1;
    const [x, y, width, height] = view.getHitBox();
    expect([x, y, x + width, y + height]).toEqual([
      Math.min(SOURCE.x, ...xs) - pad,
      Math.min(...ys) - pad,
      Math.max(TARGET.x, ...xs) + pad,
      Math.max(...ys) + pad,
    ]);
  });

  it.each([
    ["Path2DLine", WidePath2DConnection],
    ["WebGLLine", WideWebGLConnection],
  ] as const)("hits a 14-unit %s up to 7 + THRESHOLD_LINE_HIT from the line, through the broad phase", (_, Klass) => {
    widths.set("c", 14);
    const view = mount(Klass);
    const reach = 14 / 2 + THRESHOLD_LINE_HIT;

    expect(view.getPathBounds()).toEqual([93, 93, 407, 107]);
    expect(cullingBounds(view)).toEqual([93, 93, 407, 107]);

    // Past the end of the bounds: the round end reaches as far as the sides.
    expect(hits(TARGET.x + reach - 0.5, TARGET.y)).toBe(true);
    expect(hits(TARGET.x + reach + 0.5, TARGET.y)).toBe(false);
    expect(hits(SOURCE.x - reach + 0.5, SOURCE.y)).toBe(true);
    expect(hits(SOURCE.x - reach - 0.5, SOURCE.y)).toBe(false);
    // Beside the line.
    expect(hits(250, SOURCE.y + reach - 0.5)).toBe(true);
    expect(hits(250, SOURCE.y + reach + 0.5)).toBe(false);
  });

  it("follows a width that changes outside the store through invalidateLine()", () => {
    const view = mount(WidePath2DConnection);
    expect(view.getPathBounds()).toEqual([99, 99, 401, 101]);
    expect(hits(TARGET.x + 12, TARGET.y)).toBe(false);

    widths.set("c", 10);
    view.invalidateLine();
    frames();
    expect(view.getPathBounds()).toEqual([95, 95, 405, 105]);
    expect(cullingBounds(view)).toEqual([95, 95, 405, 105]);
    expect(view.getHitBox()).toEqual([87, 87, 326, 26]);
    expect(hits(TARGET.x + 12, TARGET.y)).toBe(true);
  });

  it("reads the stroke once per geometry update", () => {
    const view = mount(WidePath2DConnection);
    const stroke = jest.spyOn(WidePath2DLine.prototype, "getStroke");
    view.updateGeometry();
    expect(stroke).toHaveBeenCalledTimes(1);
  });
});
