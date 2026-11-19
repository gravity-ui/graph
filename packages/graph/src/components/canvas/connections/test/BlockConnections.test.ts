import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { applyStyle } from "../../../../lib/scene/style";
import { entityKey } from "../../../../services/tags/TagStore";
import { selectedTag } from "../../../../services/tags/builtinTags";
import { defineTag } from "../../../../services/tags/defineTag";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import { BlockConnection } from "../BlockConnection";
import { SceneLine } from "../lines";

class StyledLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState) {
    return { ...super.getStroke(state), width: 5 };
  }
}

class StyledConnection extends BlockConnection {
  public static override line = StyledLine;
}

class CustomCanvasLine extends SceneLine {
  protected override createPath(): Path2D {
    const path = new Path2D();
    path.arc(100, 100, 10, 0, Math.PI * 2);
    return path;
  }
}

class CanvasConnection extends BlockConnection {
  public static override line = CustomCanvasLine;
}

class CustomHitLine extends SceneLine {
  public override hitTest(x: number, y: number, threshold: number): boolean {
    return super.hitTest(x, y, threshold);
  }
}

class CustomHitConnection extends BlockConnection {
  public static override line = CustomHitLine;
}

class ImmediateConnection extends BlockConnection {
  public static override readonly mode = "immediate";

  public override render(): void {}
}

function frames(): void {
  for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
}

describe("connection drawing ownership", () => {
  let graph: Graph | undefined;

  function mount(connection: typeof BlockConnection<TConnection> = BlockConnection): Graph {
    const root = document.createElement("div");
    document.body.appendChild(root);
    Object.defineProperties(root, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
    graph = new Graph(
      {
        connections: [{ id: "edge", label: "Route", sourcePortId: "start", targetPortId: "end" }],
        settings: { connection, useBezierConnections: false, showConnectionArrows: true, showConnectionLabels: true },
      },
      root
    );
    const state = graph.connections.getConnectionState("edge");
    state?.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
    state?.$targetPortState.value.updatePort({ x: 400, y: 100, lookup: false });
    graph.cameraService.set({ width: 800, height: 600, x: 0, y: 0, scale: 1 });
    graph.start();
    frames();
    return graph;
  }

  afterEach(() => {
    graph?.unmount();
    document.body.innerHTML = "";
  });

  it("publishes the default shaft, arrow, and label and uses that connection's hit target", () => {
    const graph = mount();
    const id = entityKey("connection", "edge");
    const view = graph.connections.getConnectionState("edge")?.getViewComponent();
    const element = graph.scene.store.get(id);
    expect(element?.zIndex).toBe(100);
    expect(element?.primitives.map(({ kind }) => kind)).toEqual(["path", "path", "rect", "text"]);
    expect(graph.getElementOverPoint({ x: 180, y: 100 })).toBe(view);

    graph.api.selectConnections(["edge"], true);
    frames();
    expect(graph.scene.store.get(id)?.zIndex).toBe(100);
    expect(element && graph.scene.store.zIndexOf(element)).toBe(101);
    graph.scene.styles.add([{ target: BlockConnection, tags: [selectedTag], style: { raise: 3 } }]);
    expect(element && graph.scene.store.zIndexOf(element)).toBe(103);

    graph.updateSettings({ showConnectionArrows: false, showConnectionLabels: false });
    frames();
    expect(graph.scene.store.get(id)?.primitives.map(({ kind }) => kind)).toEqual(["path"]);
  });

  it("keeps custom Canvas paths in their batch", () => {
    const graph = mount(CanvasConnection);
    const view = graph.connections.getConnectionState("edge")?.getViewComponent();
    expect(view).toBeInstanceOf(CanvasConnection);
    expect(graph.scene.store.get(entityKey("connection", "edge"))).toBeUndefined();
  });

  it("keeps the shaft of an immediate connection on the same Canvas as its render hook", () => {
    const graph = mount(ImmediateConnection);
    const view = graph.connections.getConnectionState("edge")?.getViewComponent();
    expect(view).toBeInstanceOf(ImmediateConnection);
    expect(graph.scene.store.get(entityKey("connection", "edge"))).toBeUndefined();
  });

  it("draws a Canvas decoration initialized as a connection field", () => {
    const paint = jest.fn();
    class DecoratedConnection extends BlockConnection {
      public override afterRender = (ctx: CanvasRenderingContext2D): void => paint(ctx);
    }
    const graph = mount(DecoratedConnection);
    expect(graph.scene.store.get(entityKey("connection", "edge"))).toBeUndefined();
    expect(paint).toHaveBeenCalledWith(graph.getGraphLayer().context.ctx);
  });

  it("publishes only changed derived fields, including after a direct scene edit", () => {
    const graph = mount(StyledConnection);
    const id = entityKey("connection", "edge");
    const state = graph.connections.getConnectionState("edge");
    const initial = graph.scene.store.get(id);
    if (!state || !initial) throw new Error("Expected the connection and its scene element");
    const notified = jest.fn();
    const unsubscribe = state.$state.subscribe(notified);
    notified.mockClear();
    const update = jest.spyOn(graph.scene.store, "update");
    const patches = () => update.mock.calls.filter(([key]) => key === id).map(([, patch]) => Object.keys(patch));
    const bounds = initial.bounds;
    const primitives = initial.primitives;
    graph.api.updateConnection("edge", { label: "Route" });
    frames();
    expect(notified).toHaveBeenCalled();
    expect(patches()).toEqual([]);
    expect(initial.primitives).toBe(primitives);

    graph.api.updateConnection("edge", { styles: { background: "#8844cc" } });
    frames();
    expect(patches()).toEqual([["primitives"]]);
    expect(initial.bounds).toBe(bounds);
    const styled = initial.primitives;
    graph.scene.store.update(id, { bounds: { ...bounds, minX: bounds.minX - 1 }, primitives: [], hidden: true });
    update.mockClear();
    graph.api.updateConnection("edge", { label: "Route" });
    frames();
    expect(initial.hidden).toBe(false);
    expect(initial.bounds).toEqual(bounds);
    expect(initial.primitives).toEqual(styled);
    expect(patches()).toEqual([expect.arrayContaining(["bounds", "primitives", "hidden"])]);
    unsubscribe();
  });

  it("lets a tag override a data stroke without republishing the geometry", () => {
    const graph = mount();
    const id = entityKey("connection", "edge");
    const tag = defineTag("connection-status");
    graph.api.updateConnection("edge", { styles: { background: "#aa0000" } });
    frames();
    const before = graph.scene.store.get(id);
    const shaft = before?.primitives[0];
    expect(shaft).toMatchObject({ kind: "path", stroke: { color: "#aa0000" } });
    if (!shaft) throw new Error("Expected shaft in the scene");

    graph.scene.styles.add([
      { target: BlockConnection, tags: [tag], style: { parts: { line: { color: "#228822" } } } },
    ]);
    graph.scene.tags.add(tag, { connection: ["edge"] });
    const styled = graph.scene.store.get(id);
    expect(styled?.primitives[0]).toBe(shaft);
    expect(applyStyle(shaft, graph.scene.store.getStyles()[styled?.styleId ?? 0])).toMatchObject({
      stroke: { color: "#228822" },
    });
  });

  it.each([BlockConnection, CustomHitConnection])(
    "uses the styled width when picking with %p at each scale",
    (Connection) => {
      const graph = mount(Connection);
      const view = graph.connections.getConnectionState("edge")?.getViewComponent();
      const nearShaft = { x: 180, y: 115 };
      expect(graph.getElementOverPoint(nearShaft)).toBeUndefined();
      const wide = defineTag("wide-connection");
      graph.scene.tags.add(wide, { connection: ["edge"] });
      const removeRule = graph.scene.styles.add([
        {
          target: BlockConnection,
          tags: [wide],
          style: { parts: { line: { width: { px: 20, maxWorld: 50 } } } },
        },
      ]);
      frames();
      expect(graph.getElementOverPoint(nearShaft)).toBe(view);
      graph.cameraService.set({ scale: 2 });
      frames();
      expect(graph.getElementOverPoint(nearShaft)).toBeUndefined();
      removeRule();
      graph.updateSettings({ showConnectionArrows: false });
      graph.scene.styles.add([{ target: BlockConnection, style: { parts: { line: { visible: false } } } }]);
      frames();
      expect(graph.getElementOverPoint({ x: 180, y: 100 })).toBeUndefined();
    }
  );

  it("updates geometry without republishing z-order or visibility on a port move", () => {
    const graph = mount();
    const id = entityKey("connection", "edge");
    const changes: Set<string>[] = [];
    const unsubscribe = graph.scene.store.subscribe((change) => {
      if (change.type === "update" && change.element.id === id) changes.push(new Set(change.fields));
    });
    graph.connections.getConnectionState("edge")?.$sourcePortState.value.setPoint(112, 104);
    frames();
    unsubscribe();
    expect(changes).toEqual([new Set(["bounds", "primitives"])]);
  });

  it("lets the scene own renderer choice even when a SceneLine style is configured", () => {
    const getContext = jest.mocked(HTMLCanvasElement.prototype.getContext);
    getContext.mockClear();
    const graph = mount(StyledConnection);
    expect(graph.scene.store.get(entityKey("connection", "edge"))).toBeDefined();
    expect(graph.scene.$renderer.value).toBe("canvas");
    expect(getContext.mock.calls.map(([type]) => type)).not.toContain("webgl2");
  });
});
