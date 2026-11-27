import type { Graph } from "../../../../../graph";
import { dispatchGesture } from "../../../../../services/input/press";
import type { GraphDragOperation } from "../../../../../services/input/press";

/** Obtain the real layer's operation for tests that exercise its geometry directly. */
export function selectionDrag(graph: Graph): GraphDragOperation {
  const point = graph.cameraService.createCameraPoint({ x: 0, y: 0 });
  const pressEvent = new PointerEvent("pointerdown", { metaKey: true });
  let selected: GraphDragOperation | undefined;
  dispatchGesture(graph, [], new PointerEvent("pointermove"), point, graph.scene.$level.peek(), {
    pressEvent,
    start: point,
    claim: (operation) => {
      selected = operation;
      return () => {};
    },
  });
  if (!selected) throw new Error("Selection layer did not claim the background drag");
  return selected;
}
