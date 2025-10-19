import React, { useCallback, useRef, useState } from "react";

import { Button, ButtonButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Graph } from "@gravity-ui/graph";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const GraphApp = () => {
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("0");

  const graphRef = useRef<Graph | undefined>(undefined);

  const onClick: ButtonButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.zoomToViewPort({ transition: Number(transition), padding: Number(padding) });
  }, [transition, padding]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <TextInput type="number" label="transition" value={transition} onUpdate={setTransition} />
        <TextInput type="number" label="padding" value={padding} onUpdate={setPadding} />
        <Button onClick={onClick} view="action">
          zoomToViewPort
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/zoomToViewPort",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
