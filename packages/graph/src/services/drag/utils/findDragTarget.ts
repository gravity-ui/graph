import { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { CoreComponent } from "../../../lib/CoreComponent";

/**
 * A press on a child can drag its nearest draggable ancestor. Selected-only mode also requires
 * membership in the selection at press, even if a delayed click selects the target during this gesture.
 * The caller checks entity availability and handles camera pan when no component qualifies.
 */
export function findDragTarget(
  target: CoreComponent | undefined,
  pointerType?: string,
  selectedAtPress?: readonly GraphComponent[]
): GraphComponent | undefined {
  for (let node: CoreComponent | undefined = target; node; node = node.getParent()) {
    if (
      node instanceof GraphComponent &&
      node.isDraggable(pointerType) &&
      (!selectedAtPress || selectedAtPress.includes(node))
    ) {
      return node;
    }
  }
  return undefined;
}
