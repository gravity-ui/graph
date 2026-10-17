import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { DuplicateBlockLayer } from "@gravity-ui/graph-duplicate-block";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { Flex, Hotkey, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { useFn } from "../../../useFn";
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

  const duplicateLayerRef = useRef<DuplicateBlockLayer | null>(null);

  useLayoutEffect(() => {
    duplicateLayerRef.current = addLayer(DuplicateBlockLayer, {});
    return () => {
      duplicateLayerRef.current?.detachLayer();
    };
  }, []);

  const [enabled, setEnabled] = useState(true);

  const switchDuplicateEnabled = useFn((addEnabled: boolean) => {
    if (addEnabled) {
      duplicateLayerRef.current?.enable();
      setEnabled(true);
    } else {
      duplicateLayerRef.current?.disable();
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
          <Text variant="header-1">DuplicateBlockLayer Demo</Text>
          <Text variant="body-1">
            This layer allows you to create copies of blocks using the <Hotkey value={"alt"} /> key. Hold down{" "}
            <Hotkey value={"alt"} /> and drag the block to create a copy of it.
          </Text>

          <Flex alignItems="center" gap={2}>
            <Flex alignItems="center">
              <Switch
                checked={enabled}
                onChange={() => switchDuplicateEnabled(!enabled)}
                content="Enable DuplicateBlockLayer"
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
  title: "Examples/DuplicateBlockLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
