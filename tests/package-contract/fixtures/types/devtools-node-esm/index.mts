import { Graph, Layer, type LayerPublicProps } from "@gravity-ui/graph";
import { DevToolsLayer, DEFAULT_DEVTOOLS_LAYER_PROPS, type TDevToolsLayerProps } from "@gravity-ui/graph-devtools";

const options: LayerPublicProps<typeof DevToolsLayer> = { ...DEFAULT_DEVTOOLS_LAYER_PROPS, rulerSize: 32 };
const graph = new Graph({});
const devtools = graph.addLayer(DevToolsLayer, options);
const layer: Layer = devtools;
const props: TDevToolsLayerProps = devtools.props;
devtools.setProps({ showRuler: false });
graph.detachLayer(devtools);
void [layer, props];
