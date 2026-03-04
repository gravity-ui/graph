import React, { useEffect, useRef, useState } from "react";

import { Flex, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { WebGLConnectionsLayer } from "../../../components/canvas/layers/webGLConnectionsLayer/WebGLConnectionsLayer";
import { Graph } from "../../../index";
import { GraphCanvas, useGraph } from "../../../react-components";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({});

  const webglLayerRef = useRef<WebGLConnectionsLayer | null>(null);
  const [useWebGL, setUseWebGL] = useState(false);

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const handleToggle = (enabled: boolean) => {
    if (!graph) return;
    setUseWebGL(enabled);

    if (enabled) {
      // Detach the default Canvas 2D connections layer, attach WebGL layer
      graph.detachLayer(graph.connectionsLayer);
      webglLayerRef.current = addLayer(WebGLConnectionsLayer, {});
    } else {
      // Reattach Canvas 2D connections layer, detach WebGL layer
      if (webglLayerRef.current) {
        graph.detachLayer(webglLayerRef.current);
        webglLayerRef.current = null;
      }
      // Reattach built-in connections layer
      graph.connectionsLayer.attachLayer(graph.layers.getRoot());
      graph.connectionsLayer.show();
    }
  };

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="dark">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">WebGL Connections Layer</Text>
          <Text variant="body-1">
            An alternative connections layer that renders using WebGL instead of Canvas 2D. Hit testing (hover, click,
            select) still works via BaseConnection components.
          </Text>
          <Switch checked={useWebGL} onChange={() => handleToggle(!useWebGL)} content="Use WebGL renderer" />
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/WebGLConnections",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
