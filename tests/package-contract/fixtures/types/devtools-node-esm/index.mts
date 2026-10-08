import { Graph, Layer, type GraphClassConstructor, type LayerProps, type LayerPublicProps } from "@gravity-ui/graph";
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

// Runtime Layer props remain resolved even when the constructor accepts optional input.
class NormalizedLayer extends Layer<LayerProps & { size: number }> {
  constructor(input: LayerProps & { size?: number }) {
    super({ ...input, size: input.size ?? 10 });
  }
}
const normalizedOptions: LayerPublicProps<typeof NormalizedLayer> = {};
const normalizedLayer = graph.addLayer(NormalizedLayer, normalizedOptions);
const normalizedSize: number = normalizedLayer.props.size;
const serviceLayer = graph.layers.createLayer(NormalizedLayer, { graph, camera: graph.cameraService });
const serviceSize: number = serviceLayer.props.size;
// @ts-expect-error Constructor input still rejects invalid visual values.
graph.addLayer(NormalizedLayer, { size: "10" });
const erasedOptions: LayerPublicProps<GraphClassConstructor<Layer>> = {};

class GenericLayer<Meta extends { label: string }> extends Layer<LayerProps & { meta: Meta; size: number }> {
  constructor(input: LayerProps & { meta: Meta; size?: number }) {
    super({ ...input, size: input.size ?? 10 });
  }
}
const genericLayer = graph.addLayer(GenericLayer<{ label: string; rows: readonly number[] }>, {
  meta: { label: "table", rows: [1, 2] },
});
const rows: readonly number[] = genericLayer.props.meta.rows;
// @ts-expect-error Required generic constructor metadata remains required.
graph.addLayer(GenericLayer, {});
// @ts-expect-error Metadata keeps its consumer-specified structure.
graph.addLayer(GenericLayer<{ label: string; rows: readonly number[] }>, { meta: { label: "table" } });

class ModeLayer extends Layer<LayerProps & { mode: "single" | "multi"; size: number }> {
  constructor(
    input: LayerProps & ({ mode: "single"; size?: number } | { mode: "multi"; ticks: number; size?: number })
  ) {
    super({ ...input, size: input.size ?? 10 });
  }
}
graph.addLayer(ModeLayer, { mode: "single" });
graph.addLayer(ModeLayer, { mode: "multi", ticks: 5 });
// @ts-expect-error Constructor union must retain mode-dependent required fields.
graph.addLayer(ModeLayer, { mode: "multi" });
void [normalizedSize, serviceSize, erasedOptions, rows];

class OptionalRootLayer extends Layer<LayerProps & { root?: HTMLDivElement }> {
  constructor(input: Partial<LayerProps & { root?: HTMLDivElement }> = {}) {
    super({ ...input, graph: input.graph ?? graph, camera: input.camera ?? graph.cameraService });
  }
}
graph.addLayer(OptionalRootLayer, { root: document.createElement("div") });
// @ts-expect-error Constructor root narrowing is preserved even with optional infrastructure input.
graph.addLayer(OptionalRootLayer, { root: document.createElement("span") });
OptionalRootLayer.create();
