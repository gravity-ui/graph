import { Graph, Layer, type CanvasBlock, type LayerPublicProps, type TPoint } from "@gravity-ui/graph";
import {
  DuplicateBlockLayer,
  type TBlocksDuplicateDetail,
  type TBlocksDuplicateStartDetail,
  type TDuplicateBlockLayerProps,
} from "@gravity-ui/graph-duplicate-block";

const graph = new Graph({});
const options: LayerPublicProps<typeof DuplicateBlockLayer> = {
  ghostBackground: "rgba(0, 0, 255, 0.3)",
  isDuplicateAllowed: (block: CanvasBlock) => block.connectedState.id !== "locked",
};
const layer = graph.addLayer(DuplicateBlockLayer, options);
const asLayer: Layer = layer;
const props: TDuplicateBlockLayerProps = layer.props;
layer.disable();
layer.enable();
const enabled: boolean = layer.isEnabled();
graph.addLayer(DuplicateBlockLayer, {});
// @ts-expect-error The preview background is a CSS color string.
graph.addLayer(DuplicateBlockLayer, { ghostBackground: 1 });
void [asLayer, props, enabled];

// Importing the package adds its events to the core event map.
graph.on("blocks-duplicate-start", (event) => {
  const detail: TBlocksDuplicateStartDetail = event.detail;
  const blocks: CanvasBlock[] = event.detail.blocks;
  void [detail, blocks];
});
graph.on("blocks-duplicate", (event) => {
  const detail: TBlocksDuplicateDetail = event.detail;
  const delta: TPoint = event.detail.delta;
  const coord: TPoint | undefined = event.detail.items[0]?.coord;
  event.preventDefault();
  void [detail, delta, coord];
});
// @ts-expect-error The v1 event names are removed.
graph.on("block-added-from-shadow", () => undefined);
