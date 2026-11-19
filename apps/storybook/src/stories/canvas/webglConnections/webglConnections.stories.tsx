import React, { useEffect, useMemo, useState } from "react";

import { BlockConnection, ECanDrag } from "@gravity-ui/graph";
import type { Graph, TBlock, TGraphColorsPatch, TRect, TSceneRenderer } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Flex, SegmentedRadioGroup, Slider, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import type { TGeneratedGraphConfig } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import { EtlBlockView } from "./EtlBlockView";
import {
  cometsCode,
  etlCode,
  glowCode,
  gradientCode,
  particlesCode,
  perConnectionCode,
  pipelineCode,
  runningDashCode,
  signalWaveCode,
  stillDashCode,
  stressCode,
} from "./codeSamples";
import { ETL_BLOCK_IS, etlBlocks, etlConnection, etlFlows, isEtlBlock, setEtlEffect } from "./etl";
import type { TEtlEffect } from "./etl";
import { EtlBlock, etlBlockRules } from "./etlBlock";
import {
  comets,
  dataStyled,
  glow,
  glowLines,
  gradientLines,
  particleLines,
  particles,
  pipeline,
  runningDash,
  signalWave,
  stillDash,
} from "./lines";
import type { TConnectionClass } from "./lines";

import "@gravity-ui/uikit/styles/styles.css";

type TOption = { value: string; content: string };
/** A slider writing an effect's float uniform. */
type TSlider = { label: string; uniform: { value: number }; min: number; max: number; step: number };
/** `code` replaces the story's code sample while the effect is selected. */
type TEffect = TOption & { connection: TConnectionClass; code?: string; slider?: TSlider };

/** Options are connections per layer for generatePrettyBlocks. */
const sizes: TOption[] = [
  { value: "50", content: "~1.5k connections" },
  { value: "400", content: "~12k connections" },
  { value: "1000", content: "~30k connections" },
];

const renderers: { value: TSceneRenderer; content: string }[] = [
  { value: "canvas", content: "Canvas" },
  { value: "webgl", content: "WebGL" },
];

const glowSlider: TSlider = { label: "Glow intensity", uniform: glow.uniforms.intensity, min: 0, max: 1.5, step: 0.05 };
const particlesSlider: TSlider = {
  label: "Particles speed",
  uniform: particles.uniforms.speed,
  min: 0,
  max: 3,
  step: 0.1,
};

type TGraphViewProps = {
  config: TGeneratedGraphConfig;
  connection: TConnectionClass;
  renderer: TSceneRenderer;
  useBezierConnections: boolean;
  initialView?: TRect;
};

/** One graph per effect: the connection class applies to connections created after it is set. */
const GraphView = ({
  config,
  connection,
  renderer,
  useBezierConnections,
  initialView,
}: TGraphViewProps): React.JSX.Element => {
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({});
  const actual = useSignal(graph.scene.$renderer);

  useEffect(() => {
    setSettings({ renderer });
  }, [setSettings, renderer]);

  // Settings go first so connections are created with the custom class.
  useEffect(() => {
    setSettings({
      connection,
      showConnectionLabels: false,
      useBezierConnections,
    });
  }, [setSettings, connection, useBezierConnections]);

  useEffect(() => {
    setEntities({ blocks: config.blocks, connections: config.connections });
    start();
    zoomTo(initialView ?? "center", { padding: 100 });
  }, [setEntities, start, zoomTo, config, initialView]);

  const renderBlock = (graphInstance: Graph, block: TBlock): React.JSX.Element => (
    <BlockStory graph={graphInstance} block={block} />
  );

  return (
    <>
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
      <Text variant="body-1" color="secondary" style={{ position: "absolute", right: 16, bottom: 8, zIndex: 10 }}>
        Scene renderer: {actual}
      </Text>
    </>
  );
};

type TGraphAppProps = {
  title: string;
  description: string;
  code: string;
  /** The first effect is the default; with one effect the switch is hidden. */
  effects: TEffect[];
  layersCount: number;
  /** Connections per layer to choose from; with one size the switch is hidden. */
  sizes: TOption[];
  useBezierConnections?: boolean;
  /** World rectangle to open; the whole graph by default. */
  initialView?: TRect;
};

const UniformSlider = ({ label, uniform, min, max, step }: TSlider): React.JSX.Element => {
  const [value, setValue] = useState(uniform.value);
  return (
    <Flex alignItems="center" gap={2}>
      <Text variant="body-1">{label}</Text>
      <div style={{ width: 200 }}>
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          onUpdate={(next) => {
            uniform.value = next;
            setValue(next);
          }}
        />
      </div>
    </Flex>
  );
};

const GraphApp = ({
  title,
  description,
  code,
  effects,
  layersCount,
  sizes: sizeOptions,
  useBezierConnections = true,
  initialView,
}: TGraphAppProps): React.JSX.Element => {
  const [size, setSize] = useState(sizeOptions[0].value);
  const [effect, setEffect] = useState(effects[0].value);
  const [renderer, setRenderer] = useState<TSceneRenderer>("webgl");
  const config = useMemo(
    () => generatePrettyBlocks({ layersCount, connectionsPerLayer: Number(size) }),
    [layersCount, size]
  );
  const selected = effects.find((option) => option.value === effect) ?? effects[0];

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">{title}</Text>
          <Text variant="body-1">{description}</Text>
          <pre style={{ margin: 0, fontSize: 12, maxHeight: 180, overflow: "auto" }}>{selected.code ?? code}</pre>
          <Flex alignItems="center" gap={4} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            {sizeOptions.length > 1 && <SegmentedRadioGroup options={sizeOptions} value={size} onUpdate={setSize} />}
            {effects.length > 1 && <SegmentedRadioGroup options={effects} value={effect} onUpdate={setEffect} />}
            <Text variant="body-1" color="secondary">
              {config.blocks.length.toLocaleString()} blocks, {config.connections.length.toLocaleString()} connections
            </Text>
          </Flex>
          {selected.slider && <UniformSlider key={selected.value} {...selected.slider} />}
        </Flex>
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphView
            key={`${effect}/${size}`}
            config={config}
            connection={selected.connection}
            renderer={renderer}
            useBezierConnections={useBezierConnections}
            initialView={initialView}
          />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Canvas/WebGLConnections",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const RunningDash: StoryFn = () => (
  <GraphApp
    title="Running dash"
    description="Switch between Canvas and WebGL on the same graph. The connection keeps its color and width in both renderers. WebGL animates the dashes."
    code={runningDashCode}
    effects={[{ value: "dash", content: "Running dash", connection: runningDash }]}
    layersCount={30}
    sizes={sizes}
  />
);
RunningDash.parameters = {
  docs: {
    description: {
      story:
        "A `SceneLine` subclass returns `effect: dashFlow.use({ pattern: [12, 8], speed: 40 })` from `getStroke()`. `graph.scene.setRenderer()` switches the existing blocks and connections together.",
    },
  },
};

export const PerConnectionStyle: StoryFn = () => (
  <GraphApp
    title="Per-connection style from data"
    description="getStroke() of the line picks color and width from a hash of the connection id, so every connection is styled from its own data."
    code={perConnectionCode}
    effects={[{ value: "style", content: "Per-connection style", connection: dataStyled }]}
    layersCount={30}
    sizes={sizes}
  />
);
PerConnectionStyle.parameters = {
  docs: {
    description: {
      story:
        "A line class returns color and width from a hash of `this.connection.props.id` in `getStroke()`; both renderers draw it.",
    },
  },
};

export const GraphStress: StoryFn = () => (
  <GraphApp
    title="Graph stress test"
    description="The GraphEditor GraphStressTest graph with straight connections. Switch the renderer and the connection style; both renderers show the base stroke and WebGL can animate it with dashFlow."
    code={stressCode}
    effects={[
      { value: "plain", content: "Plain", connection: BlockConnection },
      { value: "dash", content: "Running dash", connection: runningDash },
      { value: "style", content: "Per-connection style", connection: dataStyled },
    ]}
    layersCount={110}
    sizes={[{ value: "1000", content: "1000 per layer" }]}
    useBezierConnections={false}
  />
);
GraphStress.parameters = {
  docs: {
    description: {
      story: "`generatePrettyBlocks({ layersCount: 110, connectionsPerLayer: 1000 })` with straight connections.",
    },
  },
};

/** The middle layers, where most connections cross; the whole graph is too tall to show effects at once. */
const nirvanaMiddle: TRect = { x: 31000, y: -1500, width: 5000, height: 3000 };

export const NirvanaEffects: StoryFn = () => (
  <GraphApp
    title="Nirvana max graph with animated connections"
    description="The GraphEditor NirvanaMaxGraphTest graph with WebGL effects: comets that fade towards the tail and run at their own speed in either direction, and a signal wave that crosses the graph. Particles, Gradient and Glow are custom shader effects defined in the story with defineConnectionEffect; the sliders write their uniforms (the particles jump while the speed slider moves: the phase is time times speed). Canvas draws each effect line's base stroke."
    code={pipelineCode}
    effects={[
      { value: "pipeline", content: "Pipeline", connection: pipeline },
      { value: "comets", content: "Comets", connection: comets, code: cometsCode },
      { value: "wave", content: "Signal wave", connection: signalWave, code: signalWaveCode },
      {
        value: "particles",
        content: "Particles (shader)",
        connection: particleLines,
        code: particlesCode,
        slider: particlesSlider,
      },
      { value: "gradient", content: "Gradient (shader)", connection: gradientLines, code: gradientCode },
      { value: "glow", content: "Glow (shader)", connection: glowLines, code: glowCode, slider: glowSlider },
      { value: "still", content: "Still dash", connection: stillDash, code: stillDashCode },
    ]}
    layersCount={55}
    sizes={[{ value: "400", content: "400 per layer" }]}
    initialView={nirvanaMiddle}
  />
);
NirvanaEffects.parameters = {
  docs: {
    description: {
      story:
        "`generatePrettyBlocks({ layersCount: 55, connectionsPerLayer: 400 })` with bezier connections and effects in `getStroke()`: `dashFlow` with `fade` and negative `speed`, `pulse`, and custom `defineConnectionEffect` shaders.",
    },
  },
};

const etlEffects: (TOption & { value: TEtlEffect; slider?: TSlider })[] = [
  { value: "comets", content: "Comets" },
  { value: "dash", content: "Running dash" },
  { value: "pulse", content: "Pulse" },
  { value: "particles", content: "Particles", slider: particlesSlider },
  { value: "gradient", content: "Gradient" },
  { value: "glow", content: "Glow", slider: glowSlider },
  { value: "plain", content: "Plain" },
];

/** White stage cards; the selection keeps the theme color. */
const etlViewConfiguration: { colors: TGraphColorsPatch } = {
  colors: { block: { background: "#ffffff", border: "#d9dce1", text: "#1f2329" } },
};

type TEtlGraphViewProps = {
  renderer: TSceneRenderer;
  effect: TEtlEffect;
};

const EtlGraphView = ({ renderer, effect }: TEtlGraphViewProps): React.JSX.Element => {
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({ viewConfiguration: etlViewConfiguration });
  const actual = useSignal(graph.scene.$renderer);

  useEffect(() => {
    setSettings({ renderer });
  }, [setSettings, renderer]);

  useEffect(() => graph.scene.styles.add(etlBlockRules), [graph]);

  // Settings go first so the stages and the flows are created with the custom classes.
  useEffect(() => {
    setSettings({
      connection: etlConnection,
      blockComponents: { [ETL_BLOCK_IS]: EtlBlock },
      canDrag: ECanDrag.ALL,
      canDragCamera: true,
      canZoomCamera: true,
      showConnectionLabels: false,
      useBezierConnections: true,
      showConnectionArrows: true,
    });
  }, [setSettings]);

  useEffect(() => {
    setEntities({ blocks: etlBlocks, connections: etlFlows });
    start();
    zoomTo("center", { padding: 100 });
  }, [setEntities, start, zoomTo]);

  // The camera and the selection stay: only the lines are read again.
  useEffect(() => {
    for (const state of graph.rootStore.connectionsList.$connections.value) {
      const view = state.getViewComponent();
      if (view instanceof BlockConnection) view.invalidateLine();
    }
  }, [graph, effect]);

  const renderBlock = (graphInstance: Graph, block: TBlock): React.JSX.Element =>
    isEtlBlock(block) ? (
      <EtlBlockView graph={graphInstance} block={block} />
    ) : (
      <BlockStory graph={graphInstance} block={block} />
    );

  return (
    <>
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
      <Text variant="body-1" color="secondary" style={{ position: "absolute", right: 16, bottom: 8, zIndex: 10 }}>
        Scene renderer: {actual}
      </Text>
    </>
  );
};

const EtlApp = (): React.JSX.Element => {
  const [effect, setEffect] = useState<TEtlEffect>("comets");
  const [renderer, setRenderer] = useState<TSceneRenderer>("webgl");
  const selected = etlEffects.find((option) => option.value === effect) ?? etlEffects[0];

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">ETL pipeline</Text>
          <Text variant="body-1">
            A typical ETL process: data moves from sources through extract, validation and cleaning, transforms and
            loads to the consumers. Each stage has a status; a flow takes its status from its stages: into a failed
            stage it is a red dash, out of a failed, paused or idle stage a thin grey line, otherwise it runs with the
            selected effect. Zoom in for the stage cards: Run, Pause and Retry change the status of the stage and the
            flows follow. Drag the stages to move them. The selector swaps the effect of every running flow at runtime
            through invalidateLine(); the graph, the camera and the selection stay. Speed, spacing and width follow the
            volume of the flow. Click a connection to see the selection look of the effect.
          </Text>
          <pre style={{ margin: 0, fontSize: 12, maxHeight: 180, overflow: "auto" }}>{etlCode}</pre>
          <Flex alignItems="center" gap={4} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            <SegmentedRadioGroup
              options={etlEffects}
              value={effect}
              onUpdate={(next) => {
                setEtlEffect(next);
                setEffect(next);
              }}
            />
            <Text variant="body-1" color="secondary">
              {etlBlocks.length} blocks, {etlFlows.length} connections
            </Text>
          </Flex>
          {selected.slider && <UniformSlider key={selected.value} {...selected.slider} />}
        </Flex>
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <EtlGraphView renderer={renderer} effect={effect} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

export const EtlPipeline: StoryFn = () => <EtlApp />;
EtlPipeline.storyName = "ETL pipeline";
EtlPipeline.parameters = {
  docs: {
    description: {
      story:
        "A line reads the selected effect from a module variable in `getStroke()`; on change the story calls `invalidateLine()` on every connection view. A flow takes its `status` from its stages; the stage actions update the block with `graph.api.updateBlock()` and the touching flows with `graph.api.updateConnection()`, and the lines follow the connection state. Failed and idle flows ignore the effect. The stages are an `EtlBlock` canvas block for every zoom level and an `EtlBlockView` React card when zoomed in; `canDrag: ECanDrag.ALL` makes them draggable.",
    },
  },
};
