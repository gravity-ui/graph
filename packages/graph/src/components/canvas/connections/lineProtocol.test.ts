import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TBatchParams } from "../../../lib/batch/types";
import type { TConnection } from "../../../store/connection/ConnectionState";

import type { TBaseConnectionState } from "./BaseConnection";
import { BlockConnection } from "./BlockConnection";
import type { BlockConnections } from "./BlockConnections";
import type { IConnectionBatch, IConnectionBatchItem } from "./batch";
import { generateBezierParams, getArrowCoords } from "./bezierHelpers";
import { bezierGeometry, multipointGeometry } from "./geometry";
import type { TConnectionGeometryFn } from "./geometry";
import { Path2DLine } from "./lines";
import type { ConnectionLine, TLineStroke } from "./lines";
import type { TMultipointConnection } from "./types";

type TBlockConnectionsInternals = {
  batch: IConnectionBatch;
};

type TMockPath = Path2D & Record<"moveTo" | "lineTo" | "bezierCurveTo" | "closePath", jest.Mock>;

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

function mount(settings: Record<string, unknown> = {}, root = document.createElement("div")): Graph {
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      connections: [
        { id: "a", sourcePortId: "a-source", targetPortId: "a-target" },
        { id: "b", sourcePortId: "b-source", targetPortId: "b-target" },
      ],
      settings: { useBezierConnections: false, showConnectionArrows: true, ...settings },
    },
    root
  );
  for (const [id, y] of [
    ["a", 100],
    ["b", 300],
  ] as const) {
    const state = graph.connections.getConnectionState(id);
    if (!state) throw new Error(`Expected connection ${id}`);
    state.$sourcePortState.value.updatePort({ x: 100, y, lookup: false });
    state.$targetPortState.value.updatePort({ x: 400, y, lookup: false });
  }
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames();
  return graph;
}

function view(graph: Graph, id: string): BlockConnection<TConnection> {
  const component = graph.connections.getConnectionState(id)?.getViewComponent();
  if (!(component instanceof BlockConnection)) throw new Error(`Expected connection view ${id}`);
  return component;
}

function internals(graph: Graph): TBlockConnectionsInternals {
  return view(graph, "a").getParent() as unknown as BlockConnections & TBlockConnectionsInternals;
}

function lineOf(connection: BlockConnection<TConnection>): ConnectionLine {
  return (connection as unknown as { line: ConnectionLine }).line;
}

/** Every item of the connections batch with its z-level and group. */
function registered(graph: Graph): Map<IConnectionBatchItem, TBatchParams> {
  const items = new Map<IConnectionBatchItem, TBatchParams>();
  internals(graph).batch.forEachItem((item, params) => items.set(item, { ...params }));
  return items;
}

type TKindConnection = TMultipointConnection & { kind?: "polyline" | "bezier" };

function isPolyline(connection: Readonly<TConnection>): connection is Readonly<TKindConnection> {
  return (connection as Partial<TKindConnection>).kind === "polyline";
}

const mixedGeometry: TConnectionGeometryFn = (input) =>
  isPolyline(input.connection) ? multipointGeometry(input) : bezierGeometry(input);

class MixedConnection extends BlockConnection<TKindConnection> {
  public static override geometry: TConnectionGeometryFn = mixedGeometry;
}

/** Stroke colors that live outside the store, by connection id. */
const outsideColors = new Map<string, string>();

class MappedLine extends Path2DLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    return { ...super.getStroke(state), color: outsideColors.get(String(state.id)) ?? "#000" };
  }
}

class MappedConnection extends BlockConnection<TConnection> {
  public static override line = MappedLine;
}

describe("BlockConnection line protocol", () => {
  let graph: Graph | undefined;

  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    outsideColors.clear();
    jest.restoreAllMocks();
  });

  it("draws a default graph through Path2DLine: a line item per connection and its arrow one level below", () => {
    graph = mount();
    const items = registered(graph);
    const connection = view(graph, "a");
    const zIndex = connection.zIndex;
    const color = connection.context.colors.connection.background;

    expect(items.size).toBe(4);
    for (const id of ["a", "b"]) {
      const line = lineOf(view(graph, id));
      expect(line).toBeInstanceOf(Path2DLine);
      expect(items.get(line)).toEqual({ zIndex, group: `line/${color}/2/` });
      expect(items.get(line.arrow)).toEqual({ zIndex: zIndex - 1, group: `arrow/open/${color}/2//line/${color}/2/` });
    }
  });

  it.each([false, true])("builds the Path2D calls of the default line and chevron (Bezier: %s)", (useBezier) => {
    graph = mount({ useBezierConnections: useBezier });
    const connection = view(graph, "a");
    const line = lineOf(connection);
    const path = line.getPath() as TMockPath;
    const arrow = line.getArrowPath() as TMockPath;
    const source = { x: 100, y: 100 };
    const target = { x: 400, y: 100 };

    expect(path.moveTo.mock.calls).toEqual([[source.x, source.y]]);
    if (useBezier) {
      const [, c1, c2] = generateBezierParams(source, target, "horizontal");
      expect(path.bezierCurveTo.mock.calls).toEqual([[c1.x, c1.y, c2.x, c2.y, target.x, target.y]]);
      expect(path.lineTo).not.toHaveBeenCalled();
    } else {
      expect(path.lineTo.mock.calls).toEqual([[target.x, target.y]]);
      expect(path.bezierCurveTo).not.toHaveBeenCalled();
    }
    // The chevron's points are stored as float32, the precision Canvas2D paths keep.
    const [x1, y1, x2, y2, x3, y3] = getArrowCoords(
      useBezier,
      source.x,
      source.y,
      target.x,
      target.y,
      "horizontal"
    ).map((value) => Math.fround(value));
    expect(arrow.moveTo.mock.calls).toEqual([[x1, y1]]);
    expect(arrow.lineTo.mock.calls).toEqual([
      [x2, y2],
      [x3, y3],
    ]);
    expect(arrow.closePath).not.toHaveBeenCalled();
  });

  it("moves a hovered line to a wider group above the others", () => {
    graph = mount();
    const connection = view(graph, "a");
    const zIndex = connection.zIndex;
    const color = connection.context.colors.connection.background;

    (connection as unknown as { onHoverChange(hovered: boolean): void }).onHoverChange(true);
    frames(1);

    const line = lineOf(connection);
    const items = registered(graph);
    expect(items.get(line)).toEqual({ zIndex: zIndex + 10, group: `line/${color}/4/` });
    expect(items.get(line.arrow)).toEqual({ zIndex: zIndex + 9, group: `arrow/open/${color}/4//line/${color}/4/` });
    expect(items.get(lineOf(view(graph, "b")))).toEqual({ zIndex, group: `line/${color}/2/` });
  });

  it("switches the shape with the connection's data through static geometry", () => {
    graph = mount({ connection: MixedConnection });
    const a = view(graph, "a");
    const b = view(graph, "b");
    expect(a.getGeometry()?.arrow?.closed).toBe(false);

    const polyline: Partial<TKindConnection> = {
      kind: "polyline",
      points: [
        { x: 100, y: 100 },
        { x: 250, y: 150 },
        { x: 400, y: 100 },
      ],
    };
    graph.api.updateConnection("a", polyline);
    frames();

    expect(a.getGeometry()?.arrow?.closed).toBe(true);
    const items = registered(graph);
    expect(items.get(lineOf(a).arrow)?.group).toMatch(/^arrow\/closed\//);
    expect(items.get(lineOf(b).arrow)?.group).toMatch(/^arrow\/open\//);
  });

  it("invalidateLine() reads a stroke that depends on data outside the store again", () => {
    outsideColors.set("a", "#111");
    graph = mount({ connection: MappedConnection });
    const a = view(graph, "a");
    expect(lineOf(a)).toBeInstanceOf(MappedLine);
    expect(registered(graph).get(lineOf(a))?.group).toBe("line/#111/2/");

    outsideColors.set("a", "#222");
    frames();
    expect(registered(graph).get(lineOf(a))?.group).toBe("line/#111/2/");

    a.invalidateLine();
    expect(registered(graph).get(lineOf(a))?.group).toBe("line/#222/2/");
  });

  it("hit-tests the line at the world center of the hit box with the threshold in world units", () => {
    graph = mount();
    const a = view(graph, "a");
    const hitTest = jest.spyOn(Path2DLine.prototype, "hitTest");

    a.onHitBox({ minX: 249, maxX: 251, minY: 99, maxY: 101, x: 0, y: 0 });

    expect(a.context.constants.connection.THRESHOLD_LINE_HIT).toBe(8);
    expect(hitTest).toHaveBeenCalledWith(250, 100, 8);
  });
});
