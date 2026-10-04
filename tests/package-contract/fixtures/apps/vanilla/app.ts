import {
  ECanDrag,
  Graph,
  type TBlock,
  type TConnection,
  type TGraphColors,
  type TGraphConstants,
  type TGraphSettingsConfig,
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
