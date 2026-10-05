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

test("a second mousedown cancels active graph drag resources before removing listeners", () => {
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
  emitter.on(EVENTS.DRAG_END, end);
  document.dispatchEvent(new MouseEvent("mousemove"));
  document.dispatchEvent(new MouseEvent("mousedown"));
  expect(disable).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new MouseEvent("mouseup"));
  expect(end).toHaveBeenCalledTimes(1);
  graph.unmount();
  Component.unmount(component);
  Component.unmount(parent);
});

test("a second mousedown finishes the active service operation and permits another drag", () => {
  const graph = new Graph({
    settings: { dragThreshold: 0, canDrag: ECanDrag.ALL },
    blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }],
  });
  const block = new Block({ id: "block" }, graph.getGraphLayer());
  const end = jest.spyOn(block, "handleDragEnd");
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(new MouseEvent("mousedown"));
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  expect(end).toHaveBeenCalledTimes(1);
  graph.emit("mousedown", { target: block, sourceEvent: new MouseEvent("mousedown") });
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
  expect(graph.dragService.$state.value.isDragging).toBe(true);
  document.dispatchEvent(new MouseEvent("mouseup"));
  expect(graph.dragService.$state.value.isDragging).toBe(false);
  expect(end).toHaveBeenCalledTimes(2);
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
