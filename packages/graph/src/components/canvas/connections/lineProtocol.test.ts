import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TBatchParams } from "../../../lib/batch/types";
import type { TScenePrimitive } from "../../../lib/scene/types";
import type { HitBoxData } from "../../../services/HitTest";
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

function pathsOf(graph: Graph, id: string): Extract<TScenePrimitive, { kind: "path" }>[] {
  const key = view(graph, id).getSceneKey();
  const primitives = key && graph.scene.store.get(key.elementId)?.primitives;
  return primitives?.filter((primitive) => primitive.kind === "path") ?? [];
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

/** A line typed for its connection class: it reads the connection's own member without a cast. */
class TaggedLine extends Path2DLine<TaggedConnection> {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    return { ...super.getStroke(state), color: this.connection.getTagColor() };
  }
}

/** Assigns a line typed for this subclass as `static line`: this must compile without a cast. */
class TaggedConnection extends BlockConnection<TConnection> {
  public static override line = TaggedLine;

  public getTagColor(): string {
    return "#333";
  }
}

describe("BlockConnection line protocol", () => {
  let graph: Graph | undefined;

  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    outsideColors.clear();
    jest.restoreAllMocks();
  });

  it("puts the default shaft and open arrow into each connection's scene element", () => {
    graph = mount();
    const color = view(graph, "a").context.colors.connection.background;
    expect(registered(graph).size).toBe(0);
    for (const id of ["a", "b"]) {
      expect(pathsOf(graph, id).map(({ part, stroke }) => [part, stroke])).toEqual([
        ["line", { color, width: 2 }],
        ["arrow", { color, width: 2 }],
      ]);
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

  it("widens the hovered shaft and arrow and raises their scene element", () => {
    graph = mount();
    const connection = view(graph, "a");
    const other = view(graph, "b");

    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: 180, clientY: 100 }));
    expect(graph.getGraphLayer().$hoveredComponent.value).toBe(connection);
    frames(8);

    expect(pathsOf(graph, "a").map(({ stroke }) => stroke.width)).toEqual([4, 4]);
    expect(pathsOf(graph, "b").map(({ stroke }) => stroke.width)).toEqual([2, 2]);
    expect(graph.scene.compareOrder(connection, other)).toBeGreaterThan(0);
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
    expect(b.getGeometry()?.arrow?.closed).toBe(false);
    const id = a.getSceneKey()?.elementId;
    expect(id && graph.scene.store.get(id)?.primitives.some(({ kind }) => kind === "polygon")).toBe(true);
    const otherId = b.getSceneKey()?.elementId;
    expect(otherId && graph.scene.store.get(otherId)?.primitives.some(({ kind }) => kind === "polygon")).toBe(false);
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

  it("accepts a line class typed for a connection subclass as static line", () => {
    graph = mount({ connection: TaggedConnection });
    const line = lineOf(view(graph, "a"));
    expect(line).toBeInstanceOf(TaggedLine);
    expect(registered(graph).get(line)?.group).toBe("line/#333/2/");
  });

  it("hit-tests the line at the world center of the hit box with the threshold in world units", () => {
    graph = mount();
    const a = view(graph, "a");
    const box: HitBoxData = { minX: 179, maxX: 181, minY: 99, maxY: 101, x: 0, y: 0 };
    const hitTestLabel = jest.spyOn(a as unknown as { hitTestLabel(shape: HitBoxData): boolean }, "hitTestLabel");

    expect(a.onHitBox(box)).toBe(true);
    expect(a.context.constants.connection.THRESHOLD_LINE_HIT).toBe(8);
    expect(hitTestLabel).not.toHaveBeenCalled();

    // A line miss falls through to the label: none here, then a label hit.
    expect(a.onHitBox({ ...box, minY: 108, maxY: 109 })).toBe(true);
    const miss = { ...box, minY: 109, maxY: 110 };
    expect(a.onHitBox(miss)).toBe(false);
    expect(hitTestLabel).toHaveBeenCalledWith(miss);
    hitTestLabel.mockReturnValue(true);
    expect(a.onHitBox(miss)).toBe(true);
  });
});
