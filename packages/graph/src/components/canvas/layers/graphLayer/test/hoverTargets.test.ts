import { Graph } from "../../../../../graph";
import { globalScheduler } from "../../../../../lib/Scheduler";
import { hoveredTag } from "../../../../../services/tags/builtinTags";
import type { TConnection } from "../../../../../store/connection/ConnectionState";
import type { TBlock } from "../../../blocks/Block";
import type { BaseConnection } from "../../../connections/BaseConnection";
import { BlockConnection } from "../../../connections/BlockConnection";
import { BlockGroups } from "../../../groups/BlockGroups";
import { Group } from "../../../groups/Group";

/**
 * GraphLayer's target under a still pointer for camera-derived hit boxes, and the `hoveredTag`
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

describe("GraphLayer targets and the hover tags of connections and groups", () => {
  let graph: Graph;

  /** Blocks a (x 0..100) and b (x 400..500), y 0..50, and connection c from a to b along y 25. */
  function start(connection: Partial<TConnection> = {}, settings: Record<string, unknown> = {}): void {
    const root = document.createElement("div");
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

  const move = (x: number, y: number): void =>
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
  const tagged = (type: string, id: string): boolean => graph.scene.tags.peekOf(type, id).has(hoveredTag);
  /** The line hits wherever its hit box does (jsdom's canvas has no stroke test). */
  const hitLine = (): void => {
    jest.spyOn(graph.getGraphLayer().context.ctx, "isPointInStroke").mockReturnValue(true);
  };
  const connectionView = (): BaseConnection | undefined =>
    graph.rootStore.connectionsList.getConnectionState("c")?.getViewComponent();

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  describe("camera-derived hit boxes during camera moves", () => {
    it("finds no target again when a zoom inside the label band resizes a labelled connection's box", () => {
      start({ label: "A long connection label" }, { showConnectionLabels: true });
      graph.cameraService.set({ scale: 0.3 });
      frames();
      const view = connectionView();
      const layer = graph.getGraphLayer();
      // Block a's body: world (50, 20), client (15, 6) at scale 0.3.
      move(15, 6);
      expect(layer.$hoveredComponent.value).toBe(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent());
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
      expect(layer.$hoveredComponent.value).toBe(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent());
    });

    it("still finds the target again after an API move during the zoom", () => {
      start({ label: "A long connection label" }, { showConnectionLabels: true });
      graph.cameraService.set({ scale: 0.3 });
      frames();
      const layer = graph.getGraphLayer();
      move(15, 6);
      expect(layer.$hoveredComponent.value).toBe(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent());
      graph.cameraService.set({ scale: 0.4 });
      graph.api.updateBlock({ id: "a", x: 2000 });
      frames();
      // Nothing is under the pointer any more: the camera, no hovered component.
      expect(layer.$hoveredComponent.value).toBeUndefined();
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
      const layer = graph.getGraphLayer();
      expect(layer.$hoveredComponent.value).toBe(view);
      expect(tagged("connection", "c")).toBe(true);
      const leaves: unknown[] = [];
      graph.on("mouseleave", (event) => leaves.push(event.detail.target));
      // The label's threshold moves above the scale: the label goes, with nothing else under the pointer.
      graph.api.updateGraphConstants({ connection: { MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.6 } });
      frames();
      expect(view instanceof BlockConnection ? view.getLabelBounds() : "no view").toBeUndefined();
      expect(layer.$hoveredComponent.value).toBeUndefined();
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
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { canDragCamera: false, ...settings } }, root);
      graph.setEntities({ blocks: [{ ...block("p", 100), y: 80, width: 200, height: 100 }], connections: [] });
      graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
      graph.start();
      frames();
      // A press, a release and a click at canvas (150, 120), with no mousemove inside the root before them.
      const layer = graph.getGraphLayer();
      for (const type of ["mousedown", "mouseup", "click"]) {
        layer.handleEvent(new MouseEvent(type, { clientX: 150, clientY: 120 }));
      }
    }

    const viewOfP = (): unknown => graph.rootStore.blocksList.getBlockState("p")?.getViewComponent();

    it("re-evaluates the target on a camera change when emulateMouseEventsOnCameraChange is enabled", () => {
      startPressed({ emulateMouseEventsOnCameraChange: true });
      const layer = graph.getGraphLayer();
      expect(layer.$hoveredComponent.value).toBe(viewOfP());
      const leaves: unknown[] = [];
      graph.on("mouseleave", (event) => leaves.push(event.detail.target));
      // Canvas (150, 120) is world (-250, 120) now: nothing is there.
      graph.cameraService.set({ x: 400 });
      expect(layer.$hoveredComponent.value === undefined).toBe(true);
      expect(leaves.length === 1 && leaves[0] === viewOfP()).toBe(true);
      expect(tagged("block", "p")).toBe(false);
    });

    it("finds the target again under the still pointer after an API move", () => {
      startPressed();
      const layer = graph.getGraphLayer();
      const view = viewOfP();
      expect(layer.$hoveredComponent.value).toBe(view);
      const leaves: unknown[] = [];
      graph.on("mouseleave", (event) => leaves.push(event.detail.target));
      graph.api.updateBlock({ id: "p", x: 2000 });
      frames();
      expect(layer.$hoveredComponent.value === undefined).toBe(true);
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
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(connectionView());
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
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(connectionView());
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
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(group);
      expect(tagged("group", "g")).toBe(true);
      move(150, 600);
      expect(tagged("group", "g")).toBe(false);
    });
  });
});
