import {
  CanvasBlock,
  GraphComponent,
  Graph,
  Layer,
  MultipleSelectionBucket,
  type TBlock,
  type TBlockProps,
  type LayerProps,
  type ConnectionState,
  type TConnection,
  type AnchorState,
  type TConnectionId,
  type TPoint,
  type TPort,
} from "@gravity-ui/graph";

// Compile in strict and non-strict consumers, against source and packed declarations.
export function coreOperations(graph: Graph, connection: ConnectionState, anchor: AnchorState) {
  const id: TConnectionId = connection.id;
  const snapshotId: TConnectionId = connection.toJSON().id;
  const endpoints: [TPoint, TPoint] | undefined = connection.$geometry.value;
  const view: GraphComponent | undefined = connection.getViewComponent();
  const anchorView: GraphComponent | undefined = anchor.getViewComponent();
  graph.api.updateBlock({ id: "gone", x: 0 });
  graph.api.updateConnection("gone", { sourceBlockId: 0 });
  graph.api.setAnchorSelection("gone", "gone", true);
  graph.cameraService.resize({ width: 100 });
  graph.dragService.startDrag({});
  const bucket = new MultipleSelectionBucket<string>("custom");
  const manager = graph.selectionService;
  manager.registerBucket(bucket);
  const port: TPort<string> = { id: 0, x: 0, y: 0, meta: "metadata" };
  graph.on("port-connection-created", ({ detail }) => {
    const blockId: string | number | undefined = detail.sourceBlockId;
    const target: string | number | undefined = detail.targetBlockId;
    void [blockId, target];
  });
  graph.on("connection-create-drop", ({ detail }) => {
    const anchorId: string | undefined = detail.sourceAnchorId;
    void anchorId;
  });
  void [id, snapshotId, endpoints, view, anchorView, port];
}

type Meta = { label: string; count: number };
class TypedBlock<T extends Meta = Meta> extends CanvasBlock<TBlock<T>, TBlockProps> {
  metadata(): T | undefined {
    return this.connectedState.asTBlock().meta;
  }
}
class TypedLayer<T extends { name: string }> extends Layer<LayerProps & { data: T }> {
  metadata(): T {
    return this.props.data;
  }
}
export function genericAuthoring(graph: Graph) {
  const block = TypedBlock.create({ id: 0 });
  const layer = graph.addLayer(TypedLayer<{ name: string; extra: number }>, { data: { name: "custom", extra: 1 } });
  const extra: number = layer.metadata().extra;
  const data: TConnection = { sourcePortId: 0, targetPortId: Symbol("endpoint") };
  void [block, extra, data];
}
