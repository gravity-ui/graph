import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { CoreComponent } from "../../lib/CoreComponent";

/**
 * The component a press on `target` drags (D8, as in the DOM): `target` itself when it is draggable, else its nearest
 * draggable ancestor, so a press on a child button inside a block drags the block. Undefined when nothing in the chain
 * is draggable: then the camera pans.
 *
 * The walk goes from `target` up through `getParent()` and returns the first `GraphComponent` whose `isDraggable()` is
 * true. Components that are not graph components (the blocks container, the layer, the camera) are passed over, never
 * returned. Availability (`isEntityAvailable()`) is not part of the walk: the caller checks the component it gets.
 *
 * A component with a gesture of its own makes itself draggable (as `Anchor` does, forwarding the drag to its block) or
 * prevents the graph's `mousedown`.
 */
export function findDragTarget(target: CoreComponent | undefined): GraphComponent | undefined {
  for (let node: CoreComponent | undefined = target; node; node = node.getParent()) {
    if (node instanceof GraphComponent && node.isDraggable()) return node;
  }
  return undefined;
}
