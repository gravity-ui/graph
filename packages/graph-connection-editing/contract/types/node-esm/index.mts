import {
  Graph,
  Layer,
  layerConfig,
  type LayerPublicProps,
  type PortState,
  type TPoint,
  type UnwrapGraphEventsDetail,
} from "@gravity-ui/graph";
import {
  ConnectionEditingLayer,
  type IPortConnectionMeta,
  type TConnectionCreatedDetail,
  type TConnectionEditingLayerProps,
} from "@gravity-ui/graph-connection-editing";

const options: LayerPublicProps<typeof ConnectionEditingLayer> = {
  searchRadius: 20,
  isConnectionAllowed: ({ sourcePort, targetPort }) => sourcePort !== targetPort,
};
const graph = new Graph({});
const layer = graph.addLayer(ConnectionEditingLayer, options);
const base: Layer = layer;
const props: TConnectionEditingLayerProps = layer.props;
layer.disable();
layer.enable();
void [base, props];

const meta: IPortConnectionMeta = { snappable: true, snapCondition: ({ distance }) => distance < 10 };
const metaKey: symbol = ConnectionEditingLayer.PortMetaKey;
void [meta, metaKey];

// Importing the package types the connection creation events on the core graph.
graph.on("connection-created", (event) => {
  const detail: TConnectionCreatedDetail = event.detail;
  const target: PortState = detail.targetPort;
  // Block IDs are optional: custom component ports have no block.
  const blockId: string | number | undefined = detail.sourceBlockId;
  const targetBlockId: string | number | undefined = detail.targetBlockId;
  void [target, blockId, targetBlockId];
});
const dropPoint: UnwrapGraphEventsDetail<"connection-create-drop">["point"] = { x: 1, y: 2 } satisfies TPoint;
void dropPoint;
graph.on("connection-create-drop", ({ detail }) => {
  const anchorId: string | undefined = detail.sourceAnchorId;
  void anchorId;
});
graph.on("connection-create-cancel", (event) => {
  const source: PortState | undefined = event.detail.sourcePort;
  void source;
});

const configured = new Graph({ layers: [layerConfig(ConnectionEditingLayer, { enabled: false })] });
void configured;
// @ts-expect-error configured props keep their types
layerConfig(ConnectionEditingLayer, { searchRadius: "20" });
// @ts-expect-error the canCreateNewConnections setting is removed from core
new Graph({ settings: { canCreateNewConnections: true } });
