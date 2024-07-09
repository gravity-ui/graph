import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { Button, ButtonProps, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import { Graph } from "../../../graph";

const config = generatePrettyBlocks(10, 10, true);

const GraphApp = () => {
  const [speed, setSpeed] = useState("1");
  const [step, setStep] = useState("0.008");

  const graphRef = useRef<Graph | undefined>(undefined);

  const onClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.setConstants({
      camera: {
        SPEED: +speed,
        STEP: +step,
      },
    });
  }, [speed, step]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <TextInput type="number" label="speed" value={speed} onUpdate={setSpeed} />
        <TextInput type="number" label="step" value={step} onUpdate={setStep} />
        <Button onClick={onClick} view="action">
          apply zoom config
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/zoomSpeed",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
