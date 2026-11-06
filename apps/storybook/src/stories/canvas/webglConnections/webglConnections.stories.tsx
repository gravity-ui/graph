import React, { useEffect, useMemo, useState } from "react";

import { BlockConnection } from "@gravity-ui/graph";
import type { Graph, TBlock, TConnection, TConnectionEffect, TRect } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { Flex, SegmentedRadioGroup, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import type { TGeneratedGraphConfig } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

type TOption = { value: string; content: string };
type TRenderer = "canvas" | "webgl";
type TStroke = ReturnType<BlockConnection<TConnection>["getStroke"]>;
type TConnectionClass = typeof BlockConnection<TConnection>;
/** `code` replaces the story's code sample while the effect is selected. */
type TEffect = TOption & { connection: TConnectionClass; code?: string };

/** Options are connections per layer for generatePrettyBlocks. */
const sizes: TOption[] = [
  { value: "50", content: "~1.5k connections" },
  { value: "400", content: "~12k connections" },
  { value: "1000", content: "~30k connections" },
];

const renderers: { value: TRenderer; content: string }[] = [
  { value: "canvas", content: "Canvas" },
  { value: "webgl", content: "WebGL" },
];

/** A running dash: the pattern moves from the source to the target at 40 world units per second. */
class RunningDashConnection extends BlockConnection<TConnection> {
  public override getStroke(state?: Parameters<BlockConnection<TConnection>["getStroke"]>[0]): TStroke {
    return { ...super.getStroke(state), dash: { pattern: [12, 8], speed: 40 } };
  }
}

const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

function hashId(id: string | number | undefined): number {
  let hash = 0;
  for (const char of String(id)) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
}

/** Color and width come from a hash of the connection id; hover and selection still use the default stroke. */
class DataStyledConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.props.id);
    return { ...stroke, color: palette[hash % palette.length], width: 1 + (hash % 4) };
  }
}

const flowColors = ["#2f7cf6", "#00a3a3", "#7a5af8"];

/**
 * A pipeline at work, picked per connection from a hash of its id: comets carry data forward at their own speed,
 * orange comets run back, green lines pass a signal wave across the graph, grey dashed lines wait.
 */
class PipelineConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.props.id);
    const kind = hash % 10;
    if (kind < 4) {
      const speed = 120 + (hash % 160);
      return { color: flowColors[hash % 3], width: 6, dash: { pattern: [90, 160], speed, fade: true } };
    }
    if (kind < 6) {
      return { color: "#f28e2b", width: 5, dash: { pattern: [60, 140], speed: -(90 + (hash % 90)), fade: true } };
    }
    if (kind < 8) return { color: "#2bb24c", width: 5, pulse: { period: 3, wavelength: 24000 } };
    return { color: "rgba(110, 110, 110, 0.6)", width: 2, dash: { pattern: [12, 12] } };
  }
}

/** Every connection carries comets forward; speed and color vary per connection. */
class CometConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.props.id);
    const speed = 100 + (hash % 220);
    return { color: flowColors[hash % 3], width: 5, dash: { pattern: [80, 180], speed, fade: true } };
  }
}

/** One signal runs across the whole graph from the first layer to the last. */
class SignalWaveConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    return { color: "#7a5af8", width: 6, pulse: { period: 4, wavelength: 30000 } };
  }
}

/**
 * Custom WebGL effects defined here, outside the library: registered with the `connectionEffects` setting and picked
 * per connection in `getStroke().effect`.
 */
const particlesEffect: TConnectionEffect = {
  name: "particles",
  animated: true,
  // params0: x spacing (world units), y speed (world units per second)
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float spacing = f.params0.x;
      float offset = mod(f.along - f.time * f.params0.y, spacing) - spacing * 0.5;
      // Round particles as wide as the line, over a faint trace of it.
      float distance = length(vec2(offset * f.scale, f.across));
      float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, distance);
      return vec4(color.rgb, color.a * max(particle, 0.12));
    }`,
};

const gradientEffect: TConnectionEffect = {
  name: "gradient",
  animated: true,
  // params0: source rgb and the band's laps per second; params1: target rgb
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      vec3 rgb = mix(f.params0.rgb, f.params1.rgb, f.t);
      // A band runs from source to target once every 1 / params0.w seconds, whatever the connection's length.
      float band = smoothstep(0.8, 1.0, fract(f.t - f.time * f.params0.w));
      return vec4(rgb, color.a * mix(0.35, 1.0, band));
    }`,
};

const customEffects = [particlesEffect, gradientEffect];

/** Particles at their own spacing and speed: a stroke wide enough for round dots. */
class ParticlesConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.props.id);
    const params = [120 + (hash % 80), 80 + (hash % 140)];
    return { color: flowColors[hash % 3], width: 14, effect: { name: "particles", params } };
  }
}

/** Blue at the source, orange at the target, and a band that runs along at its own pace. */
class GradientConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state): TStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const laps = 0.2 + (hashId(this.props.id) % 5) * 0.1;
    const params = [0.18, 0.49, 0.96, laps, 0.95, 0.56, 0.17, 0];
    // The color is what canvas draws: effects are WebGL only.
    return { color: "#7a8aa6", width: 6, effect: { name: "gradient", params } };
  }
}

const particlesCode = `const particlesEffect: TConnectionEffect = {
  name: "particles",
  animated: true,
  fragment: \`vec4 effect(ConnectionFragment f, vec4 color) {
    float offset = mod(f.along - f.time * f.params0.y, f.params0.x) - f.params0.x * 0.5;
    float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, length(vec2(offset * f.scale, f.across)));
    return vec4(color.rgb, color.a * max(particle, 0.12));
  }\`,
};
// settings: { connectionEffects: [particlesEffect], connectionsRenderer: "webgl" }
// getStroke(): { color, width: 14, effect: { name: "particles", params: [spacing, speed] } }`;

const gradientCode = `const gradientEffect: TConnectionEffect = {
  name: "gradient",
  animated: true,
  fragment: \`vec4 effect(ConnectionFragment f, vec4 color) {
    vec3 rgb = mix(f.params0.rgb, f.params1.rgb, f.t);
    float band = smoothstep(0.8, 1.0, fract(f.t - f.time * f.params0.w));
    return vec4(rgb, color.a * mix(0.35, 1.0, band));
  }\`,
};
// getStroke(): { color, width: 6, effect: { name: "gradient", params: [...sourceRgb, laps, ...targetRgb, 0] } }`;

type TGraphViewProps = {
  config: TGeneratedGraphConfig;
  connection: TConnectionClass;
  renderer: TRenderer;
  useBezierConnections: boolean;
  initialView?: TRect;
  connectionEffects?: TConnectionEffect[];
};

/** One graph per effect: the connection class applies to connections created after it is set. */
const GraphView = ({
  config,
  connection,
  renderer,
  useBezierConnections,
  initialView,
  connectionEffects,
}: TGraphViewProps): React.JSX.Element => {
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({});

  // Settings go first so connections are created with the custom class.
  useEffect(() => {
    setSettings({ connection, showConnectionLabels: false, useBezierConnections, connectionEffects });
  }, [setSettings, connection, useBezierConnections, connectionEffects]);

  useEffect(() => {
    setSettings({ connectionsRenderer: renderer });
  }, [setSettings, renderer]);

  useEffect(() => {
    setEntities({ blocks: config.blocks, connections: config.connections });
    start();
    zoomTo(initialView ?? "center", { padding: 100 });
  }, [setEntities, start, zoomTo, config, initialView]);

  const renderBlock = (graphInstance: Graph, block: TBlock): React.JSX.Element => (
    <BlockStory graph={graphInstance} block={block} />
  );

  return <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />;
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
  connectionEffects?: TConnectionEffect[];
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
  connectionEffects,
}: TGraphAppProps): React.JSX.Element => {
  const [size, setSize] = useState(sizeOptions[0].value);
  const [effect, setEffect] = useState(effects[0].value);
  const [renderer, setRenderer] = useState<TRenderer>("webgl");
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
          <pre style={{ margin: 0, fontSize: 12 }}>{selected.code ?? code}</pre>
          <Flex alignItems="center" gap={4} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            {sizeOptions.length > 1 && <SegmentedRadioGroup options={sizeOptions} value={size} onUpdate={setSize} />}
            {effects.length > 1 && <SegmentedRadioGroup options={effects} value={effect} onUpdate={setEffect} />}
            <Text variant="body-1" color="secondary">
              {config.blocks.length.toLocaleString()} blocks, {config.connections.length.toLocaleString()} connections
            </Text>
          </Flex>
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphView
            key={`${effect}/${size}`}
            config={config}
            connection={selected.connection}
            renderer={renderer}
            useBezierConnections={useBezierConnections}
            initialView={initialView}
            connectionEffects={connectionEffects}
          />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const runningDashCode = `class RunningDashConnection extends BlockConnection<TConnection> {
  public override getStroke(state) {
    return { ...super.getStroke(state), dash: { pattern: [12, 8], speed: 40 } };
  }
}
// settings: { connection: RunningDashConnection, connectionsRenderer: "webgl" }`;

const perConnectionCode = `class DataStyledConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state) {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.props.id);
    return { ...stroke, color: palette[hash % palette.length], width: 1 + (hash % 4) };
  }
}
// settings: { connection: DataStyledConnection, connectionsRenderer: "webgl" }`;

const stressCode = `// GraphEditor/GraphStressTest: generatePrettyBlocks({ layersCount: 110, connectionsPerLayer: 1000 }), straight lines
// settings: { connection: Plain | RunningDash | DataStyled, connectionsRenderer: "webgl" }`;

const pipelineCode = `class PipelineConnection extends BlockConnection<TConnection> {
  public override getStroke(state = this.state) {
    // forward comets, return comets, a signal wave or a waiting dashed line, from a hash of the id
    return { color, width: 6, dash: { pattern: [90, 160], speed: 120 + (hash % 160), fade: true } };
    return { color: "#2bb24c", width: 5, pulse: { period: 3, wavelength: 24000 } };
  }
}
// dash.fade and pulse are WebGL only: Path2D draws plain dashes and steady lines.`;

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
    description="Override getStroke() of a BlockConnection subclass to add an animated dash. Canvas and WebGL draw the same stroke; switch the renderer to compare."
    code={runningDashCode}
    effects={[{ value: "dash", content: "Running dash", connection: RunningDashConnection }]}
    layersCount={30}
    sizes={sizes}
  />
);
RunningDash.parameters = {
  docs: {
    description: {
      story: "A `BlockConnection` subclass adds `dash: { pattern: [12, 8], speed: 40 }` in `getStroke()`.",
    },
  },
};

export const PerConnectionStyle: StoryFn = () => (
  <GraphApp
    title="Per-connection style from data"
    description="getStroke() picks color and width from a hash of the connection id, so every connection is styled from its own data."
    code={perConnectionCode}
    effects={[{ value: "style", content: "Per-connection style", connection: DataStyledConnection }]}
    layersCount={30}
    sizes={sizes}
  />
);
PerConnectionStyle.parameters = {
  docs: {
    description: {
      story: "A `BlockConnection` subclass returns color and width from a hash of the connection id in `getStroke()`.",
    },
  },
};

export const GraphStress: StoryFn = () => (
  <GraphApp
    title="Graph stress test"
    description="The GraphEditor GraphStressTest graph with straight connections. Switch the renderer and the connection style; a running dash on canvas redraws every connection's dashes every frame."
    code={stressCode}
    effects={[
      { value: "plain", content: "Plain", connection: BlockConnection },
      { value: "dash", content: "Running dash", connection: RunningDashConnection },
      { value: "style", content: "Per-connection style", connection: DataStyledConnection },
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
    description="The GraphEditor NirvanaMaxGraphTest graph with WebGL effects: comets that fade towards the tail and run at their own speed in either direction, and a signal wave that crosses the graph. Particles and Gradient are custom shader effects defined in the story file and registered with the connectionEffects setting. Canvas draws the base stroke without the effects, and is slow with dashes on this graph."
    code={pipelineCode}
    effects={[
      { value: "pipeline", content: "Pipeline", connection: PipelineConnection },
      { value: "comets", content: "Comets", connection: CometConnection },
      { value: "wave", content: "Signal wave", connection: SignalWaveConnection },
      { value: "particles", content: "Particles (shader)", connection: ParticlesConnection, code: particlesCode },
      { value: "gradient", content: "Gradient (shader)", connection: GradientConnection, code: gradientCode },
    ]}
    layersCount={55}
    sizes={[{ value: "400", content: "400 per layer" }]}
    initialView={nirvanaMiddle}
    connectionEffects={customEffects}
  />
);
NirvanaEffects.parameters = {
  docs: {
    description: {
      story:
        "`generatePrettyBlocks({ layersCount: 55, connectionsPerLayer: 400 })` with bezier connections and `getStroke()` effects: `dash.fade`, negative `dash.speed`, `pulse`.",
    },
  },
};
