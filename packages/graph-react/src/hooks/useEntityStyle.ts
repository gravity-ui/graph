import { useMemo } from "react";
import type { CSSProperties } from "react";

import type { Graph, TEntityAddress, TSceneMotion, TStyleTarget } from "@gravity-ui/graph";

import { useSignal } from "./useSignal";

function tagClass(name: string): string {
  return `graph-tag-${name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
}

/** Tag classes, block motion classes and part colour variables for React wrappers of scene components. */
export function useEntityStyle(
  graph: Graph,
  entity: TEntityAddress,
  target: TStyleTarget,
  prefix: string
): { className: string; style: CSSProperties; motion?: TSceneMotion } {
  const tags = useSignal(graph.scene.tags.$of(entity.type, entity.id));
  const generation = useSignal(graph.scene.$styleCascadeGeneration);
  return useMemo(() => {
    const classes = [...tags.keys()].map((tag) => tagClass(tag.name));
    const computed = graph.scene.styleFor(target, tags);
    if (entity.type === "block" && computed.motion && computed.motion !== "none") {
      classes.push(`graph-motion-${computed.motion}`);
    }
    const variables: Record<string, string> = {};
    const parts = new Set([...Object.keys(computed.base ?? {}), ...Object.keys(computed.parts ?? {})]);
    for (const part of parts) {
      const color = computed.parts?.[part]?.color ?? computed.base?.[part]?.color;
      if (color !== undefined) variables[`--${prefix}-${part}-color`] = color;
    }
    return {
      className: classes.join(" "),
      style: variables as CSSProperties,
      motion: computed.motion,
    };
    // The cascade generation also covers unbound HTML targets. An equivalent level keeps the memo.
  }, [graph, target, prefix, tags, generation, entity.type]);
}
