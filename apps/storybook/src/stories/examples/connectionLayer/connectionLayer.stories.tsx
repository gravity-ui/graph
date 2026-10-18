import React, { useEffect, useState } from "react";

import { Graph, TBlock, TPoint } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";
import { GraphCanvas, useGraph, useGraphEvent, useLayer } from "@gravity-ui/graph-react";
import { Flex, Hotkey, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

// Create icon for creating connections
const createIcon = {
  path: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z", // Plus icon
  fill: "#FFFFFF",
  width: 24,
  height: 24,
  viewWidth: 24,
  viewHeight: 24,
};

// Icon for connection point
const pointIcon = {
  path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z", // Circle icon
  fill: "#FFFFFF",
  stroke: "#000000",
  width: 24,
  height: 24,
  viewWidth: 24,
  viewHeight: 24,
};

// Function for drawing connection line
const drawLine = (start: TPoint, end: TPoint) => {
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
};

const GraphApp = () => {
  const { graph, setEntities, start, zoomTo } = useGraph({});

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const [enabled, setEnabled] = useState(true);

  useLayer(graph, ConnectionEditingLayer, { enabled, createIcon, point: pointIcon, drawLine });

  useGraphEvent(graph, "connection-created", (detail) => {
    console.log("Connection created:", detail);
  });

  useGraphEvent(graph, "connection-create-start", (detail) => {
    console.log("Connection creation started:", detail);
  });

  useGraphEvent(graph, "connection-create-hover", (detail) => {
    console.log("Hover during connection creation:", detail);
  });

  // Dropping on empty space creates a block connected to the source.
  useGraphEvent(graph, "connection-create-drop", (detail) => {
    const { sourceBlockId, sourceAnchorId, targetPort, point } = detail;
    if (!targetPort && sourceBlockId !== undefined) {
      const source = graph.blocks.getBlock(sourceBlockId);
      if (source) {
        const block = graph.api.addBlock({
          id: `${graph.blocks.$blocksMap.value.size}`,
          name: `from ${source.name}`,
          x: point.x,
          y: point.y,
          width: source.width,
          height: source.height,
          is: "block",
          selected: false,
          anchors: [],
        });
        graph.api.addConnection({
          id: `${String(source.id)}-${String(block)}`,
          sourceBlockId,
          sourceAnchorId,
          targetBlockId: block,
          targetAnchorId: "bottom",
        });
      }
    }
    console.log("Connection creation completed:", detail);
  });

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">ConnectionEditingLayer: anchors and blocks</Text>
          <Text variant="body-1">
            This layer allows creating connections between blocks and anchors. To create a connection between blocks,
            hold <Hotkey value={"shift"} /> and drag from one block to another. To connect anchors, simply drag from one
            anchor to another.
          </Text>

          <Flex alignItems="center" gap={2}>
            <Flex alignItems="center">
              <Switch checked={enabled} onChange={() => setEnabled(!enabled)} content="Enable connection editing" />
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
  title: "Examples/ConnectionEditingLayer/Anchors and blocks",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
