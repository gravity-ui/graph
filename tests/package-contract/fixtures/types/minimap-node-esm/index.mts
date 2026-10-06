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

const defaults = graph.addLayer(MiniMapLayer, {});
const partialLocation: TMiniMapLocation = { right: "20px", bottom: "30px" };
const custom = graph.addLayer(MiniMapLayer, { location: partialLocation });
const beforeAttachment: HTMLElement | undefined = defaults.context.root;
const canvas: HTMLCanvasElement = custom.context.canvas;
const ctx: CanvasRenderingContext2D = custom.context.ctx;
void [beforeAttachment, canvas, ctx];

// @ts-expect-error locations are named corners or CSS offsets
graph.addLayer(MiniMapLayer, { location: "center" });
// @ts-expect-error custom offsets use CSS strings
graph.addLayer(MiniMapLayer, { location: { top: 20 } });
