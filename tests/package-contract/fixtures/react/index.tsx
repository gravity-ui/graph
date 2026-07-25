import * as React from "react";
import { Graph, type TGraphColors } from "@gravity-ui/graph";
import { GraphCanvas, GraphContext, useGraph, useGraphEvent, type HookGraphParams } from "@gravity-ui/graph/react";

const colors: Partial<TGraphColors> = {};
const params: HookGraphParams = { viewConfiguration: { colors } };

export function ContractGraph() {
  const { graph } = useGraph(params);

  useGraphEvent(graph, "camera-change", () => undefined);

  return <GraphCanvas graph={graph} />;
}

export const reactContract = {
  React,
  Graph,
  GraphCanvas,
  GraphContext,
  ContractGraph,
};
