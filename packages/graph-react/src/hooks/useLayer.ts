import { useLayoutEffect, useState } from "react";

import type { Graph, GraphClassConstructor, Layer, LayerProps, LayerPublicProps } from "@gravity-ui/graph";
import isEqual from "lodash/isEqual";

import { usePrevious } from "./usePrevious";
import { useSignal } from "./useSignal";

type PublicUpdateProps<Props> = Props extends unknown
  ? Omit<Props, "root" | "camera" | "graph"> & {
      root?: "root" extends keyof Props ? Props["root"] : LayerProps["root"];
    }
  : never;

/** Declarative input must be accepted by both construction and subsequent updates. */
export type LayerReactiveProps<T extends GraphClassConstructor<Layer>> = LayerPublicProps<T> &
  PublicUpdateProps<NonNullable<Parameters<InstanceType<T>["setProps"]>[0]>>;

/**
 * Hook for managing graph layers.
 *
 * Provides a convenient way to add and manage layers in the graph.
 * Automatically handles layer initialization and props updates.
 * Returns null before layer attachment and after detachment. Call hooks
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
 * @returns Layer instance or null if the layer is not attached
 */
export function useLayer<T extends GraphClassConstructor<Layer> = GraphClassConstructor<Layer>>(
  graph: Graph | null,
  layerCtor: T,
  props: LayerReactiveProps<NoInfer<T>>
): InstanceType<T> | null {
  const [registration, setRegistration] = useState<{
    graph: Graph;
    ctor: T;
    layer: InstanceType<T>;
  } | null>(null);

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
  const attached = useSignal(layer?.$attached);
  const prevProps = usePrevious(props);
  useLayoutEffect(() => {
    if (layer && (!prevProps || !isEqual(prevProps, props))) {
      // Both constructor and setter input are checked above; dispatch through the concrete update API.
      Reflect.apply(layer.setProps, layer, [props]);
    }
  }, [layer, props, prevProps]);

  return attached ? layer : null;
}
