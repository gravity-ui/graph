import {
  CanvasBlock,
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
  // @ts-expect-error reset keys must name existing settings
  configuredGraph.resetSettings(["unknownSetting"]);
  configuredGraph.resetSettings();
  configuredGraph.on("colors-changed", ({ detail }) => {
    const color: string = detail.colors.anchor.background;
    void color;
  });
  const { background, ...missingBackground } = resolvedSettings;
  // @ts-expect-error resolved state requires background, even when its value is undefined
  const incompleteSettings: TGraphSettingsConfig = missingBackground;
  void [background, incompleteSettings];
  // @ts-expect-error settings values must match their key
  configuredGraph.api.setSetting("dragThreshold", "large");
  // @ts-expect-error tuples must be complete replacements
  configuredGraph.setConstants({ block: { SCALES: [0.1] } });
  // @ts-expect-error legacy drag settings are removed in v2
  configuredGraph.updateSettings({ canChangeBlockGeometry: "all" });
  void [border, panSpeed, dragThreshold, canZoom];
}
void checkResolvedConfigurationTypes;

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
  // @ts-expect-error lookup cannot promise an arbitrary subtype
  graph.rootStore.blocksList.getBlockState<TBlock<{ custom: string }>>("missing");
  const connections = graph.rootStore.connectionsList.getConnectionStates(["missing"]);
  connections.forEach((connection) => { const id = connection.id; void id; });
}
void checkNullableLookups;

type CustomBlockData = TBlock<{ description: string }>;
type CustomBlockProps = TBlockProps & { accent: string };
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
  // @ts-expect-error registrations must construct canvas blocks
  graph.updateSettings({ blockComponents: { invalid: class {} } });
}
void checkCustomBlockRegistration;

// This consumer contract is compiled against both source APIs and packed declarations.
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
