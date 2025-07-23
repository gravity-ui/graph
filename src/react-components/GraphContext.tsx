import React, { createContext, useContext } from "react";

import type { Graph } from "../graph";

/**
 * Контекст для передачи Graph instance дочерним компонентам
 */
export interface GraphContextType {
  graph: Graph;
}

export const GraphContext = createContext<GraphContextType | null>(null);

/**
 * Хук для получения Graph instance из контекста
 *
 * @throws {Error} Если используется вне GraphCanvas
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

/**
 * Провайдер контекста для Graph
 */
export interface GraphContextProviderProps {
  graph: Graph;
  children: React.ReactNode;
}

export function GraphContextProvider({ graph, children }: GraphContextProviderProps) {
  const contextValue = React.useMemo(() => ({ graph }), [graph]);

  return <GraphContext.Provider value={contextValue}>{children}</GraphContext.Provider>;
}
