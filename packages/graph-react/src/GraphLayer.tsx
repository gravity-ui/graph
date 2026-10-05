import React, { forwardRef, useImperativeHandle, useState } from "react";

import { GraphState } from "@gravity-ui/graph";
import type { Constructor, Layer, LayerPublicProps } from "@gravity-ui/graph";

import { useGraphContext } from "./GraphContext";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { useLayer } from "./hooks/useLayer";

/** Public props follow the concrete layer, including required fields and its instance ref. */
export type GraphLayerProps<TLayer extends Constructor<Layer> = typeof Layer> = {
  layer: TLayer;
  ref?: React.Ref<InstanceType<NoInfer<TLayer>>>;
} & ({} extends LayerPublicProps<TLayer>
  ? { props?: LayerPublicProps<NoInfer<TLayer>> }
  : { props: LayerPublicProps<NoInfer<TLayer>> });

/**
 * GraphLayer component provides declarative way to add existing Layer classes to the graph
 */
export const GraphLayer = forwardRef<
  Layer | null,
  {
    layer: Constructor<Layer>;
    props?: LayerPublicProps<typeof Layer>;
  }
>(function GraphLayer({ layer: LayerClass, props = {} }, ref): React.ReactElement | null {
  const { graph } = useGraphContext();
  const [_graphState, setGraphState] = useState<GraphState>(graph?.state ?? GraphState.INIT);
  useGraphEvent(graph, "state-change", ({ state }) => {
    setGraphState(state);
  });
  const layer = useLayer(graph, LayerClass, props);
  useImperativeHandle(ref, () => layer, [layer]);
  return null;
  // forwardRef stores a single render function; the public signature preserves each class/props/ref relationship.
}) as <TLayer extends Constructor<Layer>>(props: GraphLayerProps<TLayer>) => React.ReactElement | null;
