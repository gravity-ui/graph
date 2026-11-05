import { GraphComponent } from "../../components/canvas/GraphComponent";
import { Graph } from "../../graph";
import { GraphMouseEvent } from "../../graphEvents";
import { globalScheduler } from "../../lib/Scheduler";
import { EAnchorType } from "../../store/anchor/Anchor";
import { ECanDrag } from "../../store/settings";

import type { DragContext } from "./types";

class DraggableComponent extends GraphComponent {
  public getEntityId(): string {
    return "draggable";
  }

  public isDraggable(): boolean {
    return true;
  }
}

class CancellableComponent extends DraggableComponent {
  public handleDragCancel(_context: DragContext): void {
    // Spied in tests
  }
}

class OnDragComponent extends GraphComponent {
  public getEntityId(): string {
    return "on-drag";
  }

  public listenDrag(): void {
    this.onDrag({ isDraggable: () => true });
  }
}

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

function createGraph(): Graph {
  return new Graph({ settings: { canDrag: ECanDrag.ALL, dragThreshold: 0 } }, document.createElement("div"));
}

function press(graph: Graph, target: GraphComponent, x: number, y: number): void {
  const sourceEvent = mouse("mousedown", x, y);
  // A real press reaches the document capture listeners before the graph handles it
  document.dispatchEvent(sourceEvent);
  graph.dragService.handleMouseDown(
    new CustomEvent("mousedown", { detail: { target, sourceEvent } }) as GraphMouseEvent
  );
}

function world(graph: Graph, x: number, y: number): [number, number] {
  return graph.cameraService.applyToPoint(x, y) as [number, number];
}

function move(x: number, y: number): void {
  document.dispatchEvent(mouse("mousemove", x, y));
}

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function createOperationCallbacks() {
  return { onStart: jest.fn(), onUpdate: jest.fn(), onEnd: jest.fn(), onCancel: jest.fn() };
}

describe("DragService cancellation", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = createGraph();
  });

  afterEach(() => {
    document.dispatchEvent(mouse("mouseup", 0, 0));
    graph.detach();
  });

  it("cancel() ends a component drag and notifies participants through handleDragCancel", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    const onCancel = jest.spyOn(component, "handleDragCancel");
    const onEnd = jest.spyOn(component, "handleDragEnd");
    const onDrag = jest.spyOn(component, "handleDrag");

    press(graph, component, 0, 0);
    move(10, 10);
    move(20, 30);
    graph.dragService.cancel();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0]).toMatchObject({
      startCoords: world(graph, 10, 10),
      currentCoords: world(graph, 20, 30),
      components: [component],
    });
    expect(onEnd).not.toHaveBeenCalled();
    expect(graph.dragService.$state.value.isDragging).toBe(false);
    expect(graph.getCursorLayer().isAuto()).toBe(true);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(false);

    const dragCalls = onDrag.mock.calls.length;
    move(40, 40);
    document.dispatchEvent(mouse("mouseup", 40, 40));

    expect(onDrag).toHaveBeenCalledTimes(dragCalls);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("finishes the drag through handleDragEnd when a participant does not handle cancellation", () => {
    const component = new DraggableComponent({}, graph.getGraphLayer());
    const onEnd = jest.spyOn(component, "handleDragEnd");

    press(graph, component, 0, 0);
    move(10, 10);
    move(20, 30);
    graph.dragService.cancel();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0]).toMatchObject({ currentCoords: world(graph, 20, 30) });
  });

  it("cancel() before the drag threshold is crossed lets the next gesture start", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    const onStart = jest.spyOn(component, "handleDragStart");
    const onCancel = jest.spyOn(component, "handleDragCancel");

    press(graph, component, 0, 0);
    graph.dragService.cancel();
    move(10, 10);

    expect(onStart).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    press(graph, component, 0, 0);
    move(10, 10);

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("cancels the drag when the window loses focus, so the next gesture starts", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    const onStart = jest.spyOn(component, "handleDragStart");
    const onCancel = jest.spyOn(component, "handleDragCancel");

    press(graph, component, 0, 0);
    move(10, 10);
    window.dispatchEvent(new Event("blur"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(graph.dragService.$state.value.isDragging).toBe(false);

    press(graph, component, 0, 0);
    move(10, 10);

    expect(onStart).toHaveBeenCalledTimes(2);
    expect(graph.dragService.$state.value.isDragging).toBe(true);
  });

  it("cancels a drag whose mouseup was lost when the next press arrives", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    const onStart = jest.spyOn(component, "handleDragStart");
    const onCancel = jest.spyOn(component, "handleDragCancel");

    press(graph, component, 0, 0);
    move(10, 10);
    press(graph, component, 50, 50);
    move(60, 60);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(2);
  });
});

describe("DragService.startDrag cancellation", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = createGraph();
  });

  afterEach(() => {
    document.dispatchEvent(mouse("mouseup", 0, 0));
    graph.detach();
  });

  it("calls onCancel with the last event and coordinates instead of onEnd", () => {
    const onEnd = jest.fn();
    const onCancel = jest.fn();
    const lastMove = mouse("mousemove", 20, 30);

    graph.dragService.startDrag({ onEnd, onCancel });
    move(10, 10);
    document.dispatchEvent(lastMove);
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(mouse("mouseup", 20, 30));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(lastMove, world(graph, 20, 30));
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("calls onEnd with the last event and coordinates when onCancel is not provided", () => {
    const onEnd = jest.fn();
    const lastMove = mouse("mousemove", 20, 30);

    graph.dragService.startDrag({ onEnd });
    move(10, 10);
    document.dispatchEvent(lastMove);
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(mouse("mouseup", 20, 30));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(lastMove, world(graph, 20, 30));
  });
});

describe("DragService.startDrag component capture", () => {
  let graph: Graph;
  let component: GraphComponent;
  let captureEvents: jest.SpyInstance;
  let releaseCapture: jest.SpyInstance;

  beforeEach(() => {
    graph = createGraph();
    component = new DraggableComponent({}, graph.getGraphLayer());
    captureEvents = jest.spyOn(graph.getGraphLayer(), "captureEvents");
    releaseCapture = jest.spyOn(graph.getGraphLayer(), "releaseCapture");
  });

  afterEach(() => {
    setVisibilityState("visible");
    document.dispatchEvent(mouse("mouseup", 0, 0));
    graph.detach();
  });

  it("captures the component once the drag starts and releases it on mouseup", () => {
    graph.dragService.startDrag({}, { component, threshold: 10 });
    move(0, 0);
    move(2, 2);

    expect(captureEvents).not.toHaveBeenCalled();

    move(50, 50);

    expect(captureEvents).toHaveBeenCalledTimes(1);
    expect(captureEvents).toHaveBeenCalledWith(component);
    expect(releaseCapture).not.toHaveBeenCalled();

    document.dispatchEvent(mouse("mouseup", 50, 50));

    expect(releaseCapture).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => void]>([
    ["cancel() is called", () => graph.dragService.cancel()],
    ["the window loses focus", () => window.dispatchEvent(new Event("blur"))],
    [
      "the page becomes hidden",
      () => {
        setVisibilityState("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
    ["a new press arrives", () => document.dispatchEvent(mouse("mousedown", 50, 50))],
  ])("releases the captured component when %s", (_cause, cancelDrag) => {
    const onCancel = jest.fn();

    graph.dragService.startDrag({ onCancel }, { component });
    move(10, 10);

    expect(captureEvents).toHaveBeenCalledWith(component);

    cancelDrag();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(releaseCapture).toHaveBeenCalledTimes(1);
  });

  it("captures the component that drags itself with GraphComponent.onDrag", () => {
    const onDragComponent = new OnDragComponent({}, graph.getGraphLayer());
    onDragComponent.listenDrag();

    onDragComponent.dispatchEvent(mouse("mousedown", 0, 0));
    move(10, 10);

    expect(captureEvents).toHaveBeenCalledWith(onDragComponent);

    document.dispatchEvent(mouse("mouseup", 10, 10));

    expect(releaseCapture).toHaveBeenCalledTimes(1);
  });
});

describe("DragService.cancel() with a startDrag operation", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = createGraph();
  });

  afterEach(() => {
    document.dispatchEvent(mouse("mouseup", 0, 0));
    graph.detach();
  });

  it("calls onCancel once with the last event and coordinates and ignores the rest of the gesture", () => {
    const callbacks = createOperationCallbacks();
    const lastMove = mouse("mousemove", 20, 30);

    graph.dragService.startDrag(callbacks, { cursor: "crosshair" });
    move(10, 10);
    document.dispatchEvent(lastMove);
    graph.dragService.cancel();

    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onCancel).toHaveBeenCalledWith(lastMove, world(graph, 20, 30));
    expect(graph.getCursorLayer().isAuto()).toBe(true);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(false);

    const updatesBeforeCancel = callbacks.onUpdate.mock.calls.length;
    move(40, 40);
    document.dispatchEvent(mouse("mouseup", 40, 40));

    expect(callbacks.onUpdate).toHaveBeenCalledTimes(updatesBeforeCancel);
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd once with the last event and coordinates when onCancel is not provided", () => {
    const onEnd = jest.fn();
    const lastMove = mouse("mousemove", 20, 30);

    graph.dragService.startDrag({ onEnd });
    move(10, 10);
    document.dispatchEvent(lastMove);
    graph.dragService.cancel();
    document.dispatchEvent(mouse("mouseup", 40, 40));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(lastMove, world(graph, 20, 30));
  });

  it("drops an operation that has not crossed the drag threshold without calling back", () => {
    const callbacks = createOperationCallbacks();

    graph.dragService.startDrag(callbacks, { threshold: 10 });
    move(0, 0);
    move(2, 2);
    graph.dragService.cancel();
    move(50, 50);
    move(60, 60);
    document.dispatchEvent(mouse("mouseup", 60, 60));

    expect(callbacks.onStart).not.toHaveBeenCalled();
    expect(callbacks.onUpdate).not.toHaveBeenCalled();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });

  it("does nothing once the operation is cancelled or has ended", () => {
    const cancelled = createOperationCallbacks();
    graph.dragService.startDrag(cancelled);
    move(10, 10);
    graph.dragService.cancel();
    graph.dragService.cancel();

    expect(cancelled.onCancel).toHaveBeenCalledTimes(1);

    const ended = createOperationCallbacks();
    graph.dragService.startDrag(ended);
    move(10, 10);
    document.dispatchEvent(mouse("mouseup", 10, 10));
    graph.dragService.cancel();

    expect(ended.onEnd).toHaveBeenCalledTimes(1);
    expect(ended.onCancel).not.toHaveBeenCalled();
    expect(cancelled.onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a component drag and an operation that run at the same time", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    const onDragCancel = jest.spyOn(component, "handleDragCancel");
    const callbacks = createOperationCallbacks();

    press(graph, component, 0, 0);
    graph.dragService.startDrag(callbacks);
    move(10, 10);
    graph.dragService.cancel();

    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(graph.dragService.$state.value.isDragging).toBe(false);
  });
});

describe("DragService error handling", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = createGraph();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.dispatchEvent(mouse("mouseup", 0, 0));
    graph.detach();
  });

  it("resets the drag even if a participant's handleDragCancel throws", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    jest.spyOn(component, "handleDragCancel").mockImplementation(() => {
      throw new Error("cancel failed");
    });

    press(graph, component, 0, 0);
    move(10, 10);

    expect(() => graph.dragService.cancel()).toThrow("cancel failed");
    expect(graph.dragService.$state.value.isDragging).toBe(false);
    expect(graph.getCursorLayer().isAuto()).toBe(true);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(false);
  });

  it("cancels a running operation even if a component drag participant's handleDragCancel throws", () => {
    const component = new CancellableComponent({}, graph.getGraphLayer());
    jest.spyOn(component, "handleDragCancel").mockImplementation(() => {
      throw new Error("cancel failed");
    });
    const onCancel = jest.fn();

    press(graph, component, 0, 0);
    graph.dragService.startDrag({ onCancel });
    move(10, 10);

    expect(() => graph.dragService.cancel()).toThrow("cancel failed");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("resets the drag even if a participant's handleDragEnd throws", () => {
    const component = new DraggableComponent({}, graph.getGraphLayer());
    jest.spyOn(component, "handleDragEnd").mockImplementation(() => {
      throw new Error("end failed");
    });
    // An exception thrown by a DOM listener is reported to window "error" handlers, not to the dispatcher
    const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
    window.addEventListener("error", onError);

    press(graph, component, 0, 0);
    move(10, 10);
    document.dispatchEvent(mouse("mouseup", 10, 10));
    window.removeEventListener("error", onError);

    expect(onError).toHaveBeenCalledTimes(1);

    expect(graph.dragService.$state.value.isDragging).toBe(false);
    expect(graph.getCursorLayer().isAuto()).toBe(true);
    expect(graph.cameraService.getCameraState().autoPanningEnabled).toBe(false);
  });
});

describe("DragService cancellation through an anchor", () => {
  it("routes the cancellation to the block's handleDragCancel", () => {
    const graph = new Graph(
      {
        settings: { canDrag: ECanDrag.ALL, dragThreshold: 0 },
        blocks: [
          {
            is: "Block",
            id: "a",
            name: "A",
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            selected: false,
            anchors: [{ id: "out", blockId: "a", type: EAnchorType.OUT }],
          },
        ],
      },
      document.createElement("div")
    );
    graph.start();
    try {
      globalScheduler.performUpdate();
      const blockState = graph.blocks.getBlockState("a");
      const block = blockState?.getViewComponent();
      const anchor = blockState?.getAnchorById("out")?.getViewComponent();
      if (!block || !anchor) throw new Error("Expected block and anchor views");
      // A block that reverts on cancel instead of finishing the drag
      const onCancel = jest.spyOn(block, "handleDragCancel").mockImplementation(() => undefined);
      const onEnd = jest.spyOn(block, "handleDragEnd");

      press(graph, anchor, 0, 0);
      move(10, 10);
      graph.dragService.cancel();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onEnd).not.toHaveBeenCalled();
    } finally {
      graph.stop();
      graph.unmount();
    }
  });
});
