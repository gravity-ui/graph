import { Graph } from "../graph";

import { Layer, LayerProps } from "./Layer";
import { layerConfig } from "./LayerConfig";

type TLabelLayerProps = LayerProps & { label: string };

class LabelLayer extends Layer<TLabelLayerProps> {}

describe("layerConfig", () => {
  it("mounts a configured layer with its checked props and graph services", () => {
    const graph = new Graph({ layers: [layerConfig(LabelLayer, { label: "ok" })] });
    const layer = graph.layers.getLayers().find((item): item is LabelLayer => item instanceof LabelLayer);

    expect(layer?.props.label).toBe("ok");
    expect(layer?.props.graph).toBe(graph);
    expect(layer?.props.camera).toBe(graph.cameraService);
    graph.unmount();
  });
});
