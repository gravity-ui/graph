import type { Graph } from "../src/graph";

declare global {
  interface Window {
    GraphModule: any;
    graph: Graph;
    graphInitialized: boolean;
    graphStarted?: boolean;
    graphLibraryLoaded?: boolean;
    React?: any;
    ReactDOM?: any;
  }
}

export {};
