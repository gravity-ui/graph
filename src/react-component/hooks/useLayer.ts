import { useEffect, useMemo } from "react";

import isEqual from "lodash/isEqual";

import type { Graph } from "../../graph";
import type { Layer } from "../../services/Layer";
import { usePrevious } from "../../utils/hooks/usePrevious";

/**
 * Hook for managing graph layers.
 *
 * Provides a convenient way to add and manage layers in the graph.
 * Automatically handles layer initialization and props updates.
 * Uses deep props comparison to optimize re-renders.
 *
 * @example
 * ```tsx
 * const devToolsLayer = useLayer(graph, DevToolsLayer, {
 *   showRuler: true,
 *   rulerSize: 20,
 * });
 * ```
 *
 * @template T - Type of layer constructor extending Layer
 * @param graph - Graph instance
 * @param layerCtor - Layer class constructor
 * @param props - Layer properties (excluding internal props like root, camera, graph, emitter)
 * @returns Layer instance or null if graph is not initialized
 */
export function useLayer<T extends Constructor<Layer> = Constructor<Layer>>(
  graph: Graph | null,
  layerCtor: T,
  props: T extends Constructor<Layer<infer Props>>
    ? Omit<Props, "root" | "camera" | "graph" | "emitter"> & { root?: Props["root"] }
    : never
) {
  const layer = useMemo(() => (graph ? graph.addLayer(layerCtor, props) : null), [graph]);
  const prevProps = usePrevious(props);

  useEffect(() => {
    if (layer && (!prevProps || !isEqual(prevProps, props))) {
      layer.setProps(props);
    }
    return () => {
      layer?.detachLayer();
    };
  }, [layer, props, prevProps]);

  return layer;
}
