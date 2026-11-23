import React, { useEffect, useRef, useState } from "react";

import {
  BlockConnection,
  ECanDrag,
  MultipointConnection,
  dashFlow,
  defineTag,
  getTriangleArrowPoints,
  hoveredTag,
  multipointGeometry,
  pathGradient,
  selectedTag,
} from "@gravity-ui/graph";
import type {
  Graph,
  TBlock,
  TConnectionGeometryInput,
  TGraphColorsPatch,
  TMultipointConnection,
  TSceneEffectUse,
} from "@gravity-ui/graph";
import { GraphBlock, useGraph } from "@gravity-ui/graph-react";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { BlockStory } from "../../main/Block";

import { ConnectionGallery, connectionCode } from "./ConnectionGallery";
import type { GalleryArgs } from "./ConnectionGallery";
import { ConnectionPreview, GeneratedConnections, rendererControl } from "./ConnectionScene";
import type { ConnectionArgs } from "./ConnectionScene";
import { EtlBlockView } from "./EtlBlockView";
import { etlCode, perConnectionCode, runningDashCode } from "./codeSamples";
import { ETL_BLOCK_IS, createEtlConnection, etlBlocks, etlFlows, isEtlBlock } from "./etl";
import type { TEtlEffect } from "./etl";
import { EtlBlock, etlBlockRules } from "./etlBlock";
import { dataStyled, runningDash } from "./lines";
import { createSvgPath, sampleSvgPath } from "./svgPath";

const meta: Meta<ConnectionArgs> = {
  id: "canvas-webglconnections",
  title: "Scene/Examples/Connections",
  args: { renderer: "webgl" },
  argTypes: { renderer: rendererControl },
  parameters: { layout: "fullscreen" },
};

export default meta;

const arrowPositionControl = {
  name: "Arrow position",
  description: "Percent of the route length from the source",
  control: { type: "range", min: 5, max: 100, step: 1 },
} as const;

export const RenderingShowcase: StoryObj<GalleryArgs> = {
  name: "Rendering showcase",
  args: {
    stroke: "mixed",
    lineWidth: 3,
    arrowPosition: 100,
    arrowLength: 16,
    arrowWidth: 20,
    showArrows: true,
    showLabels: true,
    labelPlacement: "route",
    labelPosition: 65,
    secondaryLabelPosition: 25,
  },
  argTypes: {
    stroke: {
      name: "Stroke",
      options: ["mixed", "solid", "dashed", "flow", "gradient"],
      control: {
        type: "select",
        labels: {
          mixed: "Per connection",
          solid: "Solid",
          dashed: "Static dash",
          flow: "Dash flow",
          gradient: "Path gradient",
        },
      },
    },
    lineWidth: { name: "Line width", description: "World units", control: { type: "range", min: 1, max: 16, step: 1 } },
    arrowPosition: { ...arrowPositionControl, if: { arg: "showArrows" } },
    arrowLength: {
      name: "Arrow length",
      description: "World units",
      control: { type: "range", min: 8, max: 40, step: 1 },
    },
    arrowWidth: {
      name: "Arrow base width",
      description: "World units",
      control: { type: "range", min: 8, max: 48, step: 1 },
    },
    showArrows: { name: "Show arrows", control: "boolean" },
    showLabels: { name: "Show labels", control: "boolean" },
    labelPlacement: {
      name: "Label placement",
      options: ["route", "target"],
      control: { type: "inline-radio", labels: { route: "On the route", target: "Near the target" } },
      if: { arg: "showLabels" },
    },
    labelPosition: {
      name: "Label position",
      description: "Percent of the route length, with room for the label at each end",
      control: { type: "range", min: 0, max: 100, step: 1 },
      if: { arg: "labelPlacement", eq: "route" },
    },
    secondaryLabelPosition: {
      name: "Second label position",
      description: "Percent of the route length. The second label is hidden if it would overlap the first.",
      control: { type: "range", min: 0, max: 100, step: 1 },
      if: { arg: "labelPlacement", eq: "route" },
    },
  },
  parameters: {
    docs: {
      source: {
        language: "ts",
        type: "dynamic",
        transform: (_source: string, { args }: { args: GalleryArgs }) => connectionCode(args),
      },
    },
  },
  render: (args, { viewMode }) => <ConnectionGallery {...args} embedded={viewMode === "docs"} />,
};

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

type RoutePreset = "plain" | "dashed" | "flow" | "gradient";
type GradientArgs = { gradientSpeed: number };
type RouteArgs = ConnectionArgs &
  GradientArgs & {
    preset: RoutePreset;
    gradientFrom: string;
    gradientTo: string;
    lineWidth: number;
    arrowPosition: number;
  };

const gradientSpeedControl = {
  name: "Gradient speed",
  description: "Cycles per second",
  control: { type: "range", min: -2, max: 2, step: 0.1 },
} as const;
const defaultGradientSpeed = 0.6;

const routePattern = [18, 10];
const flowSpeed = 40;
const plainColor = "#285ea8";
const dashColor = "#087e67";
const routeMember = { connection: ["route"] };
const routeFlow = dashFlow.use({ pattern: routePattern, speed: flowSpeed });
const routeStyleTag = defineTag("route-style");

function geometryAt(input: TConnectionGeometryInput, position: number) {
  const geometry = multipointGeometry(input);
  if (!geometry || position === 100) return geometry;
  const path = createSvgPath(geometry.segments);
  const length = path.getTotalLength();
  if (length === 0) return geometry;
  const { point: tip, dx, dy } = sampleSvgPath(path, (length * position) / 100, length);
  const tail = { x: tip.x - dx, y: tip.y - dy };
  const [head, left, right] = getTriangleArrowPoints(tail, tip, 16, 20);
  return {
    ...geometry,
    arrow: {
      points: new Float32Array([head.x, head.y, left.x, left.y, right.x, right.y]),
      closed: true,
    },
  };
}

const route: TMultipointConnection = {
  id: "route",
  sourceBlockId: "source",
  targetBlockId: "target",
  points: routePoints,
  styles: { background: plainColor },
};

const routeConfig = {
  blocks: [
    { id: "source", is: "Block", name: "Extract", x: 0, y: 50, width: 160, height: 100 },
    { id: "target", is: "Block", name: "Load", x: 650, y: 190, width: 160, height: 100 },
  ],
  connections: [route],
};

function routePaint(preset: RoutePreset) {
  return {
    dashed: preset === "dashed",
    styles: {
      background: preset === "dashed" || preset === "flow" ? dashColor : plainColor,
      dashes: preset === "dashed" ? routePattern : undefined,
    },
  };
}

function routeCode({ renderer, preset, gradientSpeed, gradientFrom, gradientTo, lineWidth, arrowPosition }: RouteArgs) {
  const { dashed, styles } = routePaint(preset);
  const paint = dashed
    ? `dashed: true,\n    styles: { background: "${styles.background}", dashes: [${styles.dashes?.join(", ")}] },`
    : `styles: { background: "${styles.background}" },`;
  const hasEffect = preset === "flow" || preset === "gradient";
  const effectName = preset === "flow" ? "dashFlow" : "pathGradient";
  const effectImports = hasEffect ? `, ${effectName}` : "";
  const effectCall =
    preset === "flow"
      ? `dashFlow.use({ pattern: [${routePattern.join(", ")}], speed: ${flowSpeed} })`
      : `pathGradient.use({ from: ${JSON.stringify(gradientFrom)}, to: ${JSON.stringify(gradientTo)}, speed: ${gradientSpeed} })`;
  return `import {
  MultipointConnection, SEGMENT_FLOATS, defineTag, getTriangleArrowPoints,
  hoveredTag, multipointGeometry, selectedTag${effectImports}
} from "@gravity-ui/graph";
import type { Graph, TConnectionGeometryInput, TMultipointConnection } from "@gravity-ui/graph";

function geometryAt(input: TConnectionGeometryInput, position: number) {
  const geometry = multipointGeometry(input);
  if (!geometry || position === 100) return geometry;
  const { segments } = geometry;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = "M " + segments[0] + " " + segments[1];
  for (let i = 0; i < segments.length; i += SEGMENT_FLOATS) {
    d += " C " + segments.subarray(i + 2, i + SEGMENT_FLOATS).join(" ");
  }
  path.setAttribute("d", d);
  const length = path.getTotalLength();
  if (length === 0) return geometry;
  const distance = length * position / 100;
  const tip = path.getPointAtLength(distance);
  const before = path.getPointAtLength(Math.max(0, distance - 0.5));
  const after = path.getPointAtLength(Math.min(length, distance + 0.5));
  const tail = { x: tip.x + before.x - after.x, y: tip.y + before.y - after.y };
  const [head, left, right] = getTriangleArrowPoints(tail, tip, 16, 20);
  return {
    ...geometry,
    arrow: {
      points: new Float32Array([head.x, head.y, left.x, left.y, right.x, right.y]),
      closed: true,
    },
  };
}

class RouteConnection extends MultipointConnection {
  public static override geometry = (input: TConnectionGeometryInput) => geometryAt(input, ${arrowPosition});
}

function addRoute(graph: Graph) {
  graph.updateSettings({ renderer: "${renderer}", connection: RouteConnection });
  const edge: TMultipointConnection = {
    id: "route",
    sourceBlockId: "source",
    targetBlockId: "target",
    points: [
${routePoints.map(({ x, y }) => `      { x: ${x}, y: ${y} },`).join("\n")}
    ],
    ${paint}
  };
  graph.api.addConnection(edge);

  const tag = defineTag("route-style");${hasEffect ? "\n  const effect = " + effectCall + ";" : ""}
  const removeRule = graph.scene.styles.add([{
    target: RouteConnection,
    tags: [tag],
    style: (values) => {
      const width = ${lineWidth} + (values.get(hoveredTag) || values.get(selectedTag) ? 2 : 0);
      return { parts: { line: { width${hasEffect ? ", effect" : ""} } } };
    },
  }]);
  const members = { connection: ["route"] };
  graph.scene.tags.add(tag, members);
  return () => {
    graph.scene.tags.delete(tag, members);
    removeRule();
  };
}`;
}

function renderRouteBlock(graph: Graph, block: TBlock) {
  return (
    <GraphBlock graph={graph} block={block}>
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>{block.name}</div>
    </GraphBlock>
  );
}

const routeInstructions: Record<RoutePreset, string> = {
  plain: "Follow the solid route from Extract to Load.",
  dashed: "The green dashes follow every bend and stay still on both renderers.",
  flow: "Dashes move from Extract to Load in WebGL. Canvas shows the solid green base stroke.",
  gradient: "Set Gradient speed in Controls to move or pause the WebGL gradient. Canvas shows the solid base stroke.",
};

function MultipointScene(args: RouteArgs) {
  const { renderer, preset, gradientSpeed, gradientFrom, gradientTo, lineWidth, arrowPosition } = args;
  const position = useRef(arrowPosition);
  const [connection] = useState(
    () =>
      class RouteConnection extends MultipointConnection {
        public static override geometry = (input: TConnectionGeometryInput) => geometryAt(input, position.current);
      }
  );
  const { graph, setEntities, start, zoomTo } = useGraph({
    settings: { renderer, connection, showConnectionLabels: false },
  });

  useEffect(() => {
    setEntities(routeConfig);
    graph.scene.tags.add(routeStyleTag, routeMember);
    start();
    zoomTo("center", { padding: 100 });
    return () => graph.scene.tags.delete(routeStyleTag, routeMember);
  }, [graph, setEntities, start, zoomTo]);

  useEffect(() => {
    let effect: TSceneEffectUse<"path"> | undefined;
    if (preset === "flow") effect = routeFlow;
    if (preset === "gradient") effect = pathGradient.use({ from: gradientFrom, to: gradientTo, speed: gradientSpeed });
    return graph.scene.styles.add([
      {
        target: connection,
        tags: [routeStyleTag],
        style: (values) => {
          const width = lineWidth + (values.get(hoveredTag) || values.get(selectedTag) ? 2 : 0);
          return { parts: { line: { width, effect } } };
        },
      },
    ]);
  }, [graph, connection, preset, gradientFrom, gradientTo, gradientSpeed, lineWidth]);

  useEffect(() => {
    graph.api.updateConnection("route", routePaint(preset));
  }, [graph, preset]);

  useEffect(() => {
    position.current = arrowPosition;
    graph.connections.getConnectionState("route")?.getViewComponent()?.updateGeometry();
  }, [graph, arrowPosition]);

  return (
    <ConnectionPreview
      graph={graph}
      renderBlock={renderRouteBlock}
      code={routeCode(args)}
      instruction={`${routeInstructions[preset]} Click any segment to select the connection.`}
    />
  );
}

export const MultipointRoute: StoryObj<RouteArgs> = {
  name: "Multipoint route",
  args: {
    preset: "plain",
    gradientSpeed: defaultGradientSpeed,
    gradientFrom: "#2f7cf6",
    gradientTo: "#f28e2b",
    lineWidth: 2,
    arrowPosition: 100,
  },
  argTypes: {
    preset: {
      name: "Route style",
      options: ["plain", "dashed", "flow", "gradient"],
      control: {
        type: "inline-radio",
        labels: { plain: "Solid", dashed: "Static dash", flow: "Dash flow", gradient: "Gradient" },
      },
    },
    lineWidth: { name: "Line width", description: "World units", control: { type: "range", min: 1, max: 16, step: 1 } },
    arrowPosition: arrowPositionControl,
    gradientFrom: { name: "Gradient start color", control: "color", if: { arg: "preset", eq: "gradient" } },
    gradientTo: { name: "Gradient end color", control: "color", if: { arg: "preset", eq: "gradient" } },
    gradientSpeed: { ...gradientSpeedControl, if: { arg: "preset", eq: "gradient" } },
  },
  render: (args) => <MultipointScene {...args} />,
};

const etlViewConfiguration: { colors: TGraphColorsPatch } = {
  colors: { block: { background: "#ffffff", border: "#d9dce1", text: "#1f2329" } },
};

type EtlArgs = ConnectionArgs & GradientArgs & { effect: TEtlEffect };

function renderEtlBlock(graph: Graph, block: TBlock) {
  return isEtlBlock(block) ? <EtlBlockView graph={graph} block={block} /> : <BlockStory graph={graph} block={block} />;
}

function EtlScene(args: EtlArgs) {
  const { effect, renderer, gradientSpeed } = args;
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({ viewConfiguration: etlViewConfiguration });
  const style = useRef({ effect, gradientSpeed });
  const [connection] = useState(() =>
    createEtlConnection(
      () => style.current.effect,
      undefined,
      () => style.current.gradientSpeed
    )
  );

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
    const previous = style.current;
    style.current = { effect, gradientSpeed };
    if (previous.effect === effect && (effect !== "gradient" || previous.gradientSpeed === gradientSpeed)) return;
    for (const state of graph.rootStore.connectionsList.$connections.value) {
      const view = state.getViewComponent();
      if (view instanceof BlockConnection) view.invalidateLine();
    }
  }, [graph, effect, gradientSpeed]);

  return (
    <ConnectionPreview
      graph={graph}
      code={etlCode(gradientSpeed)}
      renderBlock={renderEtlBlock}
      instruction="Zoom in to run, pause or retry a stage. Change the effect of running flows in Controls; failed flows stay red and idle flows stay gray."
    />
  );
}

export const EtlPipeline: StoryObj<EtlArgs> = {
  name: "ETL pipeline",
  args: { effect: "dash", gradientSpeed: defaultGradientSpeed },
  argTypes: {
    effect: {
      name: "Running flow style",
      options: ["plain", "dash", "gradient"],
      control: { type: "select", labels: { plain: "Solid", dash: "Dash flow", gradient: "Gradient" } },
    },
    gradientSpeed: { ...gradientSpeedControl, if: { arg: "effect", eq: "gradient" } },
  },
  render: (args) => <EtlScene {...args} />,
};
