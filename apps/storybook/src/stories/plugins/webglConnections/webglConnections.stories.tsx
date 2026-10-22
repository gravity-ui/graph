import React, { useEffect, useMemo, useState } from "react";

import { Graph, TBlock, TGraphConfig } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useLayer } from "@gravity-ui/graph-react";
import { TWebGLConnectionsLod, WebGLConnectionsLayer } from "@gravity-ui/graph-webgl-connections";
import { Flex, SegmentedRadioGroup, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

type TSizeOption = { value: string; content: string };
type TStorySettings = Partial<TGraphConfig["settings"]>;

/** Options are connections per layer for generatePrettyBlocks. */
const defaultSizes: TSizeOption[] = [
  { value: "50", content: "~1.5k connections" },
  { value: "400", content: "~12k connections" },
  { value: "1000", content: "~30k connections" },
];

const defaultSettings: TStorySettings = { showConnectionLabels: false };

/** Same graph as the GraphStressTest story in GraphEditor.stories.tsx. */
const stressSizes: TSizeOption[] = [{ value: "1000", content: "~111k blocks, ~109k connections" }];

const stressSettings: TStorySettings = { showConnectionLabels: false, useBezierConnections: false };

const renderers = [
  { value: "webgl", content: "WebGL" },
  { value: "canvas", content: "Canvas" },
];

/** Mounting this component attaches the layer; unmounting removes it and brings canvas connections back. */
const WebGLConnections = ({ graph, lod }: { graph: Graph | null; lod: TWebGLConnectionsLod }) => {
  useLayer(graph, WebGLConnectionsLayer, { lod });
  return null;
};

function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let start = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      frames++;
      if (now - start >= 1000) {
        setFps(Math.round((frames * 1000) / (now - start)));
        frames = 0;
        start = now;
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return fps;
}

type TGraphAppProps = {
  title: string;
  layersCount: number;
  sizes: TSizeOption[];
  initialSize: string;
  settings: TStorySettings;
};

const GraphApp = ({ title, layersCount, sizes, initialSize, settings }: TGraphAppProps) => {
  const { graph, setEntities, start, zoomTo } = useGraph({});
  const [size, setSize] = useState(initialSize);
  const [renderer, setRenderer] = useState("webgl");
  const [stubs, setStubs] = useState(false);
  const [hideFar, setHideFar] = useState(false);
  const fps = useFps();

  useEffect(() => {
    setEntities(
      generatePrettyBlocks({
        layersCount,
        connectionsPerLayer: Number(size),
        overrideSettings: settings,
      })
    );
    start();
    zoomTo("center", { padding: 100 });
  }, [graph, size, layersCount, settings]);

  const lod = useMemo<TWebGLConnectionsLod>(
    () => ({
      stubsBelowScale: stubs ? 0.2 : undefined,
      hideBelowScale: hideFar ? 0.04 : undefined,
    }),
    [stubs, hideFar]
  );

  const renderBlock = (graphInstance: Graph, block: TBlock) => <BlockStory graph={graphInstance} block={block} />;

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">{title}</Text>
          <Text variant="body-1">
            Connections are drawn by one WebGL2 layer instead of a canvas component per connection. Pan and zoom only
            change shader uniforms. Hover and click connections to check hit testing. Turn on stubs to draw only the
            ends of connections when zoomed out; connections of a selected block stay whole.
          </Text>
          <Flex alignItems="center" gap={4} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            {sizes.length > 1 ? (
              <SegmentedRadioGroup options={sizes} value={size} onUpdate={setSize} />
            ) : (
              <Text variant="body-1">{sizes[0].content}</Text>
            )}
            <Switch
              checked={stubs}
              disabled={renderer !== "webgl"}
              onUpdate={setStubs}
              content="Stubs below scale 0.2"
            />
            <Switch
              checked={hideFar}
              disabled={renderer !== "webgl"}
              onUpdate={setHideFar}
              content="Hide below scale 0.04"
            />
            <Text variant="code-1">{fps} fps</Text>
          </Flex>
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
          {renderer === "webgl" ? <WebGLConnections graph={graph} lod={lod} /> : null}
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Plugins/WebGLConnections",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => (
  <GraphApp
    title="WebGL connections"
    layersCount={30}
    sizes={defaultSizes}
    initialSize="400"
    settings={defaultSettings}
  />
);

export const StressTest: StoryFn = () => (
  <GraphApp
    title="WebGL connections: stress test"
    layersCount={110}
    sizes={stressSizes}
    initialSize="1000"
    settings={stressSettings}
  />
);
