import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { TConnection } from "../../../../store/connection/ConnectionState";
import { BlockConnection } from "../BlockConnection";
import { MultipointConnection } from "../MultipointConnection";
import { TMultipointConnection } from "../types";

function pointHitBox(x: number, y: number) {
  return { x, y, minX: x, minY: y, maxX: x, maxY: y };
}

describe("connection paint bounds at the viewport edge", () => {
  let graph: Graph;

  afterEach(() => {
    graph?.unmount();
  });

  function start(
    connection: TConnection,
    Component: typeof BlockConnection<TConnection> = BlockConnection,
    threshold = 0,
    arrows = true
  ) {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        connections: [connection],
        settings: { connection: Component, useBezierConnections: false, showConnectionArrows: arrows },
      },
      root,
      undefined,
      { connection: { THRESHOLD_LINE_HIT: threshold } }
    );
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    return graph.connections.getConnectionState("c");
  }

  function draw() {
    graph.start();
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    const view = graph.connections.getConnectionState("c")?.getViewComponent();
    if (!(view instanceof BlockConnection)) throw new Error("Expected connection view");
    const element = graph.scene.store
      .query({ minX: 0, minY: 0, maxX: 1000, maxY: 800 }, graph.scene.$level.value)
      .find(({ id }) => id === view.getSceneKey()?.elementId);
    return { view, primitives: element?.primitives };
  }

  it("draws a short multipoint arrow entering the viewport; the hit box covers the arrow", () => {
    const connection: TMultipointConnection = {
      id: "c",
      sourcePortId: "s",
      targetPortId: "t",
      points: [
        { x: 1010, y: 100 },
        { x: 1011, y: 100 },
      ],
    };
    const state = start(connection, MultipointConnection, 8);
    if (!state) throw new Error("Expected connection");
    state.$sourcePortState.value.updatePort({ x: 1010, y: 100, lookup: false });
    state.$targetPortState.value.updatePort({ x: 1011, y: 100, lookup: false });
    const { view, primitives } = draw();
    // The triangle's base at x 995, padded by THRESHOLD_LINE_HIT 8 and half the width 2.
    expect(view.getHitBox()[0]).toBe(986);
    expect(view.isInViewport()).toBe(true);
    expect(primitives).toContainEqual(
      expect.objectContaining({
        kind: "polygon",
        part: "arrow",
        points: new Float32Array([1011, 100, 995, 105, 995, 95]),
      })
    );
    expect(view.onHitBox(pointHitBox(988, 104))).toBe(true);
  });

  it.each([1005, 1008])(
    "draws a regular arrow or its stroke entering the viewport from x=%s with no hit threshold",
    (x) => {
      const state = start({ id: "c", sourcePortId: "s", targetPortId: "t" });
      if (!state) throw new Error("Expected connection");
      state.$sourcePortState.value.updatePort({ x, y: 100, lookup: false });
      state.$targetPortState.value.updatePort({ x: x + 1, y: 100, lookup: false });
      graph.api.selectConnections(["c"], true);
      const { view, primitives } = draw();
      // The chevron's wings 7.5 before the line, padded by half the selected width 4.
      expect(view.getHitBox()[0]).toBe(x - 9.5);
      expect(view.isInViewport()).toBe(true);
      expect(primitives).toContainEqual(expect.objectContaining({ kind: "path", part: "arrow" }));
      expect(view.onHitBox(pointHitBox(x - 8.5, 92))).toBe(true);
    }
  );

  it("draws the selected line stroke entering the viewport with no arrows or hit threshold", () => {
    const state = start({ id: "c", sourcePortId: "s", targetPortId: "t" }, BlockConnection, 0, false);
    if (!state) throw new Error("Expected connection");
    state.$sourcePortState.value.updatePort({ x: 1001.5, y: 100, lookup: false });
    state.$targetPortState.value.updatePort({ x: 1001.5, y: 200, lookup: false });
    graph.api.selectConnections(["c"], true);
    const { view, primitives } = draw();
    // Half the selected width 4 past the line.
    expect(view.getHitBox()[0]).toBe(999.5);
    expect(view.isInViewport()).toBe(true);
    expect(primitives?.map(({ part }) => part)).toEqual(["line"]);
    expect(view.onHitBox(pointHitBox(1000, 150))).toBe(true);
  });
});
