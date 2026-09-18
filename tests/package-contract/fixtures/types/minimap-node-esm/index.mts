import { Graph, Layer, type LayerPublicProps } from "@gravity-ui/graph";
import { MiniMapLayer, type MiniMapLayerProps, type MiniMapLayerContext, type TMiniMapLocation } from "@gravity-ui/graph-minimap";

const location: TMiniMapLocation = "bottomRight";
const options: LayerPublicProps<typeof MiniMapLayer> = { location, width: 200 };
const graph = new Graph({});
const minimap = graph.addLayer(MiniMapLayer, options);
const layer: Layer = minimap;
const props: MiniMapLayerProps = minimap.props;
const context: MiniMapLayerContext = minimap.context;
void [layer, props, context];
