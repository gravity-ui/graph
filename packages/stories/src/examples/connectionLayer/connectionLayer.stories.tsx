import React, { useEffect, useState } from "react";

import { ConnectionLayer, Graph, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useFn, useGraph, useGraphEvent, useLayer } from "@gravity-ui/graph-react";
import { Flex, Hotkey, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const { graph, setEntities, start, zoomTo } = useGraph({
    settings: {
      canCreateNewConnections: true,
    },
  });

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const connectionLayer = useLayer(graph, ConnectionLayer, {
    createIcon: {
      path: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z", // Plus icon
      fill: "#FFFFFF",
      width: 24,
      height: 24,
      viewWidth: 24,
      viewHeight: 24,
    },
    point: {
      path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z", // Circle icon
      fill: "#FFFFFF",
      stroke: "#000000",
      width: 24,
      height: 24,
      viewWidth: 24,
      viewHeight: 24,
    },
    drawLine: (start, end) => {
      const path = new Path2D();
      path.moveTo(start.x, start.y);
      path.lineTo(end.x, end.y);
      return {
        path,
        style: {
          color: "#4285F4",
          dash: [5, 5], // Dashed line
        },
      };
    },
  });

  const [enabled, setEnabled] = useState(true);

  useGraphEvent(graph, "connection-created", (data) => {
    console.log("Connection created:", data);
  });

  useGraphEvent(graph, "connection-create-start", (data) => {
    console.log("Connection creation started:", data);
  });

  useGraphEvent(graph, "connection-create-hover", (data) => {
    console.log("Hover during connection creation:", data);
  });

  useGraphEvent(graph, "connection-create-drop", (data) => {
    console.log("Connection creation completed:", data);
  });

  useGraphEvent(graph, "connection-create-drop", (data) => {
    if (!data.targetBlockId) {
      const source = graph.rootStore.blocksList.getBlock(data.sourceBlockId);
      const block = graph.api.addBlock({
        id: `${graph.rootStore.blocksList.$blocksMap.value.size}`,
        name: `from ${source.name}`,
        x: data.point.x,
        y: data.point.y,
        width: source.width,
        height: source.height,
        is: "block",
        selected: false,
        anchors: [],
      });
      graph.api.addConnection({
        id: `${String(source.id)}-${String(block)}`,
        sourceBlockId: data.sourceBlockId,
        sourceAnchorId: data.sourceAnchorId,
        targetBlockId: block,
        targetAnchorId: "bottom",
      });
    }
    console.log("Connection creation completed:", data);
  });

  const switchConnectionEnabled = useFn((enabled: boolean) => {
    if (connectionLayer) {
      if (enabled) {
        connectionLayer.enable();
        setEnabled(true);
      } else {
        connectionLayer.disable();
        setEnabled(false);
      }
    }
  });

  const renderBlock = (graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">ConnectionLayer Demo</Text>
          <Text variant="body-1">
            This layer allows creating connections between blocks and anchors. To create a connection between blocks,
            hold <Hotkey value={"shift"} /> and drag from one block to another. To connect anchors, simply drag from one
            anchor to another.
          </Text>

          <Flex alignItems="center" gap={2}>
            <Flex alignItems="center">
              <Switch
                checked={enabled}
                onChange={() => switchConnectionEnabled(!enabled)}
                content="Enable ConnectionLayer"
              />
            </Flex>
          </Flex>
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/ConnectionLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
