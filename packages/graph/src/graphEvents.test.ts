import { Block } from "./components/canvas/blocks/Block";
import { Graph } from "./graph";
import { Component } from "./lib/Component";

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

test("graph mouse default action runs after listeners and can be prevented", () => {
  const graph = new Graph({});
  const handle = jest.spyOn(graph.dragService, "handleMouseDown").mockImplementation(() => {});
  const sourceEvent = new MouseEvent("mousedown");
  const remove = graph.on("mousedown", {
    handleEvent: (event) => {
      expect(handle).not.toHaveBeenCalled();
      expect(event.detail.sourceEvent).toBe(sourceEvent);
      event.preventDefault();
    },
  });
  graph.emit("mousedown", { sourceEvent });
  expect(handle).not.toHaveBeenCalled();
  remove();
  const emitted = graph.emit("mousedown", { sourceEvent });
  expect(handle).toHaveBeenCalledWith(emitted);
  graph.unmount();
});

describe("camera pan on the graph mousedown", () => {
  function setup(): { graph: Graph; block: Block; press: () => void } {
    const graph = new Graph({
      settings: { dragThreshold: 0 },
      blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
    });
    // Creates the Camera child that handles the graph mousedown default action.
    graph.getGraphLayer().iterate();
    // The default canDrag is NONE, so the camera pans when the block is pressed.
    const block = new Block({ id: "block" }, graph.getGraphLayer());
    const press = (): void => {
      graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 30 }));
      document.dispatchEvent(new MouseEvent("mouseup"));
    };
    return { graph, block, press };
  }

  test("pans the camera when no listener prevents the press", () => {
    const { graph, block, press } = setup();
    const before = { ...graph.cameraService.getCameraState() };
    press();
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: before.x + 50, y: before.y + 30 });
    Component.unmount(block);
    graph.unmount();
  });

  // https://github.com/gravity-ui/graph/issues/405: layers subscribe after the camera is created.
  // A non-capture listener: jsdom runs capture listeners first, so only a plain one reproduced the old order.
  test("lets a listener added after the camera prevent the pan", () => {
    const { graph, block, press } = setup();
    const before = { ...graph.cameraService.getCameraState() };
    const preventedBefore: boolean[] = [];
    const listener = jest.fn((event: Event) => {
      preventedBefore.push(event.defaultPrevented);
      event.preventDefault();
    });
    graph.on("mousedown", listener);
    press();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(preventedBefore).toEqual([false]);
    expect(graph.cameraService.getCameraState()).toMatchObject({ x: before.x, y: before.y });
    Component.unmount(block);
    graph.unmount();
  });
});
