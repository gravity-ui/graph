import { EventedComponent } from "../../../components/canvas/EventedComponent/EventedComponent";
import { Block } from "../../../components/canvas/blocks/Block";
import { frames } from "../../../components/canvas/scene/test/utils/sceneTestKit";
import { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import { ECanDrag } from "../../../store/settings";
import { EVENTS } from "../../../utils/types/events";
import { createDragSession, stopDragListening } from "../dragSession";

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { pointerType: "mouse", pointerId: 1, buttons: type === "pointerup" ? 0 : 1, ...init });
}

function firstMove(event: PointerEvent) {
  return { crossing: event, event };
}

function startBlockDrag(graph: Graph, block: Block, clientX: number): void {
  const down = pointer("pointerdown");
  graph.dragService.startDefaultDrag(
    block,
    down,
    firstMove(pointer("pointermove", { clientX })),
    graph.getPointInCameraSpace(down),
    new AbortController().signal
  );
}

test("cancelling a drag removes pending and active DOM listeners", () => {
  const pending = createDragSession(document, { startOnMove: () => true, suppressTextSelection: false });
  const started = jest.fn();
  pending.on(EVENTS.DRAG_START, started);
  stopDragListening(pending);
  document.dispatchEvent(pointer("pointermove"));
  expect(started).not.toHaveBeenCalled();

  const active = createDragSession(document, {
    startOnMove: () => true,
    suppressTextSelection: false,
    stopOnPointerLeave: true,
  });
  const update = jest.fn();
  const end = jest.fn();
  active.on(EVENTS.DRAG_UPDATE, update).on(EVENTS.DRAG_END, end);
  document.dispatchEvent(pointer("pointermove", { clientX: 10 }));
  update.mockClear();
  stopDragListening(active);
  document.dispatchEvent(pointer("pointermove", { clientX: 20 }));
  document.dispatchEvent(pointer("pointerup"));
  document.dispatchEvent(pointer("pointerleave"));
  expect(update).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});

test.each(["pointerdown", "blur", "visibilitychange"])(
  "%s cancels an active drag and releases its resources",
  (type) => {
    const graph = new Graph({});
    const disable = jest.spyOn(graph.cameraService, "disableAutoPanning");
    const unlock = jest.spyOn(graph, "unlockCursor");
    const release = jest.spyOn(graph.input.hover, "releaseCapture");
    const parent = new Component({});
    const component = new EventedComponent({}, parent);
    const emitter = createDragSession(document, {
      graph,
      component,
      startOnMove: () => true,
      cursor: "grabbing",
      suppressTextSelection: false,
    });
    const end = jest.fn();
    const cancel = jest.fn();
    emitter.on(EVENTS.DRAG_END, end).on(EVENTS.DRAG_CANCEL, cancel);
    const move = pointer("pointermove", { clientX: 10 });
    document.dispatchEvent(move);
    if (type === "visibilitychange") {
      const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      document.dispatchEvent(new Event(type));
      visibility.mockRestore();
    } else if (type === "blur") {
      window.dispatchEvent(new Event(type));
    } else {
      document.dispatchEvent(pointer(type));
    }
    expect(disable).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    document.dispatchEvent(pointer("pointerup"));
    expect(end).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toBe(move);
    graph.unmount();
    Component.unmount(component);
    Component.unmount(parent);
  }
);

test("startDrag captures its component and cancel stops active and pending operations", () => {
  const graph = new Graph({
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const layer = graph.getGraphLayer();
  const block = new Block({ id: "block" }, layer);
  const capture = jest.spyOn(graph.input.hover, "captureEvents");
  const release = jest.spyOn(graph.input.hover, "releaseCapture");
  const onCancel = jest.fn();
  const onEnd = jest.fn();
  graph.dragService.startDrag(
    { onCancel, onEnd },
    {
      component: block,
      threshold: 0,
    }
  );
  document.dispatchEvent(pointer("pointermove", { clientX: 10 }));

  const pending = jest.fn();
  graph.dragService.startDrag({ onStart: pending }, { threshold: 0 });
  graph.dragService.cancel();
  document.dispatchEvent(pointer("pointermove", { clientX: 20 }));
  document.dispatchEvent(pointer("pointerup"));

  expect(capture).toHaveBeenCalledWith(block);
  expect(release).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onEnd).not.toHaveBeenCalled();
  expect(pending).not.toHaveBeenCalled();
  Component.unmount(block);
  graph.unmount();
});

test("cancelling overlapping operations restores the previous text selection style", () => {
  const graph = new Graph({});
  const root = graph.getGraphCanvas();
  root.style.userSelect = "text";
  const first = graph.dragService.startDrag({}, { threshold: 0 });
  graph.dragService.startDrag({}, { threshold: 0 });
  document.dispatchEvent(pointer("pointermove", { clientX: 10 }));

  first.emit("cancel");
  expect(root.style.userSelect).toBe("none");
  graph.dragService.cancel();
  expect(root.style.userSelect).toBe("text");
  graph.unmount();
});

test.each(["stop", "detach", "unmount"] as const)("%s cancels a programmatic drag without dropping", (action) => {
  const graph = new Graph({});
  const onEnd = jest.fn();
  const onCancel = jest.fn();
  graph.dragService.startDrag({ onEnd, onCancel }, { threshold: 0 });
  document.dispatchEvent(pointer("pointermove", { clientX: 10 }));

  graph[action]();
  document.dispatchEvent(pointer("pointerup"));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onEnd).not.toHaveBeenCalled();
  expect(graph.cameraService.isAutoPanningEnabled()).toBe(false);
  if (action !== "unmount") graph.unmount();
});

test("a second pointerdown cancels the active component drag and permits another drag", () => {
  const graph = new Graph({
    settings: { dragThreshold: 0, canDrag: ECanDrag.ALL },
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const block = new Block({ id: "block" }, graph.getGraphLayer());
  const end = jest.spyOn(block, "handleDragEnd");
  const cancel = jest.spyOn(block, "handleDragCancel").mockImplementation(() => {});
  startBlockDrag(graph, block, 10);
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(pointer("pointerdown"));
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();
  startBlockDrag(graph, block, 20);
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(pointer("pointerup"));
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  expect(end).toHaveBeenCalledTimes(1);
  Component.unmount(block);
  graph.unmount();
});

test("a drag state subscriber can cancel an update before moving the block", () => {
  const graph = new Graph({
    settings: { dragThreshold: 0, canDrag: ECanDrag.ALL },
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const block = new Block({ id: "block" }, graph.getGraphLayer());
  const move = jest.spyOn(block, "handleDrag");
  const unsubscribe = graph.dragService.$state.subscribe((state) => {
    if (state.currentEvent?.clientX === 20) graph.dragService.cancel();
  });
  startBlockDrag(graph, block, 10);
  move.mockClear();

  document.dispatchEvent(pointer("pointermove", { clientX: 20 }));

  expect(move).not.toHaveBeenCalled();
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  unsubscribe();
  Component.unmount(block);
  graph.unmount();
});

test("deleting a block during drag stops its movement and drop callbacks", () => {
  const graph = new Graph({
    settings: { dragThreshold: 0, canDrag: ECanDrag.ALL },
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const block = new Block({ id: "block" }, graph.getGraphLayer());
  const move = jest.spyOn(block, "handleDrag");
  const end = jest.spyOn(block, "handleDragEnd");
  startBlockDrag(graph, block, 10);
  move.mockClear();
  graph.blocks.deleteBlocks(["block"]);
  document.dispatchEvent(pointer("pointermove", { clientX: 20 }));
  document.dispatchEvent(pointer("pointerup"));
  expect(move).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  Component.unmount(block);
  graph.unmount();
});

test("custom drag operations accept omitted lifecycle callbacks", () => {
  const graph = new Graph({ settings: { dragThreshold: 0 } });
  graph.dragService.startDrag({}, { document, threshold: 0 });
  expect(() => {
    document.dispatchEvent(pointer("pointermove", { clientX: 10 }));
    document.dispatchEvent(pointer("pointerup"));
  }).not.toThrow();
  graph.unmount();
});

test("the handle returned by dragService.startDrag cancels the operation with emit('cancel')", () => {
  const graph = new Graph({});
  const unlock = jest.spyOn(graph, "unlockCursor");
  const callbacks = { onStart: jest.fn(), onUpdate: jest.fn(), onEnd: jest.fn() };
  const handle = graph.dragService.startDrag(callbacks, {
    document,
    cursor: "crosshair",
    threshold: 0,
    autopanning: false,
    suppressTextSelection: false,
  });
  document.dispatchEvent(pointer("pointermove", { clientX: 10 }));
  expect(callbacks.onStart).toHaveBeenCalledTimes(1);
  callbacks.onUpdate.mockClear();
  handle.emit("cancel");
  expect(unlock).toHaveBeenCalledTimes(1);
  document.dispatchEvent(pointer("pointermove", { clientX: 20 }));
  document.dispatchEvent(pointer("pointerup"));
  expect(callbacks.onUpdate).not.toHaveBeenCalled();
  expect(callbacks.onEnd).not.toHaveBeenCalled();
  graph.unmount();
});

test.each(["touch", "pen"])("a claimed %s drag ignores every event from a second pointer", (pointerType) => {
  const graph = new Graph({ settings: { dragThreshold: 50 } });
  const owner = { pointerType, pointerId: 12 };
  const down = pointer("pointerdown", owner);
  const crossing = pointer("pointermove", { ...owner, clientX: 6 });
  const operation = { owner: "test", start: jest.fn(), move: jest.fn(), end: jest.fn(), cancel: jest.fn() };
  const signal = new AbortController();
  graph.dragService.startClaimedDrag(
    operation,
    down,
    firstMove(crossing),
    graph.getPointInCameraSpace(down),
    signal.signal
  );

  for (const type of ["pointerdown", "pointermove", "pointercancel", "lostpointercapture", "pointerup"]) {
    document.dispatchEvent(pointer(type, { pointerType: "touch", pointerId: 20, clientX: 80 }));
  }
  expect(operation.start).toHaveBeenCalledTimes(1);
  expect(operation.move.mock.calls.map(([event]) => event)).toEqual([crossing]);
  expect(operation.end).not.toHaveBeenCalled();
  expect(operation.cancel).not.toHaveBeenCalled();

  signal.abort();
  document.dispatchEvent(pointer("pointerup", owner));
  expect(operation.cancel).toHaveBeenCalledTimes(1);
  expect(operation.end).not.toHaveBeenCalled();
  graph.unmount();
});

test("a cleanup failure still releases the remaining resources and completes the session", () => {
  const graph = new Graph({});
  const canvas = graph.getGraphCanvas();
  canvas.style.userSelect = "text";
  graph.setEntities({
    blocks: [{ id: "test", is: "Block", name: "Test", x: 0, y: 0, width: 100, height: 100 }],
    connections: [],
  });
  const block = new Block({ id: "test" }, graph.getGraphLayer());
  const release = jest.spyOn(graph.input.hover, "releaseCapture");
  const emitter = graph.dragService.startDrag({}, { component: block, cursor: "grabbing", threshold: 0 });
  document.dispatchEvent(pointer("pointermove"));
  const fail = jest.spyOn(graph, "unlockCursor").mockImplementationOnce(() => {
    throw new Error("cursor");
  });

  expect(() => stopDragListening(emitter)).toThrow("cursor");
  expect(graph.cameraService.isAutoPanningEnabled()).toBe(false);
  expect(canvas.style.userSelect).toBe("text");
  expect(() => stopDragListening(emitter)).not.toThrow();
  expect(release).toHaveBeenCalledTimes(1);
  fail.mockRestore();
  Component.unmount(block);
  graph.unmount();
});

test.each(["cursor", "camera"])("cancelling while the %s is acquired prevents drag activation", (resource) => {
  const graph = new Graph({});
  const canvas = graph.getGraphCanvas();
  canvas.style.userSelect = "text";
  const owner = new AbortController();
  const start = jest.fn();
  const move = jest.fn();
  const enable = jest.spyOn(graph.cameraService, "enableAutoPanning");
  const restore =
    resource === "cursor"
      ? jest.spyOn(graph, "lockCursor").mockImplementation(() => owner.abort()).mockRestore
      : graph.$camera.subscribe((state) => {
          if (state.autoPanningEnabled) owner.abort();
        });
  const down = pointer("pointerdown");
  graph.dragService.startClaimedDrag(
    { owner: "cancel on acquire", cursor: "grabbing", start, move },
    down,
    firstMove(pointer("pointermove")),
    graph.getPointInCameraSpace(down),
    owner.signal
  );

  expect(enable).toHaveBeenCalledTimes(resource === "cursor" ? 0 : 1);
  expect(start).not.toHaveBeenCalled();
  expect(move).not.toHaveBeenCalled();
  expect(graph.cameraService.isAutoPanningEnabled()).toBe(false);
  expect(canvas.style.userSelect).toBe("text");
  restore();
  enable.mockRestore();
  graph.unmount();
});

test("auto-pan follows a stationary touch drag without a hover sample", () => {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 200 }, clientHeight: { value: 200 } });
  document.body.append(root);
  const graph = new Graph({}, root);
  graph.start();
  frames();
  graph.cameraService.set({ width: 200, height: 200, x: 0, y: 0, scale: 1 });
  const owner = { pointerType: "touch", pointerId: 6, clientY: 100 };
  const down = pointer("pointerdown", { ...owner, clientX: 180 });
  const event = pointer("pointermove", { ...owner, clientX: 198 });
  const signal = new AbortController();
  const move = jest.fn();
  try {
    graph.dragService.startClaimedDrag(
      { owner: "touch", move },
      down,
      firstMove(event),
      graph.getPointInCameraSpace(down),
      signal.signal
    );
    frames(3);
    expect(graph.cameraService.getCameraState().x).toBeLessThan(0);
    expect(move).toHaveBeenCalledWith(event, expect.any(Array), "scene");
    signal.abort();
    const stoppedAt = graph.cameraService.getCameraState().x;
    frames(3);
    expect(graph.cameraService.getCameraState().x).toBe(stoppedAt);
  } finally {
    graph.unmount();
    root.remove();
  }
});
