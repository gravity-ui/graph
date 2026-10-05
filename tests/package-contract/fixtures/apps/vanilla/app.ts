import {
  CanvasBlock,
  BlockGroups,
  Component,
  type BlockGroupsProps,
  type LayerProps,
  type GraphClassConstructor,
  type ChildDescriptor,
  type ComponentDescriptor,
  type Interface,
  ECanDrag,
  Graph,
  Layer,
  type TBlock,
  type TBlockProps,
  type TConnection,
  type TGraphColors,
  type TGraphConstants,
  type TGraphSettingsConfig,
  type TGraphSettingsPatch,
} from "@gravity-ui/graph";
import "@gravity-ui/graph/styles.css";

import "../../shared/base.css";

const blocks = [
  {
    id: "source",
    is: "Block",
    x: 80,
    y: 100,
    width: 180,
    height: 100,
    name: "Source",
    anchors: [],
  },
  {
    id: "target",
    is: "Block",
    x: 500,
    y: 280,
    width: 180,
    height: 100,
    name: "Target",
    anchors: [],
  },
] satisfies TBlock[];

const connections = [
  {
    id: "source-to-target",
    sourceBlockId: "source",
    targetBlockId: "target",
  },
] satisfies TConnection[];

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) {
  throw new Error("Graph root was not found.");
}

const graph = new Graph(
  {
    blocks,
    connections,
    settings: {
      canDrag: ECanDrag.ALL,
      useBezierConnections: false,
    },
  },
  root
);

graph.start();
graph.zoomTo("center");

// Compile-only configuration checks; never called. Required-value reads must typecheck, and invalid patches must fail.
function checkResolvedConfigurationTypes() {
  // Strict consumers accept partial input and read complete values without assertions.
  const configuredGraph = new Graph(
    { settings: { dragThreshold: 0 } },
    undefined,
    { block: { border: "#123456" } },
    { camera: { SPEED: 2 } }
  );
  const resolvedColors: TGraphColors = configuredGraph.api.getGraphColors();
  const resolvedConstants: TGraphConstants = configuredGraph.api.getGraphConstants();
  const resolvedSettings: TGraphSettingsConfig = configuredGraph.rootStore.settings.asConfig;
  const border: string = resolvedColors.block.border;
  const panSpeed: number = resolvedConstants.camera.PAN_SPEED;
  const dragThreshold: number = resolvedSettings.dragThreshold;
  const canZoom: boolean = configuredGraph.rootStore.settings.getConfigFlag("canZoomCamera");
  configuredGraph.updateSettings({ dragThreshold: undefined });
  configuredGraph.api.setSetting("dragThreshold", 1);
  configuredGraph.resetSettings(["dragThreshold", "background"]);
  // @ts-expect-error resetSettings must reject unknown keys such as unknownSetting.
  configuredGraph.resetSettings(["unknownSetting"]);
  configuredGraph.resetSettings();
  // Verify color events expose complete normalized values: nested fields can be read without undefined guards.
  configuredGraph.on("colors-changed", ({ detail }) => {
    const color: string = detail.colors.anchor.background;
    void color;
  });
  const { background, ...missingBackground } = resolvedSettings;
  // @ts-expect-error resolved state requires background, even when its value is undefined
  const incompleteSettings: TGraphSettingsConfig = missingBackground;
  void [background, incompleteSettings];
  // @ts-expect-error dragThreshold requires a number; setSetting must reject a string.
  configuredGraph.api.setSetting("dragThreshold", "large");
  // @ts-expect-error SCALES requires its complete tuple; a one-element replacement must be rejected.
  configuredGraph.setConstants({ block: { SCALES: [0.1] } });
  // @ts-expect-error legacy drag settings are removed in v2
  configuredGraph.updateSettings({ canChangeBlockGeometry: "all" });
  void [border, panSpeed, dragThreshold, canZoom];
}
void checkResolvedConfigurationTypes;

// Compile-only lookup checks; never called. Unguarded reads must fail so declarations cannot hide missing entities.
function checkNullableLookups(graph: Graph) {
  const block = graph.api.getBlockById("missing");
  const state = graph.rootStore.blocksList.getBlockState("missing");
  const connection = graph.rootStore.connectionsList.getConnectionState("missing");
  const anchor = state?.getAnchorById("missing");
  // @ts-expect-error block data may be absent
  block.id;
  // @ts-expect-error a block state may be absent
  state.id;
  // @ts-expect-error a connection state may be absent
  connection.id;
  // @ts-expect-error an anchor may be absent
  anchor.id;
  // @ts-expect-error An ID lookup must reject custom Meta type arguments because the ID does not establish that shape.
  graph.rootStore.blocksList.getBlockState<TBlock<{ custom: string }>>("missing");
  const connections = graph.rootStore.connectionsList.getConnectionStates(["missing"]);
  connections.forEach((connection) => { const id = connection.id; void id; });
}
void checkNullableLookups;

type CustomBlockData = TBlock<{ description: string }>;
type CustomBlockProps = TBlockProps & { accent: string };
// Compile-only custom block: verify declared Meta and props survive CanvasBlock generics. Never registered at runtime.
class CustomBlockTypeContract extends CanvasBlock<CustomBlockData, CustomBlockProps> {
  getDescription(): string | undefined {
    return this.state.meta?.description;
  }
  getAccent(): string {
    return this.props.accent;
  }
  checkMetadataKeys() {
    // @ts-expect-error declared custom Meta does not contain arbitrary fields
    return this.connectedState.$state.value.meta?.unknownField;
  }
}
void CustomBlockTypeContract;

type ComplexMeta = {
  payload: { status: "ready" | "busy"; rows: ReadonlyArray<{ key: string; values: readonly number[] }> };
  format: (value: number) => string;
};
class GenericCustomBlock<M extends ComplexMeta = ComplexMeta> extends CanvasBlock<
  TBlock<M>, TBlockProps & { tone?: "light" | "dark" }
> {
  getRows(): ReadonlyArray<{ key: string; values: readonly number[] }> | undefined {
    return this.state.meta?.payload.rows;
  }
}
// Compile-only registrations; never called. Concrete, generic and specialized block classes must all be accepted.
function checkCustomBlockRegistration() {
  const config: TGraphSettingsPatch<TBlock<ComplexMeta>> = {
    blockComponents: { generic: GenericCustomBlock },
  };
  const graph = new Graph({ settings: { blockComponents: {
    custom: CustomBlockTypeContract,
    generic: GenericCustomBlock,
    specialized: GenericCustomBlock<ComplexMeta>,
  } } });
  graph.updateSettings(config);
  graph.updateSettings({ blockComponents: { custom: CustomBlockTypeContract } });
  // @ts-expect-error blockComponents must reject a constructor that does not produce a CanvasBlock.
  graph.updateSettings({ blockComponents: { invalid: class {} } });
}
void checkCustomBlockRegistration;

// Compile-only resource checks; never called. Unguarded optional resource reads must fail; guarded reads must compile.
function layerResourceContracts(layer: Layer) {
  // @ts-expect-error A base layer can be HTML-only.
  layer.getCanvas().width;
  // @ts-expect-error A base layer can be canvas-only.
  layer.getHTML().classList;
  // @ts-expect-error A base layer may have no drawing context.
  layer.context.ctx.clearRect(0, 0, 1, 1);
  // @ts-expect-error A base layer may have no canvas in its context.
  layer.context.graphCanvas.width;
  const canvas = layer.getCanvas();
  if (canvas) canvas.width = 100;
  const html = layer.getHTML();
  if (html) html.classList.add("custom-layer");
  if (layer.context.ctx) layer.context.ctx.clearRect(0, 0, 1, 1);
}
void layerResourceContracts;

// Type-only checks; this function is never called. Compile against source APIs and packed declarations.
// Deliberately invalid payloads/listeners must be rejected; unused expect-error directives detect
// regressions where an event name loses its payload type or inference becomes any.
function eventTypeContracts(graph: Graph, block: CanvasBlock) {
  graph.on("state-change", (event) => {
    const state: import("@gravity-ui/graph").GraphState = event.detail.state;
    void state;
    // colors belongs to colors-changed; this access must fail for the inferred state-change payload.
    // @ts-expect-error state-change exposes { state: GraphState }, so event.detail.colors is invalid.
    event.detail.colors;
  });
  // Positive counterpart: object listeners must infer the complete colors-changed payload without annotating event.
  graph.on("colors-changed", { handleEvent: (event) => {
    const colors: TGraphColors = event.detail.colors;
    void colors;
  } });
  graph.on("mousemove", (event) => { const source: Event = event.detail.sourceEvent; void source; });
  graph.emit("colors-changed", { colors: graph.graphColors });
  // @ts-expect-error colors-changed requires { colors: TGraphColors }; a state-change payload is invalid.
  graph.emit("colors-changed", { state: 0 });
  // @ts-expect-error Native mouse callbacks cannot handle graph CustomEvents.
  graph.on("click", (event: MouseEvent) => { void event; });
  // @ts-expect-error state-change must reject an object listener expecting colors-changed.
  graph.on("state-change", { handleEvent: (event: CustomEvent<{ colors: TGraphColors }>) => { void event; } });
  // @ts-expect-error off for state-change requires a listener for its CustomEvent, not a native MouseEvent.
  graph.off("state-change", (event: MouseEvent) => { void event; });
  block.listenEvents(["click", "mousedown"], { handleEvent: (event) => { const x: number = event.clientX; void x; } });
  // @ts-expect-error A keyboard listener cannot handle these mouse events.
  block.listenEvents(["click", "mousedown"], (event: KeyboardEvent) => { void event; });
  block.addEventListener("click", (event) => { const x: number = event.clientX; void x; });
  block.addEventListener("click", { handleEvent: (event) => { const x: number = event.clientX; void x; } });
  // @ts-expect-error Component click listeners receive MouseEvent; a KeyboardEvent listener is incompatible.
  block.addEventListener("click", (event: KeyboardEvent) => { void event; });
  graph.layers.on("update-size", (size) => { const dpr: number = size.dpr; void dpr; });
  // @ts-expect-error Typed emitters reject unknown events.
  graph.layers.on("unknown", () => {});
  // @ts-expect-error update-size passes LayersRootSize to its listener, not a string.
  graph.layers.on("update-size", (size: string) => { void size; });
  // @ts-expect-error update-size requires a LayersRootSize argument, not a string.
  graph.layers.emit("update-size", "invalid");
  graph.hitTest.on("update", (hitTest) => { const box = hitTest.$usableRect.value; void box; });
}
void eventTypeContracts;

// Compile-only layer; never instantiated. Check event inference and native function this through protected wrappers.
class EventContractLayer extends Layer {
  protected afterInit() {
    this.onGraphEvent("state-change", { handleEvent: (event) => { const state: number = event.detail.state; void state; } });
    this.onCanvasEvent("click", function(event) { const x: number = event.clientX; this.width = x; });
    this.onRootEvent("keydown", { handleEvent: (event) => { const key: string = event.key; void key; } });
    // @ts-expect-error keydown requires a KeyboardEvent object listener, not a MouseEvent listener.
    this.onRootEvent("keydown", { handleEvent: (event: MouseEvent) => { void event; } });
    // @ts-expect-error Canvas click requires a MouseEvent listener, not a KeyboardEvent listener.
    this.onCanvasEvent("click", (event: KeyboardEvent) => { void event; });
    // @ts-expect-error Graph state-change requires its CustomEvent object listener, not a MouseEvent listener.
    this.onGraphEvent("state-change", { handleEvent: (event: MouseEvent) => { void event; } });
    super.afterInit();
  }
}
void EventContractLayer;

class RequiredPropsComponent extends Component<{ label: string }> {
  getLabel(): string {
    return this.props.label;
  }
}
function componentConstructionContracts(graph: Graph) {
  RequiredPropsComponent.create(
    { label: "child" },
    {
      ref: (instance) => {
        const label: string = instance.getLabel();
        void label;
        // @ts-expect-error A ref must infer this concrete component, which has no missingMethod.
        instance.missingMethod();
      },
    }
  );
  // @ts-expect-error A required label cannot be omitted from create.
  RequiredPropsComponent.create();
  // @ts-expect-error An empty props object cannot replace a required label.
  RequiredPropsComponent.create({});
  const descriptor: ComponentDescriptor<typeof RequiredPropsComponent> = RequiredPropsComponent.create({
    label: "checked",
  });
  const children: ChildDescriptor[] = [descriptor];
  // @ts-expect-error Raw children cannot bypass the concrete factory validation.
  const unchecked: ChildDescriptor = { klass: RequiredPropsComponent, props: {}, options: {} };
  void children;
  void unchecked;
  const mounted = Component.mount(RequiredPropsComponent, { label: "root" });
  const label: string = mounted.getLabel();
  void label;
  // @ts-expect-error mount must require label props for this constructor.
  Component.mount(RequiredPropsComponent);
  graph.setConstants({
    selectionLayer: { SELECTABLE_ENTITY_TYPES: [CanvasBlock, CustomBlockTypeContract, GenericCustomBlock] },
  });
  const found = graph.getElementsInViewport([CustomBlockTypeContract]);
  found.forEach((block) => {
    const description: string | undefined = block.getDescription();
    void description;
  });
}
void componentConstructionContracts;

// Compile-only contracts: layer injection and group mixins retain custom props and inherited methods.
class RequiredLayer extends Layer<LayerProps & { label: string }> {
  public getLabel() {
    return this.props.label;
  }
}
class CustomGroups extends BlockGroups<BlockGroupsProps & { label: string }> {
  public getLabel() {
    return this.props.label;
  }
}
function layerAndGroupConstructionContracts(graph: Graph) {
  const layer = graph.addLayer(RequiredLayer, { label: "custom" });
  const label: string = layer.getLabel();
  // @ts-expect-error Graph injects camera/graph/root, but the custom label remains required.
  graph.addLayer(RequiredLayer, {});
  const Groups = CustomGroups.withPredefinedGroups();
  const groups = graph.addLayer(Groups, { label });
  groups.getLabel();
  groups.defineGroups([]);
  // @ts-expect-error A mixin must not erase required props from its custom base.
  graph.addLayer(Groups, {});
  const Grouped = CustomGroups.withBlockGrouping({
    groupingFn: () => ({}),
    mapToGroups: (id, { rect }) => ({ id, rect }),
  });
  graph.addLayer(Grouped, { label }).getLabel();
  // Utility types are named imports and do not require global declaration injection.
  const ctor: GraphClassConstructor<RequiredLayer> = RequiredLayer;
  const publicLayer: Interface<RequiredLayer> = layer;
  void ctor;
  void publicLayer;
}
void layerAndGroupConstructionContracts;

class NoPropsComponent extends Component { constructor() { super({}); } }
class OptionalPropsComponent extends Component<{ label: string }> {
  constructor(props = { label: "default" }) { super(props); }
}
// Constructors with zero or optional arguments must remain callable through the factories.
function optionalComponentConstructionContracts() {
  NoPropsComponent.create(); Component.mount(NoPropsComponent);
  OptionalPropsComponent.create(); Component.mount(OptionalPropsComponent);
  // @ts-expect-error Supplied optional props still need their required label field.
  OptionalPropsComponent.create({});
}
void optionalComponentConstructionContracts;
