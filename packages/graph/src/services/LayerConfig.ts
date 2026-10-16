import type { GraphClassConstructor } from "../utils/types/classes";

import type { Layer, LayerPublicProps } from "./Layer";

type TErasedLayerInput = LayerPublicProps<GraphClassConstructor<Layer>>;

// The private brand prevents structural copies, so every entry comes from layerConfig().
class CheckedLayerConfig {
  private declare readonly layerConfigBrand: void;

  constructor(
    public readonly layer: GraphClassConstructor<Layer>,
    public readonly props: Readonly<TErasedLayerInput>
  ) {}
}

/** A layer class paired with public props that were checked against its constructor. */
export type LayerConfig = CheckedLayerConfig;

/**
 * Creates a graph configuration entry for a layer.
 * Props are checked against the concrete layer constructor; graph, camera and root are provided by the graph.
 */
export function layerConfig<T extends GraphClassConstructor<Layer>>(
  layer: T,
  props: LayerPublicProps<NoInfer<T>>
): LayerConfig {
  // The pair was checked against the concrete class above; heterogeneous storage erases it only here.
  return new CheckedLayerConfig(layer, props as unknown as TErasedLayerInput);
}
