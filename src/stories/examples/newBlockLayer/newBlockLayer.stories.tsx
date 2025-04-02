import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Flex, Hotkey, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { NewBlockLayer } from "../../../components/canvas/layers/newBlockLayer/NewBlockLayer";
import { Graph } from "../../../index";
import { GraphCanvas } from "../../../react-component/GraphCanvas";
import { useGraph } from "../../../react-component/hooks/useGraph";
import { useFn } from "../../../utils/hooks/useFn";
import { ESelectionStrategy } from "../../../utils/types/types";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({});

  useEffect(() => {
    setEntities(generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false }));
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const newBlockLayerRef = useRef<NewBlockLayer>(null);

  useLayoutEffect(() => {
    newBlockLayerRef.current = addLayer(NewBlockLayer, {});
    return () => {
      newBlockLayerRef.current?.detachLayer();
    };
  }, []);

  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    graph.on("block-added-from-shadow", (event) => {
      // Clear selection of old blocks before adding new ones
      graph.api.unsetSelection();

      // Map to store original block ID to new block ID mapping
      const blockIdMap = new Map<string, string>();

      // First pass: create all blocks and build the ID mapping
      event.detail.items.forEach((item) => {
        const block = item.block.connectedState.asTBlock();
        const point = item.coord;
        const newBlockId = `${block.id.toString()}-added-from-shadow-${Date.now()}`;

        // Store the mapping between original and new block IDs
        blockIdMap.set(block.id.toString(), newBlockId);

        graph.api.addBlock(
          {
            ...block,
            id: newBlockId,
            is: "block",
            x: point.x,
            y: point.y,
          },
          {
            selected: true,
            strategy: ESelectionStrategy.APPEND, // Use APPEND strategy to keep all blocks selected
          }
        );
      });

      // Second pass: duplicate connections between duplicated blocks
      if (blockIdMap.size > 1) {
        // Only process connections if we have at least 2 blocks
        // Get all connections from the graph
        const connections = graph.rootStore.connectionsList.$connections.value;

        // Check each connection to see if it connects blocks that were duplicated
        connections.forEach((connection) => {
          const sourceId = connection.sourceBlockId;
          const targetId = connection.targetBlockId;

          // If both source and target blocks were duplicated, create a new connection
          if (blockIdMap.has(sourceId.toString()) && blockIdMap.has(targetId.toString())) {
            const newSourceId = blockIdMap.get(sourceId.toString());
            const newTargetId = blockIdMap.get(targetId.toString());

            // Create a new connection between the duplicated blocks
            graph.api.addConnection({
              sourceBlockId: newSourceId,
              targetBlockId: newTargetId,
              sourceAnchorId: connection.sourceAnchorId,
              targetAnchorId: connection.targetAnchorId,
              // Copy any other connection properties
              styles: connection.$state.value.styles,
              dashed: connection.$state.value.dashed,
              label: connection.$state.value.label,
            });
          }
        });
      }
    });
  }, [graph]);

  const switchNewBlockEnabled = useFn((enabled: boolean) => {
    if (enabled) {
      newBlockLayerRef.current.enable();
      setEnabled(true);
    } else {
      newBlockLayerRef.current.disable();
      setEnabled(false);
    }
  });

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">NewBlockLayer Demo</Text>
          <Text variant="body-1">
            This layer allows you to create copies of blocks using the <Hotkey value={"alt"} /> key. Hold down{" "}
            <Hotkey value={"alt"} /> and drag the block to create a copy of it.
          </Text>

          <Flex alignItems="center" gap={2}>
            <Flex alignItems="center">
              <Switch
                checked={enabled}
                onChange={() => switchNewBlockEnabled(!enabled)}
                content="Включить NewBlockLayer"
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
  title: "Examples/NewBlockLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
