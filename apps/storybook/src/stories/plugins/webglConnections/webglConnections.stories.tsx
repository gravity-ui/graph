import React, { useEffect, useMemo, useState } from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useLayer } from "@gravity-ui/graph-react";
import { TWebGLConnectionsLod, WebGLConnectionsLayer } from "@gravity-ui/graph-webgl-connections";
import { Flex, SegmentedRadioGroup, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const sizes = [
  { value: "50", content: "~1.5k connections" },
  { value: "400", content: "~12k connections" },
  { value: "1000", content: "~30k connections" },
];

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

const GraphApp = () => {
  const { graph, setEntities, start, zoomTo } = useGraph({});
  const [size, setSize] = useState("400");
  const [renderer, setRenderer] = useState("webgl");
  const [stubs, setStubs] = useState(true);
  const [hideFar, setHideFar] = useState(false);
  const fps = useFps();

  useEffect(() => {
    setEntities(
      generatePrettyBlocks({
        layersCount: 30,
        connectionsPerLayer: Number(size),
        overrideSettings: { showConnectionLabels: false },
      })
    );
    start();
    zoomTo("center", { padding: 100 });
  }, [graph, size]);

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
          <Text variant="header-1">WebGL connections</Text>
          <Text variant="body-1">
            Connections are drawn by one WebGL2 layer instead of a canvas component per connection. Pan and zoom only
            change shader uniforms. Hover and click connections to check hit testing; select a block to see its
            connections in full while the others are drawn as stubs.
          </Text>
          <Flex alignItems="center" gap={4} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            <SegmentedRadioGroup options={sizes} value={size} onUpdate={setSize} />
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

export const Default: StoryFn = () => <GraphApp />;
