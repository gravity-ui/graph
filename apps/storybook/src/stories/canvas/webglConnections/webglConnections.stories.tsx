import React, { useEffect, useRef, useState } from "react";

import { BlockConnection, ECanDrag, MultipointConnection } from "@gravity-ui/graph";
import type { Graph, TBlock, TGraphColorsPatch, TMultipointConnection } from "@gravity-ui/graph";
import { GraphBlock, useGraph } from "@gravity-ui/graph-react";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { BlockStory } from "../../main/Block";

import {
  ConnectionExample,
  ConnectionPreview,
  GeneratedConnections,
  rendererControl,
  shaderControls,
  shaderDefaults,
  useShaderControls,
} from "./ConnectionScene";
import type { ConnectionArgs, ShaderArgs } from "./ConnectionScene";
import { EtlBlockView } from "./EtlBlockView";
import { etlCode, perConnectionCode, runningDashCode } from "./codeSamples";
import { ETL_BLOCK_IS, createEtlConnection, etlBlocks, etlFlows, isEtlBlock } from "./etl";
import type { TEtlEffect } from "./etl";
import { EtlBlock, etlBlockRules } from "./etlBlock";
import { dataStyled, runningDash } from "./lines";

const meta: Meta<ConnectionArgs> = {
  id: "canvas-webglconnections",
  title: "Scene/Examples/Connections",
  args: { renderer: "webgl" },
  argTypes: { renderer: rendererControl },
  parameters: { layout: "fullscreen" },
};

export default meta;

const densities = { example: "example", small: 50, medium: 400, large: 1000 } as const;
type DemoArgs = ConnectionArgs & { size: keyof typeof densities };
const sizeControl = {
  name: "Graph size",
  options: Object.keys(densities),
  control: {
    type: "select",
    labels: {
      example: "5 blocks, 4 connections",
      small: "30 layers · 50 connections per layer",
      medium: "30 layers · 400 connections per layer",
      large: "30 layers · 1,000 connections per layer",
    },
  },
} satisfies NonNullable<Meta<DemoArgs>["argTypes"]>["size"];

export const RunningDash: StoryObj<DemoArgs> = {
  args: { size: "example" },
  argTypes: { size: sizeControl },
  render: ({ renderer, size }) => (
    <GeneratedConnections
      renderer={renderer}
      connection={runningDash}
      variant="dash"
      code={runningDashCode}
      instruction="Switch renderers to compare the base stroke with the running WebGL dash. Select a connection to see its interaction style."
      layersCount={30}
      connectionsPerLayer={densities[size]}
    />
  ),
};

export const PerConnectionStyle: StoryObj<DemoArgs> = {
  name: "Style from connection data",
  args: { size: "example" },
  argTypes: { size: sizeControl },
  render: ({ renderer, size }) => (
    <GeneratedConnections
      renderer={renderer}
      connection={dataStyled}
      variant="style"
      code={perConnectionCode}
      instruction="Each connection gets its color and width from its ID. Hover or select one to see the same data-driven style on both renderers."
      layersCount={30}
      connectionsPerLayer={densities[size]}
    />
  ),
};

const routePoints = [
  { x: 160, y: 100 },
  { x: 270, y: 100 },
  { x: 270, y: 20 },
  { x: 490, y: 20 },
  { x: 490, y: 240 },
  { x: 650, y: 240 },
];

const route: TMultipointConnection = {
  id: "route",
  sourceBlockId: "source",
  targetBlockId: "target",
  points: routePoints,
  styles: { background: "#285ea8" },
};

const routeConfig = {
  blocks: [
    { id: "source", is: "Block", name: "Extract", x: 0, y: 50, width: 160, height: 100 },
    { id: "target", is: "Block", name: "Load", x: 650, y: 190, width: 160, height: 100 },
  ],
  connections: [route],
};

const routeCode = `import { MultipointConnection } from "@gravity-ui/graph";
import type { Graph, TMultipointConnection } from "@gravity-ui/graph";

function addRoute(graph: Graph) {
  graph.updateSettings({ renderer: "webgl", connection: MultipointConnection });
  const edge: TMultipointConnection = {
    sourceBlockId: "source",
    targetBlockId: "target",
    points: [
${routePoints.map(({ x, y }) => `      { x: ${x}, y: ${y} },`).join("\n")}
    ],
  };
  graph.api.addConnection(edge);
}`;

function renderRouteBlock(graph: Graph, block: TBlock) {
  return (
    <GraphBlock graph={graph} block={block}>
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>{block.name}</div>
    </GraphBlock>
  );
}

export const MultipointRoute: StoryObj<ConnectionArgs> = {
  name: "Multipoint route",
  render: ({ renderer }) => (
    <ConnectionExample
      renderer={renderer}
      connection={MultipointConnection}
      config={routeConfig}
      renderBlock={renderRouteBlock}
      code={routeCode}
      instruction="Click any segment of the route from Extract to Load to select the connection."
    />
  ),
};

const etlViewConfiguration: { colors: TGraphColorsPatch } = {
  colors: { block: { background: "#ffffff", border: "#d9dce1", text: "#1f2329" } },
};

type EtlArgs = ConnectionArgs & ShaderArgs & { effect: TEtlEffect };

function renderEtlBlock(graph: Graph, block: TBlock) {
  return isEtlBlock(block) ? <EtlBlockView graph={graph} block={block} /> : <BlockStory graph={graph} block={block} />;
}

function EtlScene(args: EtlArgs) {
  const { effect, renderer } = args;
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({ viewConfiguration: etlViewConfiguration });
  const activeEffect = useRef(effect);
  const [connection] = useState(() => createEtlConnection(() => activeEffect.current));

  useShaderControls(args);
  useEffect(() => {
    setSettings({ renderer });
  }, [renderer, setSettings]);

  useEffect(() => {
    setSettings({
      connection,
      blockComponents: { [ETL_BLOCK_IS]: EtlBlock },
      canDrag: ECanDrag.ALL,
      canDragCamera: true,
      canZoomCamera: true,
      showConnectionLabels: false,
      useBezierConnections: true,
      showConnectionArrows: true,
    });
    const remove = graph.scene.styles.add(etlBlockRules);
    setEntities({ blocks: etlBlocks, connections: etlFlows });
    start();
    zoomTo("center", { padding: 100 });
    return remove;
  }, [graph, connection, setSettings, setEntities, start, zoomTo]);

  useEffect(() => {
    if (activeEffect.current === effect) return;
    activeEffect.current = effect;
    for (const state of graph.rootStore.connectionsList.$connections.value) {
      const view = state.getViewComponent();
      if (view instanceof BlockConnection) view.invalidateLine();
    }
  }, [graph, effect]);

  return (
    <ConnectionPreview
      graph={graph}
      code={etlCode}
      renderBlock={renderEtlBlock}
      instruction="Zoom in to run, pause or retry a stage. Change the effect of running flows in Controls; failed flows stay red and idle flows stay gray."
    />
  );
}

export const EtlPipeline: StoryObj<EtlArgs> = {
  name: "ETL pipeline",
  args: { effect: "comets", ...shaderDefaults },
  argTypes: {
    effect: {
      name: "Running flow effect",
      options: ["comets", "dash", "pulse", "particles", "gradient", "glow", "plain"],
      control: "select",
    },
    ...shaderControls,
  },
  render: (args) => <EtlScene {...args} />,
};
