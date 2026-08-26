import type { Graph } from "@gravity-ui/graph";

type GraphModule = typeof import("@gravity-ui/graph") &
  Pick<typeof import("@gravity-ui/graph/react"), "GraphBlock" | "GraphBlockAnchor" | "GraphCanvas"> & {
    React: typeof import("react");
    ReactDOM: typeof import("react-dom/client");
  };

declare global {
  interface Window {
    GraphModule: GraphModule;
    graph: Graph;
    graphInitialized: boolean;
    graphStarted?: boolean;
    graphLibraryLoaded?: boolean;
    React?: any;
    ReactDOM?: any;
  }
}

export {};
