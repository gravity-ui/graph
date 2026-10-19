import type { Graph } from "../graph";

/**
 * Key of the global symbol (`Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)`) under which an attached graph
 * stores itself on its root element. Test tooling such as `@gravity-ui/graph-playwright` uses it to
 * find the graph instance in the page. The value is part of the public contract.
 */
export const GRAPH_INSTANCE_SYMBOL_KEY = "@gravity-ui/graph/instance";

/**
 * Class the graph adds to its root while attached. Core styles give it `position: relative` with
 * zero specificity, so a root left `static` becomes the containing block of the layers, while any
 * position set by the application still wins.
 */
export const GRAPH_ROOT_CLASS_NAME = "graph-root";

type GraphHostElement = HTMLElement & Record<symbol, Graph | undefined>;

export function setGraphInstance(element: HTMLElement, graph: Graph): void {
  (element as GraphHostElement)[Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)] = graph;
}

export function clearGraphInstance(element: HTMLElement, graph: Graph): void {
  const host = element as GraphHostElement;
  const symbol = Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY);

  if (host[symbol] === graph) {
    delete host[symbol];
  }
}
