import React, { useCallback, useRef, useState } from "react";

import { Button, ButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { Graph } from "../../../graph";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const GraphApp = () => {
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [width, setWidth] = useState("100");
  const [height, setHeight] = useState("100");
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("0");

  const graphRef = useRef<Graph | undefined>(undefined);

  const onClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.zoomToRect(
      { height: Number(height), width: Number(width), x: Number(x), y: Number(y) },
      { transition: Number(transition), padding: Number(padding) }
    );
  }, [height, transition, width, x, y, padding]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <Flex direction={"row"} gap={1}>
          <TextInput type="number" label="x" value={x} onUpdate={setX} />
          <TextInput type="number" label="y" value={y} onUpdate={setY} />
        </Flex>
        <Flex direction={"row"} gap={1}>
          <TextInput type="number" label="width" value={width} onUpdate={setWidth} />
          <TextInput type="number" label="height" value={height} onUpdate={setHeight} />
        </Flex>
        <TextInput type="number" label="transition" value={transition} onUpdate={setTransition} />
        <TextInput type="number" label="padding" value={padding} onUpdate={setPadding} />
        <Button onClick={onClick} view="action">
          zoomToRect
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/zoomToRect",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
