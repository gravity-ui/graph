import type { Graph } from "@gravity-ui/graph";
import { useSignal } from "@gravity-ui/graph-react";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import type { TGraphComponentEntity } from "./types";

/** Entity under the pointer on any LOD level, or null. */
export function useHoveredEntity(graph: Graph): TGraphComponentEntity | null {
  return useSignal(getUikitGraphStore(graph).$hovered)?.entity ?? null;
}
