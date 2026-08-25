import type { Graph } from "../graph";

export const GRAPH_INSTANCE_SYMBOL_KEY = "@gravity-ui/graph/instance";
export const LEGACY_GRAPH_INSTANCE_SYMBOL_KEY = "graph";

type GraphHostElement = HTMLElement & Record<symbol, Graph | undefined>;

export function setGraphInstance(element: HTMLElement, graph: Graph): void {
  const host = element as GraphHostElement;

  host[Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)] = graph;
  // Keep the old, undocumented key during the transition to the namespaced key.
  host[Symbol.for(LEGACY_GRAPH_INSTANCE_SYMBOL_KEY)] = graph;
}

export function clearGraphInstance(element: HTMLElement, graph: Graph): void {
  const host = element as GraphHostElement;

  for (const key of [GRAPH_INSTANCE_SYMBOL_KEY, LEGACY_GRAPH_INSTANCE_SYMBOL_KEY]) {
    const symbol = Symbol.for(key);
    if (host[symbol] === graph) {
      delete host[symbol];
    }
  }
}
