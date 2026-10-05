import { Graph, Layer, type LayerPublicProps } from "@gravity-ui/graph";
import {
  DevToolsLayer,
  DEFAULT_DEVTOOLS_LAYER_PROPS,
  type TDevToolsLayerInput,
  type TDevToolsLayerProps,
} from "@gravity-ui/graph-devtools";

const options: LayerPublicProps<typeof DevToolsLayer> = { ...DEFAULT_DEVTOOLS_LAYER_PROPS, rulerSize: 32 };
const graph = new Graph({});
const devtools = graph.addLayer(DevToolsLayer, options);
const layer: Layer = devtools;
const props: TDevToolsLayerProps = devtools.props;
devtools.setProps({ showRuler: false });
graph.detachLayer(devtools);
void [layer, props];

const partial: LayerPublicProps<typeof DevToolsLayer> = { rulerSize: 30 };
const empty = graph.addLayer(DevToolsLayer, {});
const defaultsSize: number = DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize;
const size: number = empty.props.rulerSize;
const font: string = empty.props.crosshairTextFont;
const visible: boolean = empty.props.showRuler;
empty.setProps({ rulerSize: undefined, crosshairColor: undefined });
empty.setProps();
empty.resetProps(["rulerSize"]);
empty.resetProps();
// @ts-expect-error Resolved visual props must be concrete.
const unresolved: TDevToolsLayerProps = { graph, camera: graph.cameraService };
// @ts-expect-error A visual reset must not change graph infrastructure.
empty.resetProps(["graph"]);
// @ts-expect-error Incorrect numeric input must be rejected.
graph.addLayer(DevToolsLayer, { rulerSize: "30" });
void [partial, defaultsSize, size, font, visible, unresolved];

const input: TDevToolsLayerInput = { graph, camera: graph.cameraService, rulerTextFont: undefined };
const direct = new DevToolsLayer(input);
const descriptor = DevToolsLayer.create(input, { ref: (instance) => instance.resetProps() });
class CustomDevTools extends DevToolsLayer {
  constructor(options: TDevToolsLayerInput) {
    super(options);
  }
}
const customOptions: LayerPublicProps<typeof CustomDevTools> = {};
const custom = graph.addLayer(CustomDevTools, customOptions);
const customColor: string = custom.props.crosshairColor;
void [direct, descriptor, customColor];
