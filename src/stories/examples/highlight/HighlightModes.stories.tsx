import React, { useEffect } from "react";

import { Button, Card, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { useGraph } from "../../../react-components";
import { GraphCanvas } from "../../../react-components/GraphCanvas";
import { useHighlight } from "../../../react-components/hooks/useHighlight";

import "@gravity-ui/uikit/styles/styles.css";

const meta: Meta = {
  title: "Examples/Highlight/HighlightModes",
};
export default meta;

type Story = StoryObj;

export const Playground: Story = {
  render: () => {
    const { graph, setEntities, start, zoomTo } = useGraph({});

    useEffect(() => {
      setEntities({
        blocks: [
          { id: "A", is: "Block", x: 0, y: 0, width: 120, height: 60, name: "A", selected: false, anchors: [] },
          { id: "B", is: "Block", x: 200, y: 0, width: 120, height: 60, name: "B", selected: false, anchors: [] },
          { id: "C", is: "Block", x: 400, y: 0, width: 120, height: 60, name: "C", selected: false, anchors: [] },
        ],
      });
      start();
      zoomTo("center", { padding: 300 });
    }, [graph, setEntities, start, zoomTo]);

    const { highlight, focus, clear } = useHighlight(graph);

    return (
      <ThemeProvider theme="light">
        <Flex direction="column" gap={3} style={{ height: 480 }}>
          <Card view="outlined">
            <Flex direction="column" gap={3}>
              <Text variant="header-1">Highlight System Demo</Text>
              <Flex gap={2}>
                <Button view="action" onClick={() => highlight({ block: ["A", "C"] })}>
                  Highlight A, C
                </Button>
                <Button view="action" onClick={() => focus({ block: ["B"] })}>
                  Focus B
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
