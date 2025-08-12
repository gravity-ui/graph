import React, { useCallback, useEffect, useRef, useState } from "react";

import { ConnectionLayer, Graph, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { Flex, Hotkey, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({
    settings: {
      canCreateNewConnections: true,
    },
  });

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const connectionLayerRef = useRef<ConnectionLayer>(null);

  useEffect(() => {
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
    const drawLine = (start, end) => {
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

    connectionLayerRef.current = addLayer(ConnectionLayer, {
      createIcon,
      point: pointIcon,
      drawLine,
    });

    return () => {
      connectionLayerRef.current?.detachLayer();
    };
  }, []);

  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // Listen for connection creation events
    graph.on("connection-created", (event) => {
      console.log("Connection created:", event.detail);
    });

    // Listen for connection creation start events
    graph.on("connection-create-start", (event) => {
      console.log("Connection creation started:", event.detail);
    });

    // Listen for hover events during connection creation
    graph.on("connection-create-hover", (event) => {
      console.log("Hover during connection creation:", event.detail);
    });

    // Listen for connection creation completion events
    graph.on("connection-create-drop", (event) => {
      if (!event.detail.targetBlockId) {
        const source = graph.rootStore.blocksList.getBlock(event.detail.sourceBlockId);
        const block = graph.api.addBlock({
          id: `${graph.rootStore.blocksList.$blocksMap.value.size}`,
          name: `from ${source.name}`,
          x: event.detail.point.x,
          y: event.detail.point.y,
          width: source.width,
          height: source.height,
          is: "block",
          selected: false,
          anchors: [],
        });
        graph.api.addConnection({
          id: `${String(source.id)}-${String(block)}`,
          sourceBlockId: event.detail.sourceBlockId,
          sourceAnchorId: event.detail.sourceAnchorId,
          targetBlockId: block,
          targetAnchorId: "bottom",
        });
      }
      console.log("Connection creation completed:", event.detail);
    });
  }, [graph]);

  const switchConnectionEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      connectionLayerRef.current.enable();
      setEnabled(true);
    } else {
      connectionLayerRef.current.disable(); // Обратите внимание, что в оригинале метод назван disabled, а не disable
      setEnabled(false);
    }
  }, []);

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
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
