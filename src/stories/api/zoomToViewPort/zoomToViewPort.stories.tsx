import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { Button, ButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import { Graph } from "../../../graph";

const config = generatePrettyBlocks(10, 10, true);

const GraphApp = () => {
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("0");

  const graphRef = useRef<Graph | undefined>(undefined);

  const onClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.zoomToViewPort({ transition: +transition, padding: +padding });
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
