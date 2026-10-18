import type { Graph } from "@gravity-ui/graph";

type GraphModule = typeof import("@gravity-ui/graph") &
  Pick<typeof import("@gravity-ui/graph-minimap"), "MiniMapLayer"> &
  Pick<
    typeof import("@gravity-ui/graph-layered"),
    "computeLevels" | "layeredConverter" | "layoutGraph"
  > &
  Pick<typeof import("@gravity-ui/graph-layered/react"), "useLayeredLayout"> &
  Pick<typeof import("@gravity-ui/graph-css-variables"), "CSSVariablesLayer"> &
  Pick<typeof import("@gravity-ui/graph-connection-editing"), "ConnectionEditingLayer"> &
  Pick<
    typeof import("@gravity-ui/graph-react"),
    "GraphBlock" | "GraphBlockAnchor" | "GraphCanvas" | "useGraph" | "useLayer"
  > & {
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
    React?: typeof import("react");
    ReactDOM?: typeof import("react-dom/client");
  }
}

export {};
