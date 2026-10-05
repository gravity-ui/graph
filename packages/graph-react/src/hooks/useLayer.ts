import { useLayoutEffect, useState } from "react";

import type { Graph, GraphClassConstructor, Layer, LayerPublicProps } from "@gravity-ui/graph";
import type { ReadonlySignal } from "@preact/signals-core";
import { signal } from "@preact/signals-core";
import isEqual from "lodash/isEqual";

import { usePrevious } from "./usePrevious";
import { useSignal } from "./useSignal";

// Core exposes attachment through context.root but has no attachment event.
// Observe context transitions on this hook's owned instance, including lifecycle
// callbacks bound before registration, and restore the method on cleanup.
function observeAttachment(layer: Layer) {
  const attached = signal(Boolean(layer.context.root));
  const setContext = layer.setContext;
  layer.setContext = function (this: Layer, ...args: Parameters<typeof setContext>) {
    try {
      return setContext.apply(this, args);
    } finally {
      attached.value = Boolean(layer.context.root);
    }
  };
  return {
    attached,
    dispose: () => {
      layer.setContext = setContext;
    },
  };
}

/**
 * Hook for managing graph layers.
 *
 * Provides a convenient way to add and manage layers in the graph.
 * Automatically handles layer initialization and props updates.
 * Returns null before graph attachment and after detachment. Call hooks
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
    attached: ReadonlySignal<boolean>;
  } | null>(null);

  useLayoutEffect(() => {
    if (!graph) {
      setRegistration(null);
      return undefined;
    }
    const layer = graph.addLayer(layerCtor, props);
    const readiness = observeAttachment(layer);
    setRegistration({ graph, ctor: layerCtor, layer, attached: readiness.attached });
    // Capture this registration: cleanup must never detach a replacement layer.
    return () => {
      try {
        graph.detachLayer(layer);
      } finally {
        readiness.dispose();
      }
    };
  }, [layerCtor, graph]);

  const layer = registration?.graph === graph && registration?.ctor === layerCtor ? registration.layer : null;
  const attached = useSignal(layer ? registration?.attached : undefined);
  const prevProps = usePrevious(props);
  useLayoutEffect(() => {
    if (layer && (!prevProps || !isEqual(prevProps, props))) {
      layer.setProps(props);
    }
  }, [layer, props, prevProps]);

  return attached ? layer : null;
}
