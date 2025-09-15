import React, { forwardRef, useImperativeHandle, useState } from "react";

import { GraphState } from "@gravity-ui/graph";
import type { Layer } from "@gravity-ui/graph";

import { useGraphContext } from "./GraphContext";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { useLayer } from "./hooks/useLayer";

/**
 * Type constructor for Layer class
 */
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Extracts property types from Layer constructor
 */
type LayerPropsForConstructor<TLayer extends Constructor<Layer>> =
  TLayer extends Constructor<Layer<infer LayerProps>>
    ? Omit<LayerProps, "root" | "camera" | "graph" | "emitter"> & { root?: LayerProps["root"] }
    : never;

/**
 * Extracts layer instance type from constructor
 */
type LayerInstanceForConstructor<TLayer extends Constructor<Layer>> =
  TLayer extends Constructor<infer LayerInstance> ? LayerInstance : never;

/**
 * Props for GraphLayer component
 */
export interface GraphLayerProps<TLayer extends Constructor<Layer> = Constructor<Layer>> {
  /**
   * Layer constructor class
   */
  layer: TLayer;
  /**
   * Props to pass to layer constructor
   */
  props?: LayerPropsForConstructor<TLayer>;
  /**
   * Ref to access layer instance
   */
  ref?: React.Ref<LayerInstanceForConstructor<TLayer>>;
}

/**
 * GraphLayer component provides declarative way to add existing Layer classes to the graph
 */
export const GraphLayer = forwardRef<LayerInstanceForConstructor<Constructor<Layer>>, GraphLayerProps>(
  function GraphLayer<TLayer extends Constructor<Layer>>(
    { layer: LayerClass, props }: GraphLayerProps<TLayer>,
    ref
  ): React.ReactElement | null {
    // Get graph from context
    const { graph } = useGraphContext();

    // Track graph state to determine readiness for layer creation
    const [_graphState, setGraphState] = useState<GraphState>(graph?.state ?? GraphState.INIT);

    // Subscribe to graph state changes
    useGraphEvent(graph, "state-change", ({ state }) => {
      setGraphState(state);
    });

    // Always create layer using useLayer (hooks must be called unconditionally)
    const layer = useLayer(graph, LayerClass, (props as any) || {});

    // Expose layer through ref
    useImperativeHandle(ref, () => layer!, [layer]);

    // GraphLayer doesn't render any visible content
    return null;
  }
);
