import { Graph } from "../../../../graph";
import { Camera } from "../../../../services/camera/Camera";
import type { DragOperationCallbacks } from "../../../../services/drag";

import { SelectionLayer } from "./SelectionLayer";

type TSelectionLayerInternals = {
  context: { ctx: CanvasRenderingContext2D };
  render(): void;
};

describe("SelectionLayer", () => {
  let graph: Graph;
  let layer: SelectionLayer;
  let ctx: CanvasRenderingContext2D;
  let callbacks: DragOperationCallbacks;
  let roundRect: jest.Mock;

  const renderLayer = (): void => {
    (layer as unknown as TSelectionLayerInternals).render();
  };

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    layer = (graph as unknown as { selectionLayer: SelectionLayer }).selectionLayer;
    ctx = (layer as unknown as TSelectionLayerInternals).context.ctx;
    // jest-canvas-mock does not implement roundRect
    roundRect = jest.fn();
    ctx.roundRect = roundRect;
    jest.spyOn(graph.dragService, "startDrag").mockImplementation((dragCallbacks) => {
      callbacks = dragCallbacks;
      return undefined as unknown as ReturnType<Graph["dragService"]["startDrag"]>;
    });
    graph.emit("mousedown", {
      sourceEvent: new MouseEvent("mousedown", { metaKey: true }),
      // SelectionLayer starts a selection only when the press lands on the camera (empty space)
      target: Object.create(Camera.prototype) as Camera,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    graph.unmount();
  });

  it.each([
    { name: "zero width and height", end: [10, 10] },
    { name: "zero height", end: [50, 10] },
    { name: "zero width", end: [10, 50] },
  ] as const)("does not draw a selection rect with $name", ({ end }) => {
    const event = new MouseEvent("mousemove");

    callbacks.onStart?.(event, [10, 10]);
    callbacks.onUpdate?.(event, [...end]);
    renderLayer();

    expect(roundRect).not.toHaveBeenCalled();
  });

  it("does not apply a zero-size selection on drag end", () => {
    const selectRelatedElements = jest.spyOn(graph.rootStore.selectionService, "selectRelatedElements");
    const event = new MouseEvent("mouseup");

    callbacks.onStart?.(event, [10, 10]);
    callbacks.onUpdate?.(event, [50, 10]);
    callbacks.onEnd?.(event, [50, 10]);
    renderLayer();

    expect(selectRelatedElements).not.toHaveBeenCalled();
    expect(roundRect).not.toHaveBeenCalled();
  });

  it("draws a selection rect with a non-zero size", () => {
    const event = new MouseEvent("mousemove");

    callbacks.onStart?.(event, [10, 10]);
    callbacks.onUpdate?.(event, [50, 40]);
    renderLayer();

    expect(roundRect).toHaveBeenCalledWith(10, 10, 40, 30, expect.any(Number));
  });

  it("clears the selection rect when dragged back to the start point", () => {
    const clearRect = jest.spyOn(ctx, "clearRect");
    const event = new MouseEvent("mousemove");

    callbacks.onStart?.(event, [10, 10]);
    callbacks.onUpdate?.(event, [50, 40]);
    renderLayer();
    roundRect.mockClear();
    clearRect.mockClear();

    callbacks.onUpdate?.(event, [10, 10]);
    renderLayer();

    expect(clearRect).toHaveBeenCalled();
    expect(roundRect).not.toHaveBeenCalled();
  });

  it("applies a non-zero selection on drag end", () => {
    const selectRelatedElements = jest.spyOn(graph.rootStore.selectionService, "selectRelatedElements");
    const event = new MouseEvent("mouseup");

    callbacks.onStart?.(event, [10, 10]);
    callbacks.onUpdate?.(event, [50, 40]);
    callbacks.onEnd?.(event, [50, 40]);

    expect(selectRelatedElements).toHaveBeenCalledTimes(1);
  });
});
