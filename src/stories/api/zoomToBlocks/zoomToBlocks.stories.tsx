import React, { useCallback, useRef, useState } from "react";

import { Button, ButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { Graph } from "../../../graph";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const GraphApp = () => {
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("0");
  const [blocksId, setBlocksId] = useState(`${String(config.blocks[0].id)}, ${String(config.blocks[10].id)}`);

  const graphRef = useRef<Graph | undefined>(undefined);

  const onClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.zoomToBlocks(blocksId.split(/,\s?/g), {
      transition: Number(transition),
      padding: Number(padding),
    });
  }, [blocksId, transition, padding]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={640} gap={2} style={{ marginBottom: "10px" }}>
        <TextInput label="Blocks ids" placeholder="1, 2, 3" value={blocksId} onUpdate={setBlocksId} />
        <TextInput type="number" label="transition" value={transition} onUpdate={setTransition} />
        <TextInput type="number" label="padding" value={padding} onUpdate={setPadding} />
        <Button onClick={onClick} view="action">
          zoomToBlocks
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/zoomToBlocks",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
