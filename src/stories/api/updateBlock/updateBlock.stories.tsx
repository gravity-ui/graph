import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { Button, ButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import { Graph } from "../../../graph";
import { oneBlockConfig } from "../../configurations/oneBlock";

const config = JSON.parse(JSON.stringify(oneBlockConfig));
const blockConfig = config.blocks[0];

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);
  const [x, setX] = useState(blockConfig.x.toString());
  const [y, setY] = useState(blockConfig.y.toString());
  const [width, setWidth] = useState(blockConfig.width.toString());
  const [height, setHeight] = useState(blockConfig.height.toString());

  const onClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.updateBlock({ ...blockConfig, x: +x, y: +y, width: +width, height: +height });
  }, [x, y, width, height]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <TextInput type="number" label="x" value={x} onUpdate={setX} />
        <TextInput type="number" label="y" value={y} onUpdate={setY} />
        <TextInput type="number" label="width" value={width} onUpdate={setWidth} />
        <TextInput type="number" label="height" value={height} onUpdate={setHeight} />
        <Button onClick={onClick} view="action">
          Update block
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/updateBlock",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
