import { effect, untracked } from "@preact/signals-core";

import type { Graph } from "../../graph";

import { isSceneKeyed } from "./sceneKey";

/**
 * Selection raises (spec V3, decision 6): element owners that become selected get new highest `order`s, in their
 * current scene order, so a group keeps its relative order. Deselection keeps the order, and a selected child element
 * (an anchor) does not raise its owner. The +1 bucket while selected is the theme's `raise` rule, and the drag raise
 * comes from `Block.handleDragStart` (`GraphScene.requestRaise`).
 */
export function bindSceneRaises(graph: Graph): () => void {
  let selected = new Set<object>();
  return effect(() => {
    const components = graph.selectionService.$selectedComponents.value;
    const entered = components.filter((component) => !selected.has(component));
    selected = new Set<object>(components);
    if (entered.length === 0) return;
    untracked(() => {
      const ids: string[] = [];
      for (const component of entered) {
        const key = isSceneKeyed(component) ? component.getSceneKey() : undefined;
        const element = key ? graph.scene.store.get(key.elementId) : undefined;
        if (element && element.parent === undefined) ids.push(element.id);
      }
      if (ids.length > 0) graph.scene.store.raiseMany(ids);
    });
  });
}
