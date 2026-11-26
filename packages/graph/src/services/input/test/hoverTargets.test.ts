import type { TBlock } from "../../../components/canvas/blocks/Block";
import type { BaseConnection } from "../../../components/canvas/connections/BaseConnection";
import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { BlockGroups } from "../../../components/canvas/groups/BlockGroups";
import { Group } from "../../../components/canvas/groups/Group";
import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { hoveredTag } from "../../../services/tags/builtinTags";
import type { TConnection } from "../../../store/connection/ConnectionState";

/**
 * The scene target under a still pointer for camera-derived hit boxes, and the `hoveredTag`
 * writes of connections and groups: each is tagged while it is the pointer's target, whatever its interactivity.
 */

const block = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 50,
  anchors: [],
});

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("Graph input targets and the hover tags of connections and groups", () => {
  let graph: Graph;

  /** Blocks a (x 0..100) and b (x 400..500), y 0..50, and connection c from a to b along y 25. */
  function start(connection: Partial<TConnection> = {}, settings: Record<string, unknown> = {}): void {
    const root = document.body.appendChild(document.createElement("div"));
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBezierConnections: false, ...settings } }, root);
    graph.setEntities({
      blocks: [block("a", 0), block("b", 400)],
      connections: [{ id: "c", sourceBlockId: "a", targetBlockId: "b", ...connection }],
    });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    frames();
  }

  const move = (x: number, y: number): void => {
    graph.layers.$root?.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y })
    );
    jest.advanceTimersByTime(80);
    frames(1);
  };
  const tagged = (type: string, id: string): boolean => graph.scene.tags.peekOf(type, id).has(hoveredTag);
  /** The line hits wherever its hit box does (jsdom's canvas has no stroke test). */
  const hitLine = (): void => {
    jest.spyOn(graph.getGraphLayer().context.ctx, "isPointInStroke").mockReturnValue(true);
  };
  const connectionView = (): BaseConnection | undefined =>
    graph.rootStore.connectionsList.getConnectionState("c")?.getViewComponent();

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    const root = graph.layers.$root;
    graph.unmount();
    root?.remove();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("routes root hover through graph.input for exactly one start/stop session", () => {
    start();
    const root = graph.layers.$root;
    if (!root) throw new Error("Graph root is missing");
    const block = graph.blocks.getBlockState("a")?.getViewComponent();
    const entered = jest.fn();
    graph.on("pointerenter", entered);
    const moveOverBlock = () =>
      root.dispatchEvent(
        new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 25 })
      );
    moveOverBlock();
    frames(1);
    expect(graph.input.$hoveredComponent.value).toBe(block);
    expect(entered).toHaveBeenCalledTimes(1);
    graph.stop();
    expect(graph.input.$hoveredComponent.value).toBeUndefined();
    moveOverBlock();
    frames(1);
    expect(entered).toHaveBeenCalledTimes(1);
    graph.start();
    frames();
    moveOverBlock();
    frames(1);
    expect(graph.input.$hoveredComponent.value).toBe(graph.blocks.getBlockState("a")?.getViewComponent());
    expect(entered).toHaveBeenCalledTimes(2);
  });

  it("distinguishes motion of the mouse from a camera moving below a stationary mouse", () => {
    start({}, { retargetHoverOnCameraChange: true });
    const causes: string[] = [];
    const sources: (MouseEvent | undefined)[] = [];
    graph.on("pointerenter", (event) => {
      causes.push(event.cause);
      sources.push(event.sourceEvent);
    });
    const mouse = new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 25 });
    graph.layers.$root?.dispatchEvent(mouse);
    frames(1);
    graph.cameraService.set({ x: -400 });
    frames();
    expect(causes).toEqual(["pointer", "scene"]);
    expect(sources).toEqual([mouse, undefined]);
    expect(graph.input.$hoveredComponent.value).toBe(graph.blocks.getBlockState("b")?.getViewComponent());
  });

  describe("passive hit-test budget", () => {
    let now: number;
    beforeEach(() => {
      now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now);
    });

    function sample(x: number, time: number, y = 10): PointerEvent {
      now = time;
      const event = new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y });
      Object.defineProperty(event, "timeStamp", { value: time });
      graph.layers.$root?.dispatchEvent(event);
      return event;
    }

    it("queries once per frame at its latest slow sample, with one transition between adjacent targets", () => {
      start();
      graph.api.updateBlock({ id: "b", x: 100 });
      frames();
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      const enters: unknown[][] = [];
      graph.on("pointerenter", (event) => enters.push([event.target, event.relatedTarget, event.sourceEvent]));
      sample(93, 0);
      const a = sample(97, 8);
      expect(queries).toHaveBeenCalledTimes(0);
      frames(1);
      sample(100, 16);
      const b = sample(103, 24);
      frames(3);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([97, 103]);
      const viewA = graph.blocks.getBlockState("a")?.getViewComponent();
      const viewB = graph.blocks.getBlockState("b")?.getViewComponent();
      expect(enters).toEqual([
        [viewA, undefined, a],
        [viewB, viewA, b],
      ]);
    });

    it.each([0.5, 1.25])("uses CSS pixels for the speed and jump boundaries at scale %s", (scale) => {
      start();
      graph.cameraService.set({ scale });
      frames();
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      sample(10, 0);
      frames(1);
      sample(42, 32);
      frames(1);
      sample(90, 300);
      frames(1);
      sample(139, 600);
      frames(1);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([10, 42, 90]);
      now = 660;
      frames(1);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([10, 42, 90, 139]);
    });

    it("suppresses a reversal by total path, clears once and queries once after a stationary interval", () => {
      start();
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      const leaves = jest.fn();
      graph.on("pointerleave", leaves);
      sample(50, 0);
      frames(1);
      expect(tagged("block", "a")).toBe(true);
      queries.mockClear();
      sample(70, 8);
      sample(50, 16);
      frames(1);
      sample(450, 24);
      frames(2);
      expect(leaves).toHaveBeenCalledTimes(1);
      expect(tagged("block", "a")).toBe(false);
      now = 83;
      frames(1);
      expect(queries).toHaveBeenCalledTimes(0);
      now = 84;
      frames(4);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([450]);
      expect(tagged("block", "b")).toBe(true);
    });

    it("counts a coalesced excursion that returned to the previous position before the browser delivered the move", () => {
      start();
      sample(50, 0);
      frames(1);
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      now = 16;
      const event = (x: number, time: number) => {
        const move = new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: 10 });
        Object.defineProperty(move, "timeStamp", { value: time });
        return move;
      };
      const back = event(50, 16);
      Object.defineProperty(back, "getCoalescedEvents", { value: () => [event(70, 8), event(50, 16)] });
      graph.layers.$root?.dispatchEvent(back);
      frames(1);
      expect(tagged("block", "a")).toBe(false);
      expect(queries).toHaveBeenCalledTimes(0);
      now = 76;
      frames(3);
      expect(queries).toHaveBeenCalledTimes(1);
      expect(tagged("block", "a")).toBe(true);
    });

    it("defers minimalistic hover until rest, resolving a press between frames at its own location", () => {
      start();
      graph.cameraService.set({ scale: 0.1 });
      frames();
      expect(graph.scene.$level.peek()).toBe("minimalistic");
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      sample(5, 0, 2);
      frames(1);
      sample(6, 8, 2);
      now = 67;
      frames(1);
      expect(queries).toHaveBeenCalledTimes(0);
      now = 68;
      frames(2);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([6]);
      queries.mockClear();
      sample(75, 75, 2);
      frames(1);
      expect(queries).toHaveBeenCalledTimes(0);
      const pressed = jest.fn();
      graph.on("press", pressed);
      graph.layers.$root?.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "mouse",
          pointerId: 1,
          button: 0,
          buttons: 1,
          clientX: 45,
          clientY: 2,
          bubbles: true,
        })
      );
      now = 200;
      frames(3);
      expect(queries.mock.calls.map(([point]) => point.canvas.x)).toEqual([45]);
      expect(pressed.mock.calls[0][0].target).toBe(graph.blocks.getBlockState("b")?.getViewComponent());
    });

    it("runs one scene query after continuous camera movement stops", () => {
      start({}, { retargetHoverOnCameraChange: true });
      sample(50, 0);
      frames(1);
      const queries = jest.spyOn(graph.hitTest, "testPoint");
      for (let i = 1; i <= 10; i++) {
        graph.cameraService.set({ x: -40 * i });
        frames(1);
      }
      expect(queries).toHaveBeenCalledTimes(0);
      frames(4);
      expect(queries).toHaveBeenCalledTimes(1);
      expect(tagged("block", "b")).toBe(true);
    });
  });

  describe("camera-derived hit boxes during camera moves", () => {
    it("finds no target again when a zoom inside the label band resizes a labelled connection's box", () => {
      start({ label: "A long connection label" }, { showConnectionLabels: true });
      graph.cameraService.set({ scale: 0.3 });
      frames();
      const view = connectionView();
      // Block a's body: world (50, 20), client (15, 6) at scale 0.3.
      move(15, 6);
      expect(graph.input.$hoveredComponent.value).toBe(
        graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()
      );
      const box = (): string => String(view?.getHitBox());
      const before = box();
      const queries = jest.spyOn(graph, "getElementOverPoint");
      // The label's font size follows the scale between 0.25 and ~0.64 (BlockConnections), and the box with it.
      graph.cameraService.set({ scale: 0.4 });
      frames();
      graph.cameraService.set({ scale: 0.5 });
      frames();
      expect(box()).not.toBe(before);
      expect(queries).not.toHaveBeenCalled();
      expect(graph.input.$hoveredComponent.value).toBe(
        graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()
      );
    });

    it("still finds the target again after an API move during the zoom", () => {
      start({ label: "A long connection label" }, { showConnectionLabels: true });
      graph.cameraService.set({ scale: 0.3 });
      frames();
      move(15, 6);
      expect(graph.input.$hoveredComponent.value).toBe(
        graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()
      );
      graph.cameraService.set({ scale: 0.4 });
      graph.api.updateBlock({ id: "a", x: 2000 });
      frames();
      // Nothing is under the pointer any more: the camera, no hovered component.
      expect(graph.input.$hoveredComponent.value).toBeUndefined();
      expect(tagged("block", "a")).toBe(false);
    });

    it("finds the target again when a constants change hides the hovered label (not a camera change)", () => {
      start({ label: "A long connection label" }, { showConnectionLabels: true });
      graph.cameraService.set({ scale: 0.4 });
      frames();
      const view = connectionView();
      const label = view instanceof BlockConnection ? view.getLabelBounds() : undefined;
      if (!label) throw new Error("the label is not laid out");
      // A point of the label 2 world units under its top edge, off the line (y 25); jsdom has no stroke test, so
      // only the label hits. Client = world * 0.4 at the origin.
      const [minX, minY, maxX] = label;
      move(Math.round(((minX + maxX) / 2) * 0.4), Math.round((minY + 2) * 0.4));
      expect(graph.input.$hoveredComponent.value).toBe(view);
      expect(tagged("connection", "c")).toBe(true);
      const leaves: unknown[] = [];
      graph.on("pointerleave", (event) => leaves.push(event.target));
      // The label's threshold moves above the scale: the label goes, with nothing else under the pointer.
      graph.api.updateGraphConstants({ connection: { MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.6 } });
      frames();
      expect(view instanceof BlockConnection ? view.getLabelBounds() : "no view").toBeUndefined();
      expect(graph.input.$hoveredComponent.value).toBeUndefined();
      expect(tagged("connection", "c")).toBe(false);
      expect(leaves).toEqual([view]);
    });
  });

  describe("a press before the first move: the pointer is inside the root", () => {
    /**
     * One block "p" over world (100..300, 80..180); the camera at the origin, scale 1: canvas = client = world. The
     * camera's pan is off so that the press reaches the block.
     */
    function startPressed(settings: Record<string, unknown> = {}): void {
      const root = document.body.appendChild(document.createElement("div"));
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { canDragCamera: false, ...settings } }, root);
      graph.setEntities({ blocks: [{ ...block("p", 100), y: 80, width: 200, height: 100 }], connections: [] });
      graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
      graph.start();
      frames();
      // A press, a release and a click at canvas (150, 120), with no pointermove inside the root before them.
      for (const type of ["pointerdown", "pointerup"]) {
        root.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: "mouse",
            buttons: type === "pointerdown" ? 1 : 0,
            clientX: 150,
            clientY: 120,
          })
        );
      }
    }

    const viewOfP = (): unknown => graph.rootStore.blocksList.getBlockState("p")?.getViewComponent();

    it("re-evaluates the target on a camera change when retargetHoverOnCameraChange is enabled", () => {
      startPressed({ retargetHoverOnCameraChange: true });
      expect(graph.input.$hoveredComponent.value).toBe(viewOfP());
      const leaves: unknown[] = [];
      graph.on("pointerleave", (event) => leaves.push(event.target));
      // Canvas (150, 120) is world (-250, 120) now: nothing is there.
      graph.cameraService.set({ x: 400 });
      frames(2);
      expect(graph.input.$hoveredComponent.value === undefined).toBe(true);
      expect(leaves.length === 1 && leaves[0] === viewOfP()).toBe(true);
      expect(tagged("block", "p")).toBe(false);
    });

    it("finds the target again under the still pointer after an API move", () => {
      startPressed();
      const view = viewOfP();
      expect(graph.input.$hoveredComponent.value).toBe(view);
      const leaves: unknown[] = [];
      graph.on("pointerleave", (event) => leaves.push(event.target));
      graph.api.updateBlock({ id: "p", x: 2000 });
      frames();
      expect(graph.input.$hoveredComponent.value === undefined).toBe(true);
      expect(leaves.length === 1 && leaves[0] === view).toBe(true);
      expect(tagged("block", "p")).toBe(false);
    });
  });

  describe("hoveredTag of a connection and a group", () => {
    it("tags a connection while it is the target", () => {
      start();
      hitLine();
      // The line from (100, 25) to (400, 25); scale 1 at the origin: world = client.
      move(250, 25);
      expect(graph.input.$hoveredComponent.value).toBe(connectionView());
      expect(tagged("connection", "c")).toBe(true);
      move(50, 25);
      expect([tagged("connection", "c"), tagged("block", "a")]).toEqual([false, true]);
    });

    it("tags a non-interactive connection while it is the target", () => {
      start();
      hitLine();
      connectionView()?.setInteractive(false);
      frames();
      move(250, 25);
      expect(graph.input.$hoveredComponent.value).toBe(connectionView());
      expect(tagged("connection", "c")).toBe(true);
      move(250, 300);
      expect(tagged("connection", "c")).toBe(false);
    });

    it("tags a group while it is the target", () => {
      start();
      graph.addLayer(BlockGroups, {});
      graph.rootStore.groupsList.setGroups([{ id: "g", rect: { x: 0, y: 200, width: 300, height: 200 } }]);
      frames();
      const group = graph.rootStore.groupsList.getGroupState("g")?.getViewComponent();
      expect(group).toBeInstanceOf(Group);
      move(150, 300);
      expect(graph.input.$hoveredComponent.value).toBe(group);
      expect(tagged("group", "g")).toBe(true);
      move(150, 600);
      expect(tagged("group", "g")).toBe(false);
    });
  });
});
