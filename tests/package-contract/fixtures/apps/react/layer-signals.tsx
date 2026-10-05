import React from "react";
import { Graph, Layer, type LayerProps, type TBlock } from "@gravity-ui/graph";
import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import {
  GraphBlock,
  GraphLayer,
  GraphPortal,
  GraphPortalLayer,
  useBlockAnchorPosition,
  useBlockState,
  useSyncBlockState,
  useBlockViewState,
  useComputedSignal,
  useLayer,
  useSignal,
} from "@gravity-ui/graph-react";

class MetadataLayer<Meta extends { label: string }> extends Layer<LayerProps & { metadata: Meta }> {
  constructor(props: LayerProps & { metadata: Meta }) {
    super(props);
  }
  public getMetadata(): Meta {
    return this.props.metadata;
  }
}

type Meta = { label: string; count: number };
const CustomLayer = MetadataLayer<Meta>;

// Never mounted. The fixture runs with strict/non-strict source and installed declarations.
export function LayerAndSignalContracts({ graph }: { graph: Graph }) {
  const layer = useLayer(graph, CustomLayer, { metadata: { label: "custom", count: 1 } });
  const count: number | undefined = layer?.getMetadata().count;
  const attached: boolean | undefined = useSignal(layer?.$attached);
  void attached;
  if (layer) {
    // @ts-expect-error attachment state is readonly to consumers
    layer.$attached.value = true;
  }
  const requiredRef = React.createRef<MetadataLayer<Meta>>();
  const valid = (
    <GraphLayer layer={CustomLayer} props={{ metadata: { label: "custom", count: 1 } }} ref={requiredRef} />
  );
  const callback = (
    <GraphLayer
      layer={CustomLayer}
      props={{ metadata: { label: "custom", count: 1 } }}
      ref={(instance) => {
        if (instance) {
          const metadata: Meta = instance.getMetadata();
          void metadata;
          // @ts-expect-error concrete custom refs must reject nonexistent methods
          instance.missingMethod();
        }
      }}
    />
  );
  // @ts-expect-error required generic metadata cannot be omitted
  const missing = <GraphLayer layer={CustomLayer} />;
  // @ts-expect-error metadata shape is fixed by the specialized constructor
  const wrong = <GraphLayer layer={CustomLayer} props={{ metadata: { label: "custom" } }} />;
  // @ts-expect-error hook metadata shape is fixed by the specialized constructor
  useLayer(graph, CustomLayer, { metadata: { label: "custom" } });
  const incompatibleRef = React.createRef<MetadataLayer<{ label: string; count: string }>>();
  const wrongRef = (
    // @ts-expect-error refs cannot change the type supplied by the layer class
    <GraphLayer layer={CustomLayer} props={{ metadata: { label: "custom", count: 1 } }} ref={incompatibleRef} />
  );
  const portalRef = React.createRef<GraphPortalLayer>();
  const portal = (
    <GraphPortal ref={portalRef}>{(instance) => <span>{instance.getPortalTarget()?.id}</span>}</GraphPortal>
  );
  const block: TBlock<Meta> = {
    id: "meta",
    is: "Block",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    name: "Meta",
    meta: { label: "custom", count: 1 },
    anchors: [],
  };
  const state = useBlockState(graph, block);
  const sync = useSyncBlockState(graph, block.id);
  const view = useBlockViewState(graph, block);
  const countFromData: number | undefined = block.meta?.count;
  void countFromData;
  // @ts-expect-error lookup cannot promise Meta from an ID
  useBlockState<Meta>(graph, block.id);
  // @ts-expect-error synchronous lookup cannot promise Meta from an ID
  useSyncBlockState<Meta>(graph, block.id);
  // @ts-expect-error view lookup cannot promise Meta from an ID
  useBlockViewState<Meta>(graph, block.id);
  // @ts-expect-error v1 block-subtype generics must not silently become metadata schemas
  useBlockState<TBlock<Meta>>(graph, block.id);
  // @ts-expect-error typed input data does not establish the stored entity's schema
  const inferredCount: number | undefined = state?.$state.value.meta?.count;
  void inferredCount;
  // @ts-expect-error lookup does not promise custom entity fields
  sync?.$state.value.customField;
  // @ts-expect-error lookup does not promise custom view methods
  view?.customMethod();
  const domRef = React.createRef<HTMLDivElement>();
  const blockElement = (
    <GraphBlock graph={graph} block={block} ref={domRef}>
      <span>{block.meta?.count}</span>
    </GraphBlock>
  );
  useBlockAnchorPosition(undefined, domRef);
  const source = signal(1);
  const readonly = computed(() => source.value * 2);
  const value: number = useSignal(readonly);
  const optional: number | undefined = useSignal(undefined as ReadonlySignal<number> | undefined);
  const derived: number = useComputedSignal(() => readonly.value + 1, [readonly]);
  void count;
  void value;
  void optional;
  void derived;
  void valid;
  void callback;
  void missing;
  void wrong;
  void wrongRef;
  void portal;
  void blockElement;
  return null;
}
