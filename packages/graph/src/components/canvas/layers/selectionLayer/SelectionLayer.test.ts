import { Graph } from "../../../../graph";
import type { GraphDragOperation } from "../../../../services/input/press";

import { SelectionLayer } from "./SelectionLayer";
import { selectionDrag } from "./test/selectionDrag";

type TSelectionLayerInternals = {
  context: { ctx: CanvasRenderingContext2D };
  render(): void;
};

describe("SelectionLayer", () => {
  let graph: Graph;
  let layer: SelectionLayer;
  let ctx: CanvasRenderingContext2D;
  let callbacks: GraphDragOperation;
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
    callbacks = selectionDrag(graph);
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
    const event = new PointerEvent("pointermove");

    callbacks.start?.(event, [10, 10]);
    callbacks.move?.(event, [...end], "pointer");
    renderLayer();

    expect(roundRect).not.toHaveBeenCalled();
  });

  it("does not apply a zero-size selection on drag end", () => {
    const selectRelatedElements = jest.spyOn(graph.rootStore.selectionService, "selectRelatedElements");
    const event = new PointerEvent("pointerup");

    callbacks.start?.(event, [10, 10]);
    callbacks.move?.(event, [50, 10], "pointer");
    callbacks.end?.(event, [50, 10]);
    renderLayer();

    expect(selectRelatedElements).not.toHaveBeenCalled();
    expect(roundRect).not.toHaveBeenCalled();
  });

  it("draws a selection rect with a non-zero size", () => {
    const event = new PointerEvent("pointermove");

    callbacks.start?.(event, [10, 10]);
    callbacks.move?.(event, [50, 40], "pointer");
    renderLayer();

    expect(roundRect).toHaveBeenCalledWith(10, 10, 40, 30, expect.any(Number));
  });

  it("clears the selection rect when dragged back to the start point", () => {
    const clearRect = jest.spyOn(ctx, "clearRect");
    const event = new PointerEvent("pointermove");

    callbacks.start?.(event, [10, 10]);
    callbacks.move?.(event, [50, 40], "pointer");
    renderLayer();
    roundRect.mockClear();
    clearRect.mockClear();

    callbacks.move?.(event, [10, 10], "pointer");
    renderLayer();

    expect(clearRect).toHaveBeenCalled();
    expect(roundRect).not.toHaveBeenCalled();
  });

  it("applies a non-zero selection on drag end", () => {
    const selectRelatedElements = jest.spyOn(graph.rootStore.selectionService, "selectRelatedElements");
    const event = new PointerEvent("pointerup");

    callbacks.start?.(event, [10, 10]);
    callbacks.move?.(event, [50, 40], "pointer");
    callbacks.end?.(event, [50, 40]);

    expect(selectRelatedElements).toHaveBeenCalledTimes(1);
  });
});
