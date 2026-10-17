import type { Graph } from "@gravity-ui/graph";

type GraphModule = typeof import("@gravity-ui/graph") &
  Pick<typeof import("@gravity-ui/graph-minimap"), "MiniMapLayer"> &
  Pick<typeof import("@gravity-ui/graph-react"), "GraphBlock" | "GraphBlockAnchor" | "GraphCanvas"> & {
    React: typeof import("react");
    ReactDOM: typeof import("react-dom/client");
  };

type ElkModule = typeof import("./elk-entry");

declare global {
  interface Window {
    GraphModule: GraphModule;
    ElkModule: ElkModule;
    graph: Graph;
    graphInitialized: boolean;
    graphStarted?: boolean;
    graphLibraryLoaded?: boolean;
    React?: typeof import("react");
    ReactDOM?: typeof import("react-dom/client");
  }
}

export {};
