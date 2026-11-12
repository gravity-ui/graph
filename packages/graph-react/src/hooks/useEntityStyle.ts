import { useMemo } from "react";
import type { CSSProperties } from "react";

import type { Graph, TEntityAddress, TStyleTarget } from "@gravity-ui/graph";

import { useSignal } from "./useSignal";

function tagClass(name: string): string {
  return `graph-tag-${name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
}

/** Tag classes and part colour variables of an entity, for React wrappers of scene components. */
export function useEntityStyle(
  graph: Graph,
  entity: TEntityAddress,
  target: TStyleTarget,
  prefix: string
): { className: string; style: CSSProperties } {
  const tags = useSignal(graph.scene.tags.$of(entity.type, entity.id));
  const generation = useSignal(graph.scene.$styleGeneration);
  return useMemo(() => {
    const className = [...tags.keys()].map((tag) => tagClass(tag.name)).join(" ");
    const computed = graph.scene.styleFor(target, tags);
    const variables: Record<string, string> = {};
    const parts = new Set([...Object.keys(computed.base ?? {}), ...Object.keys(computed.parts ?? {})]);
    for (const part of parts) {
      const color = computed.parts?.[part]?.color ?? computed.base?.[part]?.color;
      if (color !== undefined) variables[`--${prefix}-${part}-color`] = color;
    }
    return { className, style: variables as CSSProperties };
    // generation re-runs the memo when rules, root tags, the level or the theme change.
  }, [graph, target, prefix, tags, generation]);
}
