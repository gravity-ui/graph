import React, { createContext, useContext } from "react";

import type { Graph } from "../graph";

export interface GraphContextType {
  graph: Graph;
}

export const GraphContext = createContext<GraphContextType | null>(null);

/**
 * Hook for getting Graph instance from context
 *
 * @throws {Error} If used outside of GraphCanvas
 */
export function useGraphContext(): GraphContextType {
  const context = useContext(GraphContext);

  if (!context) {
    throw new Error(
      "useGraphContext must be used within a GraphCanvas component. " +
        "Make sure your GraphLayer/GraphPortal components are children of GraphCanvas."
    );
  }

  return context;
}

export interface GraphContextProviderProps {
  graph: Graph;
  children: React.ReactNode;
}

export function GraphContextProvider({ graph, children }: GraphContextProviderProps) {
  const contextValue = React.useMemo(() => ({ graph }), [graph]);

  return <GraphContext.Provider value={contextValue}>{children}</GraphContext.Provider>;
}
