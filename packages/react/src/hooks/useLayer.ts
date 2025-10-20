import { useDeferredValue, useLayoutEffect, useState } from "react";

import type { Graph, Layer, LayerPublicProps } from "@gravity-ui/graph";
import type { Constructor } from "@gravity-ui/graph/utils";
import isEqual from "lodash/isEqual";

import { usePrevious } from "./usePrevious";

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
  props: LayerPublicProps<T>
) {
  const [layer, setLayer] = useState<InstanceType<T> | null>(null);
  const deferredLayer = useDeferredValue(layer);

  useLayoutEffect(() => {
    // setLayer will apply the next state not immediately,
    // so we have to store link to layer instance in useLayoutEffect
    // in order to detach that layer from graph in case of fast re-run of effect
    const layerInstance = graph ? graph.addLayer(layerCtor, props) : null;
    setLayer(layerInstance);
    return () => {
      // detach layer from graph
      if (layerInstance) {
        graph?.detachLayer(layerInstance);
      }
    };
  }, [layerCtor, graph]);

  const prevProps = usePrevious(props);

  useLayoutEffect(() => {
    if (deferredLayer && (!prevProps || !isEqual(prevProps, props))) {
      deferredLayer.setProps(props);
    }
  }, [layer, props, prevProps]);

  return layer;
}
