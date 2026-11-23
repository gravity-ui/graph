import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { Block } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { Component } from "../../lib/Component";
import { ECanDrag } from "../../store/settings";
import { EVENTS } from "../types/events";

import { dragListener, stopDragListening } from "./dragListener";

test("cancelling a drag removes pending and active DOM listeners", () => {
  const pending = dragListener(document, { suppressTextSelection: false });
  const started = jest.fn();
  pending.on(EVENTS.DRAG_START, started);
  stopDragListening(pending);
  document.dispatchEvent(new MouseEvent("mousemove"));
  expect(started).not.toHaveBeenCalled();

  const active = dragListener(document, { suppressTextSelection: false, stopOnMouseLeave: true });
  const update = jest.fn();
  const end = jest.fn();
  active.on(EVENTS.DRAG_UPDATE, update).on(EVENTS.DRAG_END, end);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  update.mockClear();
  stopDragListening(active);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  document.dispatchEvent(new MouseEvent("mouseup"));
  document.dispatchEvent(new MouseEvent("mouseleave"));
  expect(update).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});

test.each(["mousedown", "blur", "visibilitychange"])("%s cancels an active drag and releases its resources", (type) => {
  const graph = new Graph({});
  const disable = jest.spyOn(graph.cameraService, "disableAutoPanning");
  const unlock = jest.spyOn(graph, "unlockCursor");
  const release = jest.spyOn(graph.getGraphLayer(), "releaseCapture");
  const parent = new Component({});
  const component = new EventedComponent({}, parent);
  const emitter = dragListener(document, {
    graph,
    component,
    threshold: 0,
    dragCursor: "grabbing",
    suppressTextSelection: false,
  });
  const end = jest.fn();
  const cancel = jest.fn();
  emitter.on(EVENTS.DRAG_END, end).on(EVENTS.DRAG_CANCEL, cancel);
  const move = new MouseEvent("mousemove", { clientX: 10 });
  document.dispatchEvent(move);
  if (type === "visibilitychange") {
    const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event(type));
    visibility.mockRestore();
  } else if (type === "blur") {
    window.dispatchEvent(new Event(type));
  } else {
    document.dispatchEvent(new MouseEvent(type));
  }
  expect(disable).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new MouseEvent("mouseup"));
  expect(end).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(cancel.mock.calls[0][0]).toBe(move);
  graph.unmount();
  Component.unmount(component);
  Component.unmount(parent);
});

test("startDrag captures its component and cancel stops active and pending operations", () => {
  const graph = new Graph({
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const layer = graph.getGraphLayer();
  const block = new Block({ id: "block" }, layer);
  const capture = jest.spyOn(layer, "captureEvents");
  const release = jest.spyOn(layer, "releaseCapture");
  const onCancel = jest.fn();
  const onEnd = jest.fn();
  graph.dragService.startDrag(
    { onCancel, onEnd },
    {
      component: block,
      threshold: 0,
    }
  );
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));

  const pending = jest.fn();
  graph.dragService.startDrag({ onStart: pending }, { threshold: 0 });
  graph.dragService.cancel();
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  document.dispatchEvent(new MouseEvent("mouseup"));

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
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));

  first.emit("cancel");
  expect(root.style.userSelect).toBe("none");
  graph.dragService.cancel();
  expect(root.style.userSelect).toBe("text");
  graph.unmount();
});

test("unmount stops an active custom operation without calling its drop callback", () => {
  const graph = new Graph({});
  const onEnd = jest.fn();
  graph.dragService.startDrag({ onEnd }, { threshold: 0 });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));

  graph.unmount();
  document.dispatchEvent(new MouseEvent("mouseup"));

  expect(onEnd).not.toHaveBeenCalled();
});

test("a second mousedown cancels the active component drag and permits another drag", () => {
  const graph = new Graph({
    settings: { dragThreshold: 0, canDrag: ECanDrag.ALL },
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const block = new Block({ id: "block" }, graph.getGraphLayer());
  const end = jest.spyOn(block, "handleDragEnd");
  const cancel = jest.spyOn(block, "handleDragCancel").mockImplementation(() => {});
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(new MouseEvent("mousedown"));
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(new MouseEvent("mouseup"));
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
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  move.mockClear();

  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));

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
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  move.mockClear();
  graph.blocks.deleteBlocks(["block"]);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  document.dispatchEvent(new MouseEvent("mouseup"));
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
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
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
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  expect(callbacks.onStart).toHaveBeenCalledTimes(1);
  callbacks.onUpdate.mockClear();
  handle.emit("cancel");
  expect(unlock).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  document.dispatchEvent(new MouseEvent("mouseup"));
  expect(callbacks.onUpdate).not.toHaveBeenCalled();
  expect(callbacks.onEnd).not.toHaveBeenCalled();
  graph.unmount();
});
