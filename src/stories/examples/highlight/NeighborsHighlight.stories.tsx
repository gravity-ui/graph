import React, { useCallback, useEffect } from "react";

import { Button, Card, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { useGraph, useGraphEvent } from "../../../react-components";
import { GraphCanvas } from "../../../react-components/GraphCanvas";
import { focusBlockNeighbors, highlightBlockNeighbors } from "../../../utils/graph";

import "@gravity-ui/uikit/styles/styles.css";

const meta: Meta = {
  title: "Examples/Highlight/Neighbors",
};
export default meta;

type Story = StoryObj;

export const ClickToHighlight: Story = {
  render: () => {
    const { graph, setEntities, start, zoomTo } = useGraph({});

    useEffect(() => {
      setEntities({
        blocks: [
          { id: "1", is: "Block", x: 0, y: 0, width: 100, height: 60, name: "Block 1", selected: false, anchors: [] },
          {
            id: "2",
            is: "Block",
            x: 200,
            y: -100,
            width: 100,
            height: 60,
            name: "Block 2",
            selected: false,
            anchors: [],
          },
          {
            id: "3",
            is: "Block",
            x: 200,
            y: 100,
            width: 100,
            height: 60,
            name: "Block 3",
            selected: false,
            anchors: [],
          },
          { id: "4", is: "Block", x: 400, y: 0, width: 100, height: 60, name: "Block 4", selected: false, anchors: [] },
          {
            id: "5",
            is: "Block",
            x: 600,
            y: -100,
            width: 100,
            height: 60,
            name: "Block 5",
            selected: false,
            anchors: [],
          },
          {
            id: "6",
            is: "Block",
            x: 600,
            y: 100,
            width: 100,
            height: 60,
            name: "Block 6",
            selected: false,
            anchors: [],
          },
        ],
        connections: [
          { id: "c1", sourceBlockId: "1", targetBlockId: "2" },
          { id: "c2", sourceBlockId: "1", targetBlockId: "3" },
          { id: "c3", sourceBlockId: "2", targetBlockId: "4" },
          { id: "c4", sourceBlockId: "3", targetBlockId: "4" },
          { id: "c5", sourceBlockId: "4", targetBlockId: "5" },
          { id: "c6", sourceBlockId: "4", targetBlockId: "6" },
        ],
      });
      start();
      zoomTo("center", { padding: 300 });
    }, [graph, setEntities, start, zoomTo]);

    // Handle block click to highlight neighbors
    useGraphEvent(
      graph,
      "click",
      useCallback(
        (detail) => {
          const target = detail.target;

          // Check if clicked on a block
          if (target && "isBlock" in target && target.isBlock && "state" in target) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blockId = (target as any).state.id;
            highlightBlockNeighbors(graph, blockId);
          } else {
            // Clicked on empty space - clear highlight
            graph.clearHighlight();
          }
        },
        [graph]
      )
    );

    return (
      <ThemeProvider theme="light">
        <Flex direction="column" gap={3} style={{ height: 600 }}>
          <Card view="outlined">
            <Flex direction="column" gap={2}>
              <Text variant="header-1">Click on any block to highlight its neighbors</Text>
              <Text variant="body-1" color="secondary">
                Click on a block to see its connected blocks and connections. Click on empty space to clear.
              </Text>
            </Flex>
          </Card>
          <div style={{ flex: 1 }}>
            <GraphCanvas graph={graph} renderBlock={() => <div />} />
          </div>
        </Flex>
      </ThemeProvider>
    );
  },
};

export const ClickToFocus: Story = {
  render: () => {
    const { graph, setEntities, start, zoomTo } = useGraph({});

    useEffect(() => {
      setEntities({
        blocks: [
          { id: "1", is: "Block", x: 0, y: 0, width: 100, height: 60, name: "Block 1", selected: false, anchors: [] },
          {
            id: "2",
            is: "Block",
            x: 200,
            y: -100,
            width: 100,
            height: 60,
            name: "Block 2",
            selected: false,
            anchors: [],
          },
          {
            id: "3",
            is: "Block",
            x: 200,
            y: 100,
            width: 100,
            height: 60,
            name: "Block 3",
            selected: false,
            anchors: [],
          },
          { id: "4", is: "Block", x: 400, y: 0, width: 100, height: 60, name: "Block 4", selected: false, anchors: [] },
          {
            id: "5",
            is: "Block",
            x: 600,
            y: -100,
            width: 100,
            height: 60,
            name: "Block 5",
            selected: false,
            anchors: [],
          },
          {
            id: "6",
            is: "Block",
            x: 600,
            y: 100,
            width: 100,
            height: 60,
            name: "Block 6",
            selected: false,
            anchors: [],
          },
        ],
        connections: [
          { id: "c1", sourceBlockId: "1", targetBlockId: "2" },
          { id: "c2", sourceBlockId: "1", targetBlockId: "3" },
          { id: "c3", sourceBlockId: "2", targetBlockId: "4" },
          { id: "c4", sourceBlockId: "3", targetBlockId: "4" },
          { id: "c5", sourceBlockId: "4", targetBlockId: "5" },
          { id: "c6", sourceBlockId: "4", targetBlockId: "6" },
        ],
      });
      start();
      zoomTo("center", { padding: 300 });
    }, [graph, setEntities, start, zoomTo]);

    // Handle block click to focus on neighbors
    useGraphEvent(
      graph,
      "click",
      useCallback(
        (detail) => {
          const target = detail.target;

          // Check if clicked on a block
          if (target && "isBlock" in target && target.isBlock && "state" in target) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blockId = (target as any).state.id;
            focusBlockNeighbors(graph, blockId);
          } else {
            // Clicked on empty space - clear highlight
            graph.clearHighlight();
          }
        },
        [graph]
      )
    );

    return (
      <ThemeProvider theme="light">
        <Flex direction="column" gap={3} style={{ height: 600 }}>
          <Card view="outlined">
            <Flex direction="column" gap={2}>
              <Text variant="header-1">Click on any block to focus on its neighbors (lowlight others)</Text>
              <Text variant="body-1" color="secondary">
                Click on a block to focus on it and its neighbors. Other blocks will be dimmed.
              </Text>
            </Flex>
          </Card>
          <div style={{ flex: 1 }}>
            <GraphCanvas graph={graph} renderBlock={() => <div />} />
          </div>
        </Flex>
      </ThemeProvider>
    );
  },
};

export const DirectionalHighlight: Story = {
  render: () => {
    const { graph, setEntities, start, zoomTo } = useGraph({});

    useEffect(() => {
      setEntities({
        blocks: [
          { id: "1", is: "Block", x: 0, y: 0, width: 100, height: 60, name: "Block 1", selected: false, anchors: [] },
          {
            id: "2",
            is: "Block",
            x: 200,
            y: -100,
            width: 100,
            height: 60,
            name: "Block 2",
            selected: false,
            anchors: [],
          },
          {
            id: "3",
            is: "Block",
            x: 200,
            y: 100,
            width: 100,
            height: 60,
            name: "Block 3",
            selected: false,
            anchors: [],
          },
          { id: "4", is: "Block", x: 400, y: 0, width: 100, height: 60, name: "Block 4", selected: false, anchors: [] },
        ],
        connections: [
          { id: "c1", sourceBlockId: "1", targetBlockId: "2" },
          { id: "c2", sourceBlockId: "1", targetBlockId: "3" },
          { id: "c3", sourceBlockId: "2", targetBlockId: "4" },
          { id: "c4", sourceBlockId: "3", targetBlockId: "4" },
        ],
      });
      start();
      zoomTo("center", { padding: 300 });
    }, [graph, setEntities, start, zoomTo]);

    const highlightIncoming = useCallback(() => {
      highlightBlockNeighbors(graph, "4", { incomingOnly: true });
    }, [graph]);

    const highlightOutgoing = useCallback(() => {
      highlightBlockNeighbors(graph, "1", { outgoingOnly: true });
    }, [graph]);

    const clear = useCallback(() => {
      graph.clearHighlight();
    }, [graph]);

    return (
      <ThemeProvider theme="light">
        <Flex direction="column" gap={3} style={{ height: 600 }}>
          <Card view="outlined">
            <Flex direction="column" gap={3}>
              <Text variant="header-1">Directional neighbor highlighting</Text>
              <Flex gap={2}>
                <Button view="action" onClick={highlightOutgoing}>
                  Block 1 → Outgoing
                </Button>
                <Button view="action" onClick={highlightIncoming}>
                  Block 4 ← Incoming
                </Button>
                <Button view="outlined" onClick={clear}>
                  Clear
                </Button>
              </Flex>
            </Flex>
          </Card>
          <div style={{ flex: 1 }}>
            <GraphCanvas graph={graph} renderBlock={() => <div />} />
          </div>
        </Flex>
      </ThemeProvider>
    );
  },
};
