import { Graph } from "./graph";
import { globalScheduler } from "./lib/Scheduler";
import { pointer, pointerRoot } from "./test/pointer";

// colors-changed is a representative event for capture, once and abort cleanup.
// Payload assertions verify that function/object listeners receive the original dispatched event.

test("graph subscriptions remove capturing function and object listeners", () => {
  const graph = new Graph({});
  const detail = { colors: graph.graphColors };
  const listener = jest.fn();
  const object = { handleEvent: jest.fn() };
  const removeFunction = graph.on("colors-changed", listener, { capture: true });
  const removeObject = graph.on("colors-changed", object, true);
  const emitted = graph.emit("colors-changed", detail);
  expect(listener).toHaveBeenCalledWith(emitted);
  expect(object.handleEvent).toHaveBeenCalledWith(emitted);
  removeFunction();
  removeFunction();
  removeObject();
  graph.emit("colors-changed", detail);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(object.handleEvent).toHaveBeenCalledTimes(1);
  graph.unmount();
});

test("graph subscriptions preserve once, explicit off and abort semantics", () => {
  const graph = new Graph({});
  const detail = { colors: graph.graphColors };
  const once = { handleEvent: jest.fn() };
  const listener = jest.fn();
  const aborted = jest.fn();
  const controller = new AbortController();
  graph.on("colors-changed", once, { once: true });
  graph.on("colors-changed", listener);
  graph.on("colors-changed", aborted, { signal: controller.signal });
  graph.emit("colors-changed", detail);
  graph.off("colors-changed", listener);
  controller.abort();
  graph.emit("colors-changed", detail);
  expect(once.handleEvent).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(aborted).toHaveBeenCalledTimes(1);
  graph.unmount();
});

test("unsubscribe snapshots capture and off accepts matching capture options", () => {
  const graph = new Graph({});
  const listener = jest.fn();
  const options = { capture: true };
  const remove = graph.on("state-change", listener, options);
  options.capture = false;
  remove();
  graph.emit("state-change", { state: graph.state });
  expect(listener).not.toHaveBeenCalled();
  graph.on("state-change", listener, true);
  graph.off("state-change", listener, true);
  graph.emit("state-change", { state: graph.state });
  expect(listener).not.toHaveBeenCalled();
  graph.unmount();
});

test("a camera proposal and its controls are delivered on one event with the graph as recipient", () => {
  const graph = new Graph({});
  const before = graph.$camera.peek();
  const seen: unknown[] = [];
  let late: (() => void) | undefined;
  graph.on(
    "camera-change",
    ({ x, target, currentTarget, preventDefault }) => {
      seen.push(x, target === graph, currentTarget === graph);
      preventDefault();
    },
    { once: true }
  );
  graph.on("camera-change", (event) => {
    seen.push(event.defaultPrevented);
    late = () => {
      event.preventDefault();
      seen.push(event.currentTarget, event.defaultPrevented);
    };
  });
  graph.cameraService.move(19, 0);
  expect(graph.$camera.peek()).toBe(before);
  graph.cameraService.move(25, 0);
  expect(graph.$camera.peek().x).toBe(before.x + 25);
  late?.();
  expect(seen).toEqual([before.x + 19, true, true, true, false, null, false]);
  graph.unmount();
});

test("a filtered camera listener uses the committed scale level and keeps once until delivery", () => {
  const graph = new Graph({});
  const [, schematic, detailed] = graph.graphConstants.block.SCALES;
  graph.cameraService.set({ scale: schematic });
  const proposals: number[] = [];
  graph.on("camera-change", ({ scale }) => proposals.push(scale), { inScale: ["detailed"], once: true });
  graph.cameraService.set({ scale: detailed });
  expect(proposals).toEqual([]);
  graph.cameraService.set({ scale: schematic });
  graph.cameraService.set({ scale: detailed });
  graph.cameraService.move(10, 0);
  expect(proposals).toEqual([schematic]);
  graph.unmount();
});

describe("camera press default", () => {
  let graph: Graph;
  beforeEach(() => {
    graph = new Graph({ settings: { dragThreshold: 0 } }, pointerRoot());
    graph.start();
    globalScheduler.performUpdate();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
  });
  afterEach(() => graph.unmount());

  const pan = () => {
    pointer(graph, "pointerdown", { clientX: 100, clientY: 100 });
    pointer(graph, "pointermove", { clientX: 150, clientY: 130, buttons: 1 });
    pointer(graph, "pointerup", { clientX: 150, clientY: 130 });
  };

  it("pans independently of press propagation", () => {
    graph.on("press", (press) => press.stopPropagation(), { capture: true });
    const bubble = jest.fn();
    graph.on("press", bubble);
    pan();
    expect(bubble).not.toHaveBeenCalled();
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 50, y: 30 });
  });

  it("lets a listener registered after the camera prevent the pan", () => {
    const remove = graph.on("press", (press) => press.preventDefault());
    pan();
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 0, y: 0 });
    remove();
    pan();
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: 50, y: 30 });
  });
});
