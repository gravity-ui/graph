import React, { forwardRef, useImperativeHandle } from "react";

import type { GraphClassConstructor, Layer, LayerPublicProps } from "@gravity-ui/graph";

import { useGraphContext } from "./GraphContext";
import { LayerReactiveProps, useLayer } from "./hooks/useLayer";

/** Public props follow the concrete layer, including required fields and its instance ref. */
export type GraphLayerProps<TLayer extends GraphClassConstructor<Layer> = typeof Layer> = {
  layer: TLayer;
  ref?: React.Ref<InstanceType<NoInfer<TLayer>>>;
} & ({} extends LayerReactiveProps<TLayer>
  ? { props?: LayerReactiveProps<NoInfer<TLayer>> }
  : { props: LayerReactiveProps<NoInfer<TLayer>> });

/**
 * GraphLayer component provides declarative way to add existing Layer classes to the graph
 */
export const GraphLayer = forwardRef<
  Layer | null,
  {
    layer: GraphClassConstructor<Layer>;
    props?: LayerPublicProps<typeof Layer>;
  }
>(function GraphLayer({ layer: LayerClass, props = {} }, ref): React.ReactElement | null {
  const { graph } = useGraphContext();
  const layer = useLayer(graph, LayerClass, props);
  useImperativeHandle<Layer | null, Layer | null>(ref, () => layer, [layer]);
  return null;
  // forwardRef stores a single render function; the public signature preserves each class/props/ref relationship.
}) as <TLayer extends GraphClassConstructor<Layer>>(props: GraphLayerProps<TLayer>) => React.ReactElement | null;
