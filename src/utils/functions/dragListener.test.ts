import { Graph } from "../../graph";
import { Emitter } from "../Emitter";
import { EVENTS } from "../types/events";

import { dragListener, stopDragListening } from "./dragListener";

type TDragListeners = {
  start: jest.Mock<void, [MouseEvent]>;
  update: jest.Mock<void, [MouseEvent]>;
  end: jest.Mock<void, [MouseEvent]>;
  cancel: jest.Mock<void, [MouseEvent]>;
};

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

function listen(options?: Parameters<typeof dragListener>[1]): { emitter: Emitter; listeners: TDragListeners } {
  const listeners: TDragListeners = {
    start: jest.fn(),
    update: jest.fn(),
    end: jest.fn(),
    cancel: jest.fn(),
  };
  const emitter = dragListener(document, { threshold: 0, ...options })
    .on(EVENTS.DRAG_START, listeners.start)
    .on(EVENTS.DRAG_UPDATE, listeners.update)
    .on(EVENTS.DRAG_END, listeners.end)
    .on(EVENTS.DRAG_CANCEL, listeners.cancel);
  return { emitter, listeners };
}

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("dragListener cancellation", () => {
  afterEach(() => {
    setVisibilityState("visible");
  });

  it("cancels a started drag when the window loses focus", () => {
    const { listeners } = listen();
    const lastMove = mouse("mousemove", 20, 20);

    document.dispatchEvent(mouse("mousemove", 10, 10));
    document.dispatchEvent(lastMove);
    window.dispatchEvent(new Event("blur"));

    expect(listeners.cancel).toHaveBeenCalledTimes(1);
    expect(listeners.cancel).toHaveBeenCalledWith(lastMove);

    const updatesBeforeCancel = listeners.update.mock.calls.length;
    document.dispatchEvent(mouse("mousemove", 30, 30));
    document.dispatchEvent(mouse("mouseup", 30, 30));

    expect(listeners.update).toHaveBeenCalledTimes(updatesBeforeCancel);
    expect(listeners.end).not.toHaveBeenCalled();
  });

  it("cancels a started drag when the page becomes hidden", () => {
    const { listeners } = listen();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(listeners.cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores visibilitychange while the page stays visible", () => {
    const { listeners } = listen();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(mouse("mouseup", 10, 10));

    expect(listeners.cancel).not.toHaveBeenCalled();
    expect(listeners.end).toHaveBeenCalledTimes(1);
  });

  it("does not emit drag end on the mouseup that follows stopDragListening", () => {
    const { emitter, listeners } = listen();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    stopDragListening(emitter);
    document.dispatchEvent(mouse("mouseup", 10, 10));

    expect(listeners.cancel).toHaveBeenCalledTimes(1);
    expect(listeners.end).not.toHaveBeenCalled();
  });

  it("cancels a drag whose mouseup was lost when the next press arrives", () => {
    const { listeners } = listen();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    document.dispatchEvent(mouse("mousedown", 50, 50));
    document.dispatchEvent(mouse("mouseup", 50, 50));

    expect(listeners.cancel).toHaveBeenCalledTimes(1);
    expect(listeners.end).not.toHaveBeenCalled();
  });

  it("stops a pending drag silently when the window loses focus before it starts", () => {
    const { listeners } = listen();

    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(mouse("mousemove", 10, 10));
    document.dispatchEvent(mouse("mouseup", 10, 10));

    expect(listeners.start).not.toHaveBeenCalled();
    expect(listeners.cancel).not.toHaveBeenCalled();
    expect(listeners.end).not.toHaveBeenCalled();
  });

  it("releases the cursor and auto-panning once when a graph drag is cancelled", () => {
    const graph = new Graph({}, document.createElement("div"));
    const unlockCursor = jest.spyOn(graph, "unlockCursor");
    listen({ graph, dragCursor: "grabbing", autopanning: true });

    document.dispatchEvent(mouse("mousemove", 10, 10));
    expect(graph.getCursorLayer().isAuto()).toBe(false);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(true);

    window.dispatchEvent(new Event("blur"));

    expect(graph.getCursorLayer().isAuto()).toBe(true);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(false);

    document.dispatchEvent(mouse("mouseup", 10, 10));

    expect(unlockCursor).toHaveBeenCalledTimes(1);
    graph.detach();
  });
});
