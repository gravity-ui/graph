import { computed } from "@preact/signals-core";

import type { Graph } from "../../graph";

import { draggingTag, selectedTag } from "./builtinTags";
import { getEntityAddress } from "./entity";
import type { TEntityId, TTagMembers } from "./types";

function byType(components: readonly object[]): TTagMembers<true> {
  const members: Record<string, TEntityId[]> = {};
  for (const component of components) {
    const address = getEntityAddress(component);
    if (!address) continue;
    (members[address.type] ??= []).push(address.id);
  }
  return members;
}

/**
 * Binds the core's built-in tags to their writers. The returned function unbinds them. `hoveredTag` is not bound:
 * each component writes it on its own entity from the pointer events it gets (`GraphComponent.setHoveredTag`, D5).
 */
export function bindBuiltinTags(graph: Graph): () => void {
  const unbinds = [
    graph.scene.tags.bind(
      selectedTag,
      computed(() => {
        const members: Record<string, TEntityId[]> = {};
        for (const [type, ids] of graph.selectionService.$selection.value) members[type] = [...ids];
        return members;
      })
    ),
    graph.scene.tags.bind(
      draggingTag,
      computed(() => {
        const state = graph.dragService.$state.value;
        return state.isDragging ? byType(state.components) : {};
      })
    ),
  ];
  return (): void => unbinds.forEach((unbind) => unbind());
}
