import { GraphComponent } from "../../components/canvas/GraphComponent";
import { Graph } from "../../graph";
import { GraphMouseEvent } from "../../graphEvents";
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
