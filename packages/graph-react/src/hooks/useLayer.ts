import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";

import type { Graph, GraphClassConstructor, Layer, LayerPublicProps } from "@gravity-ui/graph";
import { GraphState } from "@gravity-ui/graph";
import isEqual from "lodash/isEqual";

import { usePrevious } from "./usePrevious";

/**
 * Hook for managing graph layers.
 *
 * Provides a convenient way to add and manage layers in the graph.
 * Automatically handles layer initialization and props updates.
 * Returns null before graph attachment and after full graph detachment. Call hooks
 * unconditionally to observe readiness and graph replacement.
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
 * @returns Layer instance or null if graph is not attached
 */
export function useLayer<T extends GraphClassConstructor<Layer> = GraphClassConstructor<Layer>>(
  graph: Graph | null,
  layerCtor: T,
  props: LayerPublicProps<NoInfer<T>>
): InstanceType<T> | null {
  const [registration, setRegistration] = useState<{
    graph: Graph;
    ctor: T;
    layer: InstanceType<T>;
  } | null>(null);

  const subscribe = useCallback((onChange: () => void) => graph?.on("state-change", onChange) ?? (() => {}), [graph]);
  const getSnapshot = useCallback(() => graph?.state ?? GraphState.INIT, [graph]);
  const graphState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useLayoutEffect(() => {
    if (!graph) {
      setRegistration(null);
      return undefined;
    }
    const layer = graph.addLayer(layerCtor, props);
    setRegistration({ graph, ctor: layerCtor, layer });
    // Capture this registration: cleanup must never detach a replacement layer.
    return () => graph.detachLayer(layer);
  }, [layerCtor, graph]);

  const layer = registration?.graph === graph && registration?.ctor === layerCtor ? registration.layer : null;
  const prevProps = usePrevious(props);
  useLayoutEffect(() => {
    if (layer && (!prevProps || !isEqual(prevProps, props))) {
      layer.setProps(props);
    }
  }, [layer, props, prevProps]);

  // TODO https://github.com/gravity-ui/graph/issues/362: consume a public layer
  // attachment signal after the core migration. stop(false) and direct layer
  // detachment can leave graphState ATTACHED/READY while the layer is detached.
  return graphState >= GraphState.ATTACHED ? layer : null;
}
