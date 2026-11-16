import { useMemo } from "react";

import type { Graph, TEntityId, TEntityType, TTag } from "@gravity-ui/graph";
import { useSignal } from "@gravity-ui/graph-react";

/**
 * The value of one tag on an entity, read reactively from `graph.scene.tags`: the component renders again when the
 * entity's tags change, without polling. `GraphBlock` puts a `graph-tag-<name>` class on the wrapper, but not the
 * value of a tag with a value (`statusTag`): this hook reads it.
 */
export function useTagValue<V>(graph: Graph, type: TEntityType, id: TEntityId, tag: TTag<V>): V | undefined {
  // The same signal GraphBlock's useEntityStyle reads: the store hands out one per entity while it is watched.
  const $tags = useMemo(() => graph.scene.tags.$of(type, id), [graph, type, id]);
  const tags = useSignal($tags);
  // A tag's values are typed by the tag (`TTag<V>`); the entity's tag set holds them as unknown.
  return tags.get(tag) as V | undefined;
}
