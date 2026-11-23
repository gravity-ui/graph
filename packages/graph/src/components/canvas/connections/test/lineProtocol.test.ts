import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { defineSceneEffect } from "../../../../lib/scene/effects/defineSceneEffect";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import type { HitBoxData } from "../../../../services/HitTest";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import { BlockConnection } from "../BlockConnection";
import type { BlockConnections } from "../BlockConnections";
import type { IConnectionBatch } from "../batch";
import { bezierGeometry, multipointGeometry } from "../geometry";
import type { TConnectionGeometryFn } from "../geometry";
import { stockBezierSegments } from "../geometry/segments";
import { SceneLine } from "../lines";
import type { ConnectionLine, TLineStroke, TSceneLineStroke } from "../lines";
import type { TMultipointConnection } from "../types";

type TBlockConnectionsInternals = {
  batch: IConnectionBatch;
};

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

class MappedLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    return { ...super.getStroke(state), color: outsideColors.get(String(state.id)) ?? "#000" };
  }
}

class MappedConnection extends BlockConnection<TConnection> {
  public static override line = MappedLine;
}

/** A line typed for its connection class: it reads the connection's own member without a cast. */
class TaggedLine extends SceneLine<TaggedConnection> {
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

  it("keeps a direct, scoped WebGL effect on the shaft", () => {
    const effect = defineSceneEffect({
      kind: "path",
      fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
    });
    class ScopedLine extends SceneLine {
      public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
        return { ...super.getStroke(state), effect: { effect, params: [3], minScale: 0.5, maxScale: 1 } };
      }
    }
    class ScopedConnection extends BlockConnection {
      public static override line = ScopedLine;
    }
    graph = mount({ connection: ScopedConnection });
    const [shaft, arrow] = pathsOf(graph, "a");
    expect(shaft?.effect).toEqual({ effect, params: [3], minScale: 0.5, maxScale: 1 });
    expect(arrow?.part).toBe("arrow");
    expect(arrow?.effect).toBeUndefined();
  });

  it("keeps a new effect resource, exact shader params and the stock geometry certificate observable", () => {
    const definition = {
      kind: "path" as const,
      fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
    };
    let effect = defineSceneEffect(definition);
    let param = 0;
    let certified = true;
    class ExternalLine extends SceneLine {
      public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
        return { ...super.getStroke(state), effect: { effect, params: [param] } };
      }
    }
    class ExternalConnection extends BlockConnection {
      public static override line = ExternalLine;
      public static override geometry: TConnectionGeometryFn = (input) => {
        const shape = bezierGeometry(input);
        return shape && !certified ? { ...shape, segments: shape.segments.slice() } : shape;
      };
    }
    const mounted = (graph = mount({ connection: ExternalConnection }));
    const refresh = () => {
      mounted.api.updateConnection("a", {});
      frames();
      return pathsOf(mounted, "a")[0];
    };
    const original = refresh();
    expect(refresh()).toBe(original);
    effect = defineSceneEffect(definition);
    expect(refresh().effect?.effect).toBe(effect);
    param = -0;
    expect(refresh().effect?.params?.[0]).toBe(-0);
    expect(stockBezierSegments.has(original.segments)).toBe(true);
    certified = false;
    expect(stockBezierSegments.has(refresh().segments)).toBe(false);
  });

  it("publishes independent scene values when custom geometry and styles reuse mutable inputs", () => {
    const segments = new Float32Array([100, 100, 180, 100, 320, 100, 400, 100]);
    const triangle = new Float32Array([390, 96, 400, 100, 390, 104]);
    const pattern = [8, 4];
    const params = [1];
    const interaction = { hovered: false, selected: false, selectionColor: "#bbb" };
    const effect = defineSceneEffect({
      kind: "path",
      fragment: "vec4 effect(PathFragment f, vec4 c) { return c; }",
    });
    class ReusingLine extends SceneLine {
      public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
        return { ...super.getStroke(state), dash: { pattern }, effect: { effect, params } };
      }
      public override getSceneStrokeEffect() {
        const shape = super.getSceneStrokeEffect();
        return shape && { ...shape, interaction };
      }
    }
    class ReusingConnection extends BlockConnection {
      public static override line = ReusingLine;
      public static override geometry: TConnectionGeometryFn = () => ({
        segments,
        arrow: { points: triangle, closed: true },
      });
    }
    const mounted = (graph = mount({ connection: ReusingConnection }));
    const refresh = () => {
      mounted.api.updateConnection("a", {});
      frames();
      return pathsOf(mounted, "a")[0];
    };
    const before = pathsOf(mounted, "a")[0];
    segments[2] = 165;
    expect(before.segments[2]).toBe(180);
    const moved = refresh();
    expect(moved.segments[2]).toBe(165);
    params[0] = 2;
    expect(moved.effect?.params).toEqual([1]);
    const styled = refresh();
    expect(styled.effect?.params).toEqual([2]);
    pattern[0] = 12;
    expect(styled.stroke.dash).toEqual([8, 4]);
    const dashed = refresh();
    expect(dashed.stroke.dash).toEqual([12, 4]);
    interaction.selected = true;
    expect(dashed.interaction?.selected).toBe(false);
    const selected = refresh();
    expect(selected.interaction?.selected).toBe(true);

    const key = view(mounted, "a").getSceneKey();
    const polygon = () => key && mounted.scene.store.get(key.elementId)?.primitives.find((p) => p.kind === "polygon");
    const oldTriangle = polygon();
    triangle[0] = 385;
    expect(oldTriangle?.points[0]).toBe(390);
    refresh();
    expect(polygon()?.points[0]).toBe(385);

    pathsOf(mounted, "a")[0].segments[2] = -100;
    expect(refresh().segments[2]).toBe(165);
  });

  it("restores a connection's primitives in place after a direct store edit", () => {
    graph = mount();
    const connection = view(graph, "a");
    const key = connection.getSceneKey();
    const element = key && graph.scene.store.get(key.elementId);
    if (!element) throw new Error("Expected a scene element for connection a");
    const { primitives, order, styleId } = element;
    graph.scene.store.update(element.id, { primitives: [] });
    connection.invalidateLine();
    expect(graph.scene.store.get(element.id)).toMatchObject({ primitives, order, styleId });
  });

  it("leaves a replacement scene element and its style alone when the old connection updates and unmounts", () => {
    graph = mount();
    const old = view(graph, "a");
    const key = old.getSceneKey();
    const state = graph.connections.getConnectionState("a");
    if (!key || !state) throw new Error("Expected a published connection a");
    const store = graph.scene.store;
    store.delete(key.elementId);
    const replacement = store.add({
      id: key.elementId,
      x: 0,
      y: 0,
      zIndex: 42,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      primitives: [],
    });
    const styleId = store.defineStyle({ raise: 1 });
    store.setStyle(replacement.id, styleId);

    graph.api.selectConnections(["a"], true);
    old.invalidateLine();
    old.invalidateLine();
    graph.connections.deleteConnections([state]);
    frames();
    expect(store.get(replacement.id)).toBe(replacement);
    expect(replacement).toMatchObject({ zIndex: 42, primitives: [], styleId });
  });

  it("puts the default shaft and open arrow into each connection's scene element", () => {
    graph = mount();
    const color = view(graph, "a").context.colors.connection.background;
    const { batch } = internals(graph);
    for (const id of ["a", "b"]) {
      const line = lineOf(view(graph, id));
      expect(batch.has(line)).toBe(false);
      expect(batch.has(line.arrow)).toBe(false);
      expect(pathsOf(graph, id).map(({ part, stroke }) => [part, stroke])).toEqual([
        ["line", { color, width: 2 }],
        ["arrow", { color, width: 2 }],
      ]);
    }
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
    expect(id && graph.scene.store.get(id)?.primitives).toContainEqual(
      expect.objectContaining({ kind: "path", part: "arrow", closed: true })
    );
    const otherId = b.getSceneKey()?.elementId;
    expect(otherId && graph.scene.store.get(otherId)?.primitives).toContainEqual(
      expect.objectContaining({ kind: "path", part: "arrow", closed: false })
    );
  });

  it("invalidateLine() reads a stroke that depends on data outside the store again", () => {
    outsideColors.set("a", "#111");
    graph = mount({ connection: MappedConnection });
    const a = view(graph, "a");
    expect(lineOf(a)).toBeInstanceOf(MappedLine);
    expect(pathsOf(graph, "a")[0]?.stroke.color).toBe("#111");

    outsideColors.set("a", "#222");
    frames();
    expect(pathsOf(graph, "a")[0]?.stroke.color).toBe("#111");

    a.invalidateLine();
    expect(pathsOf(graph, "a")[0]?.stroke.color).toBe("#222");
  });

  it("accepts a line class typed for a connection subclass as static line", () => {
    graph = mount({ connection: TaggedConnection });
    const line = lineOf(view(graph, "a"));
    expect(line).toBeInstanceOf(TaggedLine);
    expect(pathsOf(graph, "a")[0]?.stroke.color).toBe("#333");
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
