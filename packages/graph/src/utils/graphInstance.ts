import type { Graph } from "../graph";

/**
 * Key of the global symbol (`Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)`) under which an attached graph
 * stores itself on its root element. Test tooling such as `@gravity-ui/graph-playwright` uses it to
 * find the graph instance in the page. The value is part of the public contract.
 */
export const GRAPH_INSTANCE_SYMBOL_KEY = "@gravity-ui/graph/instance";

/**
 * Class the graph adds to its root while attached. Core styles give it `position: relative` in the
 * `gravity-graph` cascade layer with zero specificity, so a root left `static` becomes the
 * containing block of the layers, while a position set by the application's unlayered styles or
 * later layers still wins.
 */
export const GRAPH_ROOT_CLASS_NAME = "graph-root";

type TGraphRootMark = {
  graphs: Set<Graph>;
  /** The application had set the class itself; it stays when the last graph leaves. */
  preserveClass: boolean;
};

const graphRootMarks = new WeakMap<HTMLElement, TGraphRootMark>();

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

/** Adds the root class while at least one graph is attached to the element. */
export function markGraphRoot(element: HTMLElement, graph: Graph): void {
  let mark = graphRootMarks.get(element);
  if (!mark) {
    mark = { graphs: new Set(), preserveClass: element.classList.contains(GRAPH_ROOT_CLASS_NAME) };
    graphRootMarks.set(element, mark);
  }
  mark.graphs.add(graph);
  element.classList.add(GRAPH_ROOT_CLASS_NAME);
}

/** Removes the root class when the last graph leaves, unless the application had set it. */
export function unmarkGraphRoot(element: HTMLElement, graph: Graph): void {
  const mark = graphRootMarks.get(element);
  if (!mark?.graphs.delete(graph) || mark.graphs.size > 0) {
    return;
  }
  graphRootMarks.delete(element);
  if (!mark.preserveClass) {
    element.classList.remove(GRAPH_ROOT_CLASS_NAME);
  }
}
